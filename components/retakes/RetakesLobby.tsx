"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "@/components/SocketProvider";
import { useI18n } from "@/components/I18nProvider";
import { DEFAULT_UTILITY, isRoleUnique, type Side } from "@/lib/retakeLoadout";
import { mapName } from "@/lib/maps";
import { notify, playMatchFound, playServerReady, primeNotifications } from "@/lib/matchAlert";
import { useOverlay } from "@/lib/useOverlay";
import { usePlayerNames, displayNameFor } from "@/components/playerHooks";
import AvatarImage from "@/components/AvatarImage";
import { FormCard, FormLine, useRosterForm, type RecentForm } from "./PlayerForm";
import LevelBadge from "./LevelBadge";
import SafeShield from "./SafeShield";
import MapPreferences from "./MapPreferences";
import LobbyRail, { type LobbyTab } from "./lobby/LobbyRail";
import ModeBar from "./lobby/ModeBar";
import MatchesTab from "./lobby/MatchesTab";
import LiveTab from "./lobby/LiveTab";
import PartyStage from "./lobby/PartyStage";
import { claimKey, type RoleClaims } from "./lobby/RolePicker";
import RetakesIcon from "./RetakesIcon";
import MatchmakingWalkthrough from "@/components/onboarding/MatchmakingWalkthrough";
import { motion } from "framer-motion";
import "@/app/lobby/retakes-lobby.css";


// Competitive matchmaking: party, queue, accept, veto, connect.
//
// The whole screen is driven by one `rq:state` message from the socket server.
// Nothing here is derived locally and nothing is optimistic — a lobby where
// your screen and your duo's screen disagree about who is in the party is worse
// than one that takes 40ms to catch up.
//
// The only local state is the clock. Deadlines arrive as absolute timestamps so
// a tab that was backgrounded shows the right number the moment it wakes,
// rather than a countdown that drifted while nobody was looking at it.

type Member = { steamId: string; name: string | null; ready: boolean; elo?: number; matches?: number };
type MatchPlayer = {
  steamId: string; name: string | null; bot: boolean; accepted: boolean; leader: boolean;
  elo?: number; matches?: number;
  /** Which party this player queued with; null when they queued alone. */
  premade?: number | null;
};
type VetoAction = { type: "ban" | "side"; team: number; map?: string; side?: string; auto: boolean; at: number };

/** The mode buttons and the toggles beside them, as the server describes them. */
type ModesInfo = {
  sizes: { id: string; teamSize: number }[];
  size: string;
  premium: boolean;
  testing: boolean;
  premiumAvailable: boolean;
  botFillMs: number;
};

/** The captain's map preference for this lobby, pre-filled from their account. */
type MapState = { pool: string[]; excluded: string[]; max: number; touched: boolean };

/** How the hand-off to the game server is going. */
type ServerStatus = {
  state: "idle" | "starting" | "ready" | "failed";
  step: string | null;
  error: string | null;
};

type State = {
  modes: ModesInfo;
  party: {
    id: string;
    leader: string;
    isLeader: boolean;
    name?: string | null;
    /** Which queue this party is set to, not whether it is searching. */
    queue: string;
    capacity: number;
    elo?: number;
    members: Member[];
    queuedAt: number | null;
    queueReason: string | null;
    safeQueue: boolean;
    maps: MapState;
  } | null;
  invite: { partyId: string; from: string; fromName: string | null; at: number } | null;
  /** Present only while searching. */
  search: {
    queue: string;
    label: string;
    since: number;
    searching: number;
    needed: number;
    bots: boolean;
    botFillAt: number | null;
  } | null;
  match: {
    id: string;
    queue: string;
    queueLabel: string;
    phase: "found" | "veto" | "ready";
    yourTeam: number | null;
    teams: { index: number; name: string; side: string | null; players: MatchPlayer[] }[];
    accept: { deadline: number; total: number; done: number } | null;
    veto: {
      pool: string[];
      actions: VetoAction[];
      turn: number;
      turnDeadline: number | null;
      yourTurn: boolean;
      remaining: string[];
      step: number;
      plan: { type: string }[];
    } | null;
    result: {
      map: string;
      connect: string | null;
      /** Where the draft, the veto and the server live now. */
      matchUrl?: string | null;
      sides: (string | null)[];
      server: ServerStatus;
    } | null;
    chat: { from: string; name: string | null; text: string; at: number; team?: number | null }[];
  } | null;
  online: number;
};

type Friend = { friendId: string; name: string; avatarUrl: string | null; status: string };

type T = (k: string, v?: Record<string, string | number>) => string;

/**
 * A queue's name in the reader's language, falling back to the server's own.
 *
 * The three queues are translated; a fourth added on the server before it is
 * added to the dictionaries should read as its English label rather than as the
 * key, which is what `t()` alone would give.
 */
function queueName(t: T, id: string, fallback?: string | null) {
  const key = `lobby.queue.${id}`;
  const label = t(key);
  return label === key ? fallback ?? id : label;
}

/** The steps of the hand-off to the game server, in the order the server takes them. */
const SERVER_STEPS = ["map", "loading", "roster", "go"];

/** A ticking `now`, so every deadline on screen counts down from one clock. */
function useNow(active: boolean) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setT(Date.now()), 250);
    return () => clearInterval(i);
  }, [active]);
  return t;
}

const secondsTo = (deadline: number | null | undefined, now: number) =>
  deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function RetakesLobby({ signedIn, lobbyId }: { signedIn: boolean, lobbyId?: string }) {
  const { t } = useI18n();
  const { socket, isAuthed, steamId } = useSocket();

  const [state, setState] = useState<State | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ kind: string; text: string } | null>(null);
  const [safeScores, setSafeScores] = useState<{ steamId: string, score: number, probation: boolean }[]>([]);
  const [tab, setTab] = useState<LobbyTab>("play");
  /**
   * Whether this account has been through the loadout picker.
   *
   * Null while it is being read — the Play button is not disabled on a guess,
   * because a button that is dead for the first second of every visit is worse
   * than one that is briefly optimistic. The server refuses the queue either
   * way; see rq:queue:join.
   */
  const [pendingInvites, setPendingInvites] = useState<{ id: string, name: string, expiresAt: number }[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [partyLoadouts, setPartyLoadouts] = useState<Record<string, { roleT: string, roleCt: string, isCaller: boolean, weapons: any, utility: any, notes: string }>>({});
  const [savingRole, setSavingRole] = useState(false);

  const allIds = useMemo(() => {
    const ids = new Set<string>();
    state?.party?.members.forEach((m) => ids.add(m.steamId));
    state?.match?.teams.forEach((t) => t.players.forEach((p) => ids.add(p.steamId)));
    if (state?.invite?.from) ids.add(String(state.invite.from));
    return Array.from(ids);
  }, [state?.party, state?.match, state?.invite]);
  // The inviter is included: an invite can arrive from somebody who is in no
  // party and no match yet, so they would otherwise not be in the list the
  // resolver is asked about, and their name would never load.
  const names = usePlayerNames(allIds);

  useEffect(() => {
    const i = setInterval(() => {
       setPendingInvites(p => p.filter(inv => inv.expiresAt > Date.now()));
    }, 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!state?.party?.members) return;
    const ids = state.party.members.map((m: any) => m.steamId);
    if (ids.length > 0) {
      let active = true;
      // These two used to point at /api/users/avatars and
      // /api/users/safe-scores, neither of which has ever existed — both 404'd
      // into a .catch() on every party change, so the avatars were always the
      // fallback letter and the safety shield never appeared once.
      //
      // The avatar fetch that used to sit here wrote to a `avatarPlayers` state
      // nothing ever read — the faces come from usePlayerNames, which already
      // fetches them once for the whole screen. It was a request per party
      // change for a value that was thrown away.
      //
      // /api/safe-queue/status answers for the signed-in account only, which
      // cannot draw a shield beside somebody else — hence the /scores route.
      fetch("/api/safe-queue/scores?ids=" + ids.join(","))
        .then((r) => (r.ok ? r.json() : {}))
        .then((map: Record<string, { score: number; probation: boolean }>) => {
          if (!active) return;
          setSafeScores(
            Object.entries(map ?? {}).map(([steamId, v]) => ({
              steamId,
              score: v.score,
              probation: v.probation,
            }))
          );
        })
        .catch(() => {});
      
      Promise.all(ids.map(async (id: string) => {
         try {
           const res = await fetch(`/api/loadout?steamId=${id}`);
           if (res.ok) return await res.json();
         } catch {}
         return null;
      })).then(results => {
         if (!active) return;
         const next: Record<string, any> = {};
         results.forEach((r: any) => {
           if (r) next[r.steamId] = r;
         });
         setPartyLoadouts(prev => ({ ...prev, ...next }));
      });

      return () => { active = false; };
    }
  }, [state?.party?.members]);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [hideMatchRoom, setHideMatchRoom] = useState(false);

  const party = state?.party ?? null;
  const match = state?.match ?? null;

  useEffect(() => {
    if (!match) setHideMatchRoom(false);
  }, [match?.id]);

  /**
   * The two moments worth interrupting somebody for, and neither had a sound.
   *
   * Keyed on the transition rather than the state: `rq:state` is a full
   * snapshot pushed on every change in the lobby, so reacting to the value
   * would fire the chime on every chat message for as long as the match
   * stayed ready.
   */
  const alerted = useRef<{ found?: string; ready?: string }>({});
  useEffect(() => {
    if (!match) return;

    if (match.phase === "found" && alerted.current.found !== match.id) {
      alerted.current.found = match.id;
      playMatchFound();
      notify(t("lobby.alert.found"), t("lobby.alert.foundBody"), "rq-found");
    }

    if (match.result?.server?.state === "ready" && alerted.current.ready !== match.id) {
      alerted.current.ready = match.id;
      playServerReady();
      notify(
        t("lobby.alert.ready"),
        t("lobby.alert.readyBody", { map: mapName(match.result.map) }),
        "rq-ready"
      );
    }
  }, [match?.id, match?.phase, match?.result?.server?.state, t]);
  const now = useNow(Boolean(state?.search || match));

  const partyForms = useRosterForm(party?.members.map((m: any) => m.steamId) ?? []);


  // Both takeovers cover the screen, so the friends launcher has to stand down
  // — it is position:fixed and mounted app-wide, and was otherwise floating on
  // top of the accept timer.
  useOverlay(Boolean((match?.phase === "found" && match.accept) || state?.invite));

  // ------------------------------------------------------------------ socket

  useEffect(() => {
    if (!socket || !isAuthed) return;
    socket.emit("rq:hello", { lobbyId });

    const onState = (s: State) => setState(s);
    const onNotice = (n: { kind: string; code: string; fromName?: string | null; toName?: string | null }) => {
      setNotice({ kind: n.kind, text: t(`lobby.notice.${n.code}`, { name: n.fromName ?? n.toName ?? "" }) });
    };

    socket.on("rq:state", onState);
    socket.on("rq:notice", onNotice);
    return () => {
      socket.off("rq:state", onState);
      socket.off("rq:notice", onNotice);
    };
  }, [socket, isAuthed, t]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!steamId) return;
    fetch("/api/friends", { headers: { Authorization: `Bearer ${steamId}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setFriends(Array.isArray(d) ? d.filter((f: Friend) => f.status === "ACCEPTED") : []))
      .catch(() => setFriends([]));
  }, [steamId]);

  useEffect(() => {
    if (!socket) return;
    const sync = (list: string[]) => setOnline(list);
    const up = ({ steamId: id }: { steamId: string }) => setOnline((p) => Array.from(new Set([...p, id])));
    const down = ({ steamId: id }: { steamId: string }) => setOnline((p) => p.filter((x) => x !== id));
    socket.on("online_friends_sync", sync);
    socket.on("user_online", up);
    socket.on("user_offline", down);
    socket.emit("get_online_users");
    return () => {
      socket.off("online_friends_sync", sync);
      socket.off("user_online", up);
      socket.off("user_offline", down);
    };
  }, [socket]);

  const send = useCallback(
    (event: string, payload?: unknown) => socket?.emit(event, payload ?? {}),
    [socket]
  );

  // --------------------------------------------------------------- derived UI

  const queueId = party?.queue ?? "";
  /** Fallback for the first render, before rq:state has landed. */
  const modes = state?.modes ?? {
    sizes: [{ id: "duo", teamSize: 2 }, { id: "trio", teamSize: 3 }],
    size: "trio",
    premium: false,
    testing: false,
    premiumAvailable: false,
    botFillMs: 15000,
  };

  const onlineFriends = useMemo(
    () => friends.filter((f) => online.includes(f.friendId)),
    [friends, online]
  );
  const inPartyIds = useMemo(() => new Set((party?.members ?? []).map((m) => m.steamId)), [party]);
  /** Friends who are online and not already in the party. */
  const invitable = useMemo(
    () => onlineFriends.filter((f) => !inPartyIds.has(f.friendId)),
    [onlineFriends, inPartyIds]
  );

  /**
   * Who has claimed what, and where that is not allowed.
   *
   * One pass produces all three, because they are the same walk over the party:
   * `claims` is what the role bubble greys out, `callers` is the mic, and
   * `conflicts` is what stops the queue. Which roles may only be held once is
   * `isRoleUnique` — it used to be two string arrays written out here, so the
   * lobby and the roles themselves could disagree about the rule, and adding a
   * sixth role meant remembering to come back to this memo.
   *
   * The two that are not capped are on purpose: a retake wants more than one
   * rifler and more than one rotator, and blocking those would be blocking the
   * normal answer.
   */
  const { claims, callers, conflicts } = useMemo(() => {
    const claims: RoleClaims = {};
    const callers: string[] = [];
    const conflicts: string[] = [];
    if (!party) return { claims, callers, conflicts };

    party.members.forEach((m) => {
      const l = partyLoadouts[m.steamId];
      if (!l) return;
      const who =
        m.steamId === steamId
          ? "you"
          : displayNameFor(m.steamId, names, { isBot: false }) ?? m.name ?? t("lobby.player");
      if (l.isCaller) callers.push(who);
      (["T", "CT"] as Side[]).forEach((side) => {
        const id = side === "T" ? l.roleT : l.roleCt;
        if (!id) return;
        const key = claimKey(side, id);
        (claims[key] ??= []).push(who);
      });
    });

    if (callers.length > 1) conflicts.push(t("lobby.role.conflictCaller"));
    Object.entries(claims).forEach(([key, held]) => {
      const [side, id] = key.split(":");
      if (held.length > 1 && isRoleUnique(id)) {
        conflicts.push(
          t("lobby.role.conflictRole", {
            role: t(`role.${id}.name`),
            side: t(`loadout.side.${side}`),
          })
        );
      }
    });

    return { claims, callers, conflicts };
  }, [party, partyLoadouts, steamId, names, t]);


  /**
   * The party as seats, with you in one of them even before the socket answers.
   *
   * `rq:state` decides who is in the party, and until it lands `party` is null.
   * Falling back to an empty list drew a stage of nothing but empty slots while
   * the header beside it already said 1/2 — the count and the seats disagreeing
   * about whether you exist. You are always in your own party, so the fallback
   * is a seat for you rather than one fewer gap.
   */
  const seats = useMemo(() => {
    const members =
      party?.members ??
      (steamId ? [{ steamId, name: null as string | null, ready: false } as Member] : []);

    return members.map((m) => ({
      steamId: m.steamId,
      name: displayNameFor(m.steamId, names, { isBot: false }) ?? m.name ?? t("lobby.player"),
      avatar: names[m.steamId]?.avatar ?? undefined,
      leader: party ? m.steamId === party.leader : true,
      me: m.steamId === steamId,
      elo: m.elo,
      matches: m.matches,
      safe: safeScores.find((x) => x.steamId === m.steamId),
      form: partyForms[m.steamId],
      role: {
        roleT: partyLoadouts[m.steamId]?.roleT ?? "",
        roleCt: partyLoadouts[m.steamId]?.roleCt ?? "",
        isCaller: partyLoadouts[m.steamId]?.isCaller ?? false,
      },
    }));
  }, [party, steamId, names, safeScores, partyForms, partyLoadouts, t]);

  const updateMyLoadout = async (changes: any) => {
    if (!steamId || savingRole) return;
    const myL = partyLoadouts[steamId] || { roleT: "", roleCt: "", isCaller: false, weapons: {}, utility: DEFAULT_UTILITY, notes: "" };
    const nextL = { ...myL, ...changes };
    setPartyLoadouts(prev => ({ ...prev, [steamId]: nextL }));
    setSavingRole(true);
    try {
       await fetch("/api/loadout", {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(nextL)
       });
    } catch {}
    setSavingRole(false);
  };

  if (!signedIn) {
    return (
      <div className="rq">
        <section className="rq-gate">
          <span className="rq-kicker">{t("lobby.kicker")}</span>
          <h1>{t("lobby.title")}</h1>
          <p className="muted">{t("lobby.signinblurb")}</p>
          <a className="btn btn-primary rq-cta" href="/api/auth/steam/login">
            {t("lobby.signin")}
          </a>
        </section>
      </div>
    );
  }

  // ------------------------------------------------------------------ screens

  // The accept prompt is a takeover on purpose: it is twenty seconds long and
  // missing it costs five other people their match.
  if (match?.phase === "found" && match.accept && !hideMatchRoom) {
    const me = match.teams.flatMap((x) => x.players).find((p) => p.steamId === steamId);
    const left = secondsTo(match.accept.deadline, now);
    return (
      <div className="rq-takeover">
        <div className="rq-found">
          <span className="rq-found-kicker">{t("lobby.matchfound")}</span>
          <div className="rq-found-ring" style={{ ["--p" as string]: `${(left / 20) * 100}%` }}>
            <span>{left}</span>
          </div>
          <div className="rq-accept-bar">
            <div style={{ width: `${(match.accept.done / Math.max(1, match.accept.total)) * 100}%` }} />
          </div>
          <p className="rq-accept-count">
            {t("lobby.accepted", { done: match.accept.done, total: match.accept.total })}
          </p>
          {me?.accepted ? (
            <button className="btn btn-secondary rq-cta" disabled>
              {t("lobby.waitingothers")}
            </button>
          ) : (
            <div className="rq-found-actions">
              <button className="btn btn-primary rq-cta" onClick={() => send("rq:match:accept")}>
                {t("lobby.accept")}
              </button>
              <button className="btn btn-ghost" onClick={() => send("rq:match:decline")}>
                {t("lobby.decline")}
              </button>
              <button className="btn btn-ghost" onClick={() => setHideMatchRoom(true)}>
                Leave Game
              </button>
            </div>
          )}
          {me?.accepted && (
            <div style={{ marginTop: "12px" }}>
              <button className="btn btn-ghost" onClick={() => setHideMatchRoom(true)}>
                Leave Game
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (match && (match.phase === "veto" || match.phase === "ready") && !hideMatchRoom) {
    return (
      <div className="rq">
        <MatchRoom
          match={match}
          me={steamId ?? ""}
          now={now}
          onBan={(m) => send("rq:veto:ban", { map: m })}
          onSide={(s) => send("rq:veto:side", { side: s })}
          onChat={(text, teamOnly) => send("rq:chat", { text, teamOnly })}
          names={names}
          t={t}
          onLeave={() => setHideMatchRoom(true)}
        />
        {notice && <div className={`rq-toast ${notice.kind}`}>{notice.text}</div>}
      </div>
    );
  }

  const search = state?.search ?? null;
  const botIn = search?.botFillAt ? secondsTo(search.botFillAt, now) : 0;
  // A minute in a queue with nobody else in it is long enough to wonder whether
  // the button worked. It did; there is simply nobody there.
  const waitedLong = Boolean(search && now - search.since > 60_000);

  return (
    <div className="rq">
      <MatchmakingWalkthrough signedIn={signedIn} />
      <section className="rq-hero">
        <span className="rq-kicker">{t("lobby.kicker")}</span>
        <h1>{t("lobby.title")}</h1>
        <p className="muted">{t("lobby.blurb")}</p>
      </section>

      <div className="rq-shell">
        <LobbyRail
          tab={tab}
          onTab={setTab}
          badges={{
            play: party ? party.members.length : null,
            maps: party?.maps?.excluded?.length ? party.maps.excluded.length : null,
          }}
        />

      {/* ---------------------------------------------------- the stage ---
          Players in the middle, the button under them, the options in a row
          under that. It was a 300px column of names on the left and a panel of
          controls on the right, which put the least prominent element of the
          page on the thing the page is for. */}
      <div className="rq-stage" style={{ display: tab === "play" ? "flex" : "none" }}>
        <div className="rq-stage-head">
          <div className="rq-stage-id">
            <h2>{t("lobby.party")}</h2>
            <span className="rq-count">
              {party?.members.length ?? 1}/{party?.capacity ?? 2}
            </span>
            {party && party.members.length >= Math.ceil(party.capacity * (2 / 3)) && (
              editingName ? (
                <input
                  className="rq-stage-nameinput"
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => {
                    setEditingName(false);
                    if (draftName !== party.name) send("rq:party:name", { name: draftName });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setEditingName(false);
                      if (draftName !== party.name) send("rq:party:name", { name: draftName });
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="rq-stage-name"
                  disabled={!party.isLeader}
                  onClick={() => {
                    if (!party.isLeader) return;
                    setDraftName(party.name || "");
                    setEditingName(true);
                  }}
                >
                  {party.name || t("lobby.stage.unnamed")}
                  {party.isLeader && <span aria-hidden>✎</span>}
                </button>
              )
            )}
          </div>

          <button type="button" className="rq-stage-report" onClick={() => setReportOpen(true)}>
            {t("lobby.stage.report")}
          </button>
        </div>

        <PartyStage
          seats={seats}
          capacity={party?.capacity ?? 2}
          pending={pendingInvites}
          claims={claims}
          callers={callers}
          canKick={Boolean(party?.isLeader)}
          canInvite={Boolean(party?.isLeader)}
          invitable={invitable.map((f) => ({ friendId: f.friendId, name: f.name }))}
          noFriendsNote={
            friends.length === 0
              ? t("lobby.nofriends")
              : onlineFriends.length === 0
                ? t("lobby.nofriendsonline")
                : t("lobby.allfriendsinparty")
          }
          onRole={(next) => updateMyLoadout(next)}
          onKick={(id) => send("rq:party:kick", { steamId: id })}
          onInvite={(f) => {
            send("rq:party:invite", { steamId: f.friendId, name: f.name });
            setPendingInvites((p) => [
              ...p,
              { id: f.friendId, name: f.name, expiresAt: Date.now() + 10000 },
            ]);
          }}
          onCopyLink={() =>
            navigator.clipboard.writeText(`${window.location.origin}/lobby/${lobbyId}`)
          }
        />

        {party && !party.isLeader && <p className="rq-hint">{t("lobby.leaderqueues")}</p>}

        {/* The queue is blocked, so the reason is next to the button that is
            refusing rather than in a panel elsewhere. Shown to everyone: the
            person who has to change a role is usually not the captain. */}
        {conflicts.length > 0 && (
          <div className="rq-conflict" role="alert">
            <strong>{t("lobby.role.conflictTitle")}</strong>
            <ul>
              {conflicts.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {search ? (
          <div className="rq-searching">
            <div className="rq-radar" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <h2>{t("lobby.searching")}</h2>
            <div className="rq-timer">{clock(now - search.since)}</div>
            <p className="muted">
              {t("lobby.inqueue", { n: search.searching, mode: queueName(t, search.queue, search.label) })}
            </p>
            {search.bots ? (
              /* Said plainly rather than pretending a full lobby is imminent:
                 in the training queue the honest answer is always bots. */
              <p className="rq-botfill">
                {botIn > 0 ? t("lobby.botfillin", { n: botIn }) : t("lobby.botfillnow")}
              </p>
            ) : (
              <>
                {/* No bots are coming to this one. What it is waiting for is
                    people, so it says how many and how many it has. */}
                <p className="rq-waiting">
                  {t("lobby.waitingplayers", { n: search.searching, needed: search.needed })}
                </p>
                {waitedLong && <p className="rq-waiting hint">{t("lobby.waitinglong")}</p>}
              </>
            )}
            <button className="btn btn-ghost" onClick={() => send("rq:queue:leave")}>
              {t("lobby.cancel")}
            </button>
          </div>
        ) : (
          <>
            <div className="rq-actions">
              <button
                data-tutorial="queue-play"
                className="btn btn-primary rq-play"
                disabled={match ? false : !party?.isLeader || conflicts.length > 0}
                onClick={() => {
                  if (match) {
                    setHideMatchRoom(false);
                    return;
                  }
                  // Asked here rather than on mount: a prompt that appears
                  // the moment a page loads is the one everybody dismisses,
                  // and a dismissed prompt cannot be asked again.
                  primeNotifications();
                  send("rq:queue:join", {});
                }}
              >
                {match ? (
                  <>
                    <RetakesIcon id="matchroom" size={16} />
                    {t("lobby.matchroom")}
                  </>
                ) : conflicts.length > 0 ? (
                  t("lobby.fixroles")
                ) : (
                  t("lobby.findmatch")
                )}
              </button>

              {party && party.members.length > 1 && !match && (
                <button className="btn btn-secondary" onClick={() => send("rq:party:leave")}>
                  <RetakesIcon id="leave" size={15} />
                  {t("lobby.leaveparty")}
                </button>
              )}
            </div>

            {/* Everything you can change about the queue, on one line under
                the button, and the maps you never want on the next. */}
            <ModeBar
              modes={modes}
              canChange={Boolean(party?.isLeader) && !match}
              partySize={party?.members.length ?? 1}
              onChange={(next) => send("rq:party:queue", next)}
              inline
            />

            <div className="rq-stage-maps">
              <MapPreferences
                variant="row"
                value={party?.maps?.excluded ?? []}
                busy={!party?.isLeader}
                onChange={(excluded) => send("rq:party:maps", { excluded })}
              />
            </div>

            <p className="rq-online">{t("lobby.onlinenow", { n: state?.online ?? 0 })}</p>
          </>
        )}
      </div>

      {tab === "maps" && (
        <section className="panel rq-tabpanel">
          <header className="rq-panel-head">
            <h2>{t("loadout.maps.title")}</h2>
          </header>
          <MapPreferences
            value={party?.maps?.excluded ?? []}
            busy={!party?.isLeader}
            onChange={(excluded) => send("rq:party:maps", { excluded })}
            onSave={(excluded) => send("rq:party:maps", { excluded, save: true })}
          />
        </section>
      )}

      {tab === "matches" && (
        <section className="panel rq-tabpanel">
          <header className="rq-panel-head">
            <h2>{t("lobby.rail.matches")}</h2>
          </header>
          <MatchesTab steamId={steamId} />
        </section>
      )}

      {tab === "live" && (
        <section className="panel rq-tabpanel">
          <header className="rq-panel-head">
            <h2>{t("lobby.rail.live")}</h2>
          </header>
          <LiveTab />
        </section>
      )}
      </div>

      {state?.invite && (
        <InviteModal invite={state.invite} send={send} t={t} names={names} />
      )}

      {notice && <div className={`rq-toast ${notice.kind}`}>{notice.text}</div>}

      {reportOpen && (
        <div className="modal-scrim" onClick={() => setReportOpen(false)}>
           <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: 'var(--color-bg)', padding: '24px', borderRadius: '12px', maxWidth: '400px', width: '100%', zIndex: 9999 }}>
              <h2 style={{ margin: '0 0 16px' }}>Report Lobby</h2>
              <textarea 
                 value={reportText} 
                 onChange={e => setReportText(e.target.value)}
                 placeholder="Please provide details about the report..."
                 style={{ width: '100%', height: '100px', padding: '8px', background: 'var(--color-surface)', border: '1px solid var(--color-divider)', color: 'white', borderRadius: '4px', resize: 'none' }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                 <button className="btn btn-ghost" onClick={() => setReportOpen(false)}>Cancel</button>
                 <button className="btn btn-primary" onClick={async () => {
                    try {
                       await fetch("/api/tickets", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${steamId}` },
                          body: JSON.stringify({ message: `Report against Retakes party ${party?.leader}:\n${reportText}`, category: "REPORT" })
                       });
                       setReportOpen(false);
                       setReportText("");
                       alert("Report submitted successfully.");
                    } catch(e) {}
                 }}>Submit Report</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- match room

function MatchRoom({
  match,
  me,
  now,
  onBan,
  onSide,
  onChat,
  names,
  t,
  onLeave,
}: {
  match: NonNullable<State["match"]>;
  me: string;
  now: number;
  onBan: (map: string) => void;
  onSide: (side: string) => void;
  onChat: (text: string, teamOnly: boolean) => void;
  names: Record<string, any>;
  t: (k: string, v?: Record<string, string | number>) => string;
  onLeave: () => void;
}) {
  const [teamChatDraft, setTeamChatDraft] = useState("");
  const [globalChatDraft, setGlobalChatDraft] = useState("");
  const [chatCard, setChatCard] = useState<{ steamId: string; rect: DOMRect } | null>(null);

  // Split once. Re-filtering inline gave each ChatBox a freshly-built array on
  // every render, so its scroll effect fired whether or not anything had been
  // said — which is what kept dragging the log back to the bottom mid-read.
  const teamChat = useMemo(() => match.chat.filter((c) => c.team != null), [match.chat]);
  const globalChat = useMemo(() => match.chat.filter((c) => c.team == null), [match.chat]);

  const openChatCard = useCallback((steamId: string, e: React.MouseEvent) => {
    setChatCard({ steamId, rect: e.currentTarget.getBoundingClientRect() });
  }, []);
  // One request for the whole roster: six calls fired the instant a match is
  // found is exactly when the page has other things to do.
  const forms = useRosterForm(match.teams.flatMap((tm) => tm.players.map((p) => p.steamId)));

  const veto = match.veto;
  const ready = match.phase === "ready";
  const left = secondsTo(veto?.turnDeadline, now);
  const step = veto?.plan[veto.step];
  const sideStep = step?.type === "side";
  const banned = new Map((veto?.actions ?? []).filter((a) => a.type === "ban").map((a) => [a.map as string, a]));

  const getTeamName = (teamIdx: 0 | 1) => {
    let name = match.teams[teamIdx].name;
    if (name === "Team A" || name === "Team B") {
      const leader = match.teams[teamIdx].players.find(p => p.leader) || match.teams[teamIdx].players[0];
      if (leader) name = leader.name + "'s Team";
    }
    return name;
  };
  let t0Name = getTeamName(0);
  let t1Name = getTeamName(1);
  if (t0Name === t1Name) {
    t1Name += " 2";
  }

  return (
    <div className="rq-room">
      <header className="rq-room-head" style={{ position: "relative" }}>
        <button 
          className="btn btn-ghost" 
          onClick={onLeave} 
          style={{ position: "absolute", top: -20, right: 0, fontSize: "12px", opacity: 0.7 }}
        >
          Leave Game
        </button>
        <TeamHead team={match.teams[0]} nameOverride={t0Name} mine={match.yourTeam === 0} align="left" t={t} />
        <div className="rq-room-status">
          {ready ? (
            <>
              <span className="rq-phase ready">{t("lobby.matchready")}</span>
              <span className="muted">{queueName(t, match.queue, match.queueLabel)}</span>
            </>
          ) : (
            <>
              <span className="rq-phase">
                {sideStep ? t("lobby.sidepick") : t("lobby.vetophase")}
              </span>
              <span className={`rq-turn ${veto?.yourTurn ? "mine" : ""}`}>
                {veto?.yourTurn
                  ? sideStep
                    ? t("lobby.yourside")
                    : t("lobby.yourban")
                  : t("lobby.teamturn", { team: match.teams[veto?.turn ?? 0].name })}
              </span>
              <div className="rq-turnbar">
                <div style={{ width: `${(left / 25) * 100}%` }} />
              </div>
            </>
          )}
        </div>
        <TeamHead team={match.teams[1]} nameOverride={t1Name} mine={match.yourTeam === 1} align="right" t={t} />
      </header>

      <div className="rq-room-body">
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Roster team={match.teams[0]} me={me} align="left" forms={forms} names={names} t={t} />
          {/* Your own column carries team chat; the other one carries global.
              The team filter is just "has a team": the server only ever sends a
              viewer their own side's lines, so matching on the index as well
              would be a second, weaker copy of a check already made. */}
          {match.yourTeam === 0 ? (
            <ChatBox messages={teamChat} draft={teamChatDraft} setDraft={setTeamChatDraft} onSend={(text) => onChat(text, true)} placeholder="Team chat" t={t} names={names} me={me} onPlayerClick={openChatCard} />
          ) : match.yourTeam === 1 ? (
            <ChatBox messages={globalChat} draft={globalChatDraft} setDraft={setGlobalChatDraft} onSend={(text) => onChat(text, false)} placeholder="Global chat" t={t} names={names} me={me} onPlayerClick={openChatCard} />
          ) : null}
        </div>

        <div className="rq-center">
          {ready && match.result ? (
            <div className="rq-ready">
              <div className="rq-ready-map">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/maps/${match.result.map}.webp`} alt={mapName(match.result.map)} />
                <span className="rq-ready-name">{mapName(match.result.map)}</span>
              </div>
              <div className="rq-sides">
                {match.teams.map((t) => (
                  <div key={t.index} className="rq-team-side">
                    <span className="rq-team">{t.name}</span> starts <span className={`rq-${t.side}`}>{t.side}</span>
                  </div>
                ))}
              </div>
              {/* Three states, and the third one is the point: a start that
                  failed says so instead of spinning until people leave. The
                  connect string only ever appears alongside a server that has
                  confirmed it is on the map and has taken the roster. */}
              <div className="rq-connect-wrapper" style={{ minHeight: "80px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {match.result.matchUrl ? (
                  /* The lobby's job ends here.
                     The role draft, the map veto and the server all happen on
                     the match page — the same page a tournament match uses, so
                     a pickup game and a bracket game are the same thing from
                     this point on. No server is held yet, deliberately: nothing
                     should occupy one while people are still picking maps. */
                  <div className="rq-connect">
                    <a className="btn btn-primary rq-connect-go" href={match.result.matchUrl}>
                      <RetakesIcon id="connect" size={18} />
                      {t("lobby.go_to_match")}
                    </a>
                    <div className="rq-connect-ip">
                      <span className="muted">{t("lobby.match_next_steps")}</span>
                    </div>
                  </div>
                ) : match.result.connect ? (
                  /* Connect first and biggest. Everything else on this screen
                     is over — the veto is decided, the server has taken the
                     roster — and the only thing left to do is join. */
                  <div className="rq-connect">
                    <a className="btn btn-primary rq-connect-go" href={`steam://connect/${match.result.connect}`}>
                      <RetakesIcon id="connect" size={18} />
                      {t("lobby.join_server")}
                    </a>
                    <div className="rq-connect-ip">
                      <code>connect {match.result.connect}</code>
                      <button
                        className="btn btn-ghost"
                        onClick={() => navigator.clipboard?.writeText(`connect ${match.result!.connect}`)}
                      >
                        {t("lobby.copyconnect")}
                      </button>
                    </div>
                  </div>
                ) : match.result.server?.state === "failed" ? (
                  <div className="rq-server-failed" role="alert">
                    <strong>{t("lobby.server.failed")}</strong>
                    {/* The reason in words, not just the slug. `rcon_error` is
                        a thing to report; "the server did not answer" is a
                        thing to act on, and the two failures a player can do
                        something about — the wrong map, a server still
                        loading — read completely differently from the two they
                        cannot. The slug stays underneath for the bug report. */}
                    <p>{t(`lobby.server.reason.${match.result.server.error ?? "unknown"}`)}</p>
                    <code>
                      {match.result.server.step ?? "?"} · {match.result.server.error ?? "?"}
                    </code>
                  </div>
                ) : (
                  <div className="rq-server">
                    <div className="rq-server-steps" aria-hidden>
                      {SERVER_STEPS.map((s, i) => {
                        const at = SERVER_STEPS.indexOf(match.result?.server?.step ?? "map");
                        return (
                          <span
                            key={s}
                            className={`rq-server-pip ${i < at ? "done" : ""} ${i === at ? "now" : ""}`}
                          />
                        );
                      })}
                    </div>
                    <span className="rq-server-label">
                      {t(`lobby.server.step.${match.result.server?.step ?? "map"}`)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="rq-maps">
                {(veto?.pool ?? []).map((m) => {
                  const ban = banned.get(m);
                  const isLast = veto?.remaining.length === 1 && veto.remaining[0] === m;
                  return (
                    <button
                      key={m}
                      className={`rq-map ${ban ? "banned" : ""} ${isLast ? "picked" : ""}`}
                      disabled={!!ban || !veto?.yourTurn || sideStep}
                      onClick={() => onBan(m)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/maps/${m}.webp`} alt="" loading="lazy" />
                      <span className="rq-map-name">{mapName(m)}</span>
                      {ban && (
                        <span className="rq-map-ban">
                          {t("lobby.bannedby", { team: match.teams[ban.team].name })}
                        </span>
                      )}
                      {isLast && <span className="rq-map-pick">{t("lobby.decider")}</span>}
                    </button>
                  );
                })}
              </div>

              {sideStep && (
                <div className="rq-sidepick">
                  <p>{veto?.yourTurn ? t("lobby.picksideprompt") : t("lobby.waitingside")}</p>
                  <div className="rq-found-actions">
                    <button className="btn btn-primary" disabled={!veto?.yourTurn} onClick={() => onSide("CT")}>
                      {t("lobby.startct")}
                    </button>
                    <button className="btn btn-secondary" disabled={!veto?.yourTurn} onClick={() => onSide("T")}>
                      {t("lobby.startt")}
                    </button>
                  </div>
                </div>
              )}

              {(veto?.actions.length ?? 0) > 0 && (
                <ol className="rq-log">
                  {veto!.actions.map((a, i) => (
                    <li key={i}>
                      <span className={`rq-log-team t${a.team}`}>{match.teams[a.team].name}</span>{" "}
                      {a.type === "ban"
                        ? t("lobby.logban", { map: mapName(a.map!) })
                        : t("lobby.logside", { side: a.side! })}
                      {a.auto && <span className="muted"> · {t("lobby.autotaken")}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Roster team={match.teams[1]} me={me} align="right" forms={forms} names={names} t={t} />
          {match.yourTeam === 1 ? (
            <ChatBox messages={teamChat} draft={teamChatDraft} setDraft={setTeamChatDraft} onSend={(text) => onChat(text, true)} placeholder="Team chat" t={t} names={names} me={me} onPlayerClick={openChatCard} />
          ) : match.yourTeam === 0 ? (
            <ChatBox messages={globalChat} draft={globalChatDraft} setDraft={setGlobalChatDraft} onSend={(text) => onChat(text, false)} placeholder="Global chat" t={t} names={names} me={me} onPlayerClick={openChatCard} />
          ) : null}
        </div>
      </div>
      {chatCard && (
        <FormCard
          form={forms[chatCard.steamId]}
          name={displayNameFor(chatCard.steamId, names, { isBot: false }) ?? match.teams.flatMap((tm) => tm.players).find((p) => p.steamId === chatCard.steamId)?.name ?? "—"}
          anchor={chatCard.rect}
          onClose={() => setChatCard(null)}
        />
      )}
    </div>
  );
}

/** Same window the server keeps, so a line never scrolls off one and not the other. */
const CHAT_MAX_LENGTH = 240;
/** How close to the bottom still counts as "following along", in pixels. */
const CHAT_STICK_PX = 48;

const chatTime = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function ChatBox({
  messages,
  draft,
  setDraft,
  onSend,
  placeholder,
  t,
  names,
  me,
  onPlayerClick
}: {
  messages: NonNullable<State["match"]>["chat"];
  draft: string;
  setDraft: (v: string) => void;
  onSend: (text: string) => void;
  placeholder: string;
  t: (k: string, v?: Record<string, string | number>) => string;
  names: Record<string, any>;
  me: string;
  onPlayerClick: (steamId: string, e: React.MouseEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Whether the reader is at the bottom. Scrolling to the newest line
  // unconditionally yanks the log out from under anyone who has scrolled up to
  // read something, which in a lobby is usually the connect string.
  const stuck = useRef(true);
  const [unread, setUnread] = useState(0);
  const seen = useRef(messages.length);

  const toBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stuck.current = true;
    seen.current = messages.length;
    setUnread(0);
  }, [messages.length]);

  useEffect(() => {
    if (stuck.current) {
      toBottom();
    } else {
      setUnread(Math.max(0, messages.length - seen.current));
    }
  }, [messages.length, toBottom]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= CHAT_STICK_PX;
    stuck.current = atBottom;
    if (atBottom) {
      seen.current = messages.length;
      setUnread(0);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
    // Saying something is an unambiguous "I am reading this now".
    stuck.current = true;
  };

  const left = CHAT_MAX_LENGTH - draft.length;

  return (
    <div className="rq-chat">
      <div className="rq-chat-log" ref={ref} onScroll={onScroll}>
        {messages.length === 0 && <p className="rq-chat-empty">{t("lobby.chatempty")}</p>}
        {messages.map((c, i) => {
          const fromId = (c as any).from as string | undefined;
          const disp = fromId
            ? displayNameFor(fromId, names, { isBot: false }) ?? c.name ?? t("lobby.player")
            : c.name ?? t("lobby.player");
          // Runs of lines from one person show the name once. Six "evan:"
          // prefixes down a 150px-tall log is mostly name and barely message.
          const prev = messages[i - 1] as any;
          const grouped =
            prev && prev.from === fromId && c.at - prev.at < 60_000;
          return (
            <p
              key={`${c.at}-${i}`}
              className={`rq-chat-line${grouped ? " grouped" : ""}${fromId === me ? " mine" : ""}`}
            >
              {!grouped && (
                <>
                  <time className="rq-chat-at" dateTime={new Date(c.at).toISOString()}>
                    {chatTime(c.at)}
                  </time>
                  <strong
                    onClick={(e) => fromId && onPlayerClick(fromId, e)}
                    role={fromId ? "button" : undefined}
                    tabIndex={fromId ? 0 : undefined}
                  >
                    {disp}
                  </strong>
                </>
              )}
              <span className="rq-chat-text">{c.text}</span>
            </p>
          );
        })}
      </div>

      {unread > 0 && (
        <button type="button" className="rq-chat-jump" onClick={() => toBottom("smooth")}>
          {unread} new ↓
        </button>
      )}

      <form className="rq-chat-form" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          maxLength={CHAT_MAX_LENGTH}
        />
        {/* Only once it is close enough to matter — a counter that is always
            there is noise on a line nobody is near the limit of. */}
        {left <= 40 && <span className="rq-chat-left">{left}</span>}
        <button type="submit" disabled={!draft.trim()} aria-label={t("lobby.chatsend")}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}

function TeamHead({
  team,
  nameOverride,
  mine,
  align,
  t,
}: {
  team: NonNullable<State["match"]>["teams"][number];
  nameOverride?: string;
  mine: boolean;
  align: "left" | "right";
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <div className={`rq-teamhead ${align} ${mine ? "mine" : ""}`}>
      <span className="rq-teamname">{nameOverride ?? team.name}</span>
      {mine && <span className="rq-youtag">{t("lobby.you")}</span>}
    </div>
  );
}

function Roster({
  team,
  me,
  align,
  forms,
  names,
  t,
}: {
  team: NonNullable<State["match"]>["teams"][number];
  me: string;
  align: "left" | "right";
  forms: Record<string, RecentForm>;
  names: Record<string, any>;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  // Which row is showing its full card, and where that row is on screen. Kept
  // here rather than per row so only one card can be open at a time.
  const [open, setOpen] = useState<{ steamId: string; rect: DOMRect } | null>(null);

  return (
    <ul className={`rq-roster ${align}`}>
      {team.players.map((p) => {
        const displayName = displayNameFor(p.steamId, names, { isBot: !!p.bot }) ?? p.name ?? "—";
        const avatarUrl = names[p.steamId]?.avatar;
        return (
        <li
          key={p.steamId}
          className={`${p.steamId === me ? "me" : ""} ${p.bot ? "bot" : ""}`}
          onMouseEnter={(e) => !p.bot && setOpen({ steamId: p.steamId, rect: e.currentTarget.getBoundingClientRect() })}
          onMouseLeave={() => setOpen((o) => (o?.steamId === p.steamId ? null : o))}
        >
          {p.bot
            ? <span className="rq-avatar" aria-hidden>{displayName.slice(0, 1).toUpperCase()}</span>
            : avatarUrl ? <img className="rq-avatar" src={avatarUrl} alt="" /> : <LevelBadge elo={p.elo} matches={p.matches} size="md" />}
          <span className="rq-player">
            <span className="rq-member-name">
              {displayName}
              {p.leader && <span className="rq-crown">★</span>}
              {/* Who came together. A solo queuer gets no marker rather than
                  a "group of 1", because that is not a thing. */}
              {p.premade ? (
                <span className={`rq-premade p${p.premade}`} title={t("lobby.premade")}>
                  ⛓ {p.premade}
                </span>
              ) : (
                !p.bot && <span className="rq-solo" title={t("lobby.soloq")}>◦</span>
              )}
            </span>
            {!p.bot && <FormLine form={forms[p.steamId]} />}
          </span>
        </li>
      )})}

      {open && (
        <FormCard
          form={forms[open.steamId]}
          name={displayNameFor(open.steamId, names, { isBot: false }) ?? team.players.find((p) => p.steamId === open.steamId)?.name ?? "—"}
          anchor={open.rect}
          onClose={() => setOpen(null)}
        />
      )}
    </ul>
  );
}

function InviteModal({
  invite,
  send,
  t,
  names,
}: { invite: any; send: any; t: any; names: Record<string, { name: string; avatar: string | null }> }) {
  useEffect(() => {
    const tId = setTimeout(() => {
      send("rq:party:decline");
    }, 10000);
    return () => clearTimeout(tId);
  }, [invite, send]);

  return (
    <div style={{
       position: "fixed", top: "80px", left: "50%", transform: "translateX(-50%)",
       background: "var(--color-surface)", border: "1px solid var(--color-accent)",
       padding: "16px", borderRadius: "8px", zIndex: 99999, display: "flex", flexDirection: "column",
       boxShadow: "0 10px 30px rgba(0,0,0,0.5)", pointerEvents: "auto", width: "320px"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
         {/* Who, with their face.
             `fromName` is whatever the inviter's own client happened to send on
             connect, which is often nothing — so this said "Player 3124", the
             last four digits of a SteamID, to somebody being asked to join a
             game by a friend. The resolver the rest of the lobby already uses
             knows the real name, and displayNameFor only falls back to digits
             when even that has nothing. */}
         <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <AvatarImage steamId={String(invite.from)} className="rq-invite-face" alt="" />
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: "12px", color: "var(--color-accent)", textTransform: "uppercase", fontWeight: "bold" }}>{t("lobby.invited")}</span>
              <div style={{ fontSize: "16px", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {displayNameFor(String(invite.from), names) || invite.fromName || t("lobby.player")}
              </div>
            </div>
         </div>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button className="btn btn-primary" onClick={() => send("rq:party:accept")} style={{ flex: 1, padding: "8px", fontSize: "14px" }}>{t("lobby.join")}</button>
        <button className="btn btn-secondary" onClick={() => send("rq:party:decline")} style={{ flex: 1, padding: "8px", fontSize: "14px" }}>{t("lobby.decline")}</button>
      </div>
      <div style={{ height: "4px", background: "rgba(255,255,255,0.1)", marginTop: "12px", borderRadius: "2px", overflow: "hidden" }}>
         <motion.div 
           initial={{ width: "100%" }} 
           animate={{ width: "0%" }} 
           transition={{ duration: 10, ease: "linear" }}
           style={{ height: "100%", background: "var(--color-accent)" }}
         />
      </div>
    </div>
  );
}
