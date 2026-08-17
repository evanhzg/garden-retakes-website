"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Ghost, Target as TargetIcon, Anchor, RotateCcw, Mic } from "lucide-react";
import { useSocket } from "@/components/games/SocketProvider";
import { useI18n } from "@/components/I18nProvider";
import { ROLES, DEFAULT_UTILITY, type Side } from "@/lib/retakeLoadout";
import { useOverlay } from "@/lib/useOverlay";
import { usePlayerNames, displayNameFor } from "@/components/games/hooks";
import { FormCard, FormLine, useRosterForm, type RecentForm } from "./PlayerForm";
import LevelBadge from "./LevelBadge";
import LiveGames from "./LiveGames";
import PostMatchModal from "./PostMatchModal";
import MatchmakingWalkthrough from "@/components/onboarding/MatchmakingWalkthrough";
import { motion } from "framer-motion";
import "@/app/lobby/retakes-lobby.css";

function SafeShield({ score, probation }: { score: number; probation: boolean }) {
  let color = "#888";
  if (probation) color = "#888";
  else if (score >= 90) color = "#FFD700";
  else if (score >= 60) color = "#4A90E2";
  else color = "#E0533A";

  return (
    <svg style={{ width: '14px', height: '14px', marginLeft: '6px', flexShrink: 0, verticalAlign: 'middle' }} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>{`Safe Score: ${probation ? 'Probation' : score}`}</title>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={color} fillOpacity="0.2" />
    </svg>
  );
}

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

/** One of the three queues, as the server describes it. */
type QueueInfo = { id: string; label: string; teamSize: number; bots: boolean };

/** How the hand-off to the game server is going. */
type ServerStatus = {
  state: "idle" | "starting" | "ready" | "failed";
  step: string | null;
  error: string | null;
};

type State = {
  queues: QueueInfo[];
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
      sides: (string | null)[];
      server: ServerStatus;
    } | null;
    chat: { from: string; name: string | null; text: string; at: number; team?: number | null }[];
  } | null;
  online: number;
};

type Friend = { friendId: string; name: string; avatarUrl: string | null; status: string };

const MAP_LABEL: Record<string, string> = {
  de_mirage: "Mirage",
  de_inferno: "Inferno",
  de_nuke: "Nuke",
  de_overpass: "Overpass",
  de_vertigo: "Vertigo",
  de_ancient: "Ancient",
  de_anubis: "Anubis",
  de_dust2: "Dust II",
  de_train: "Train",
  de_cache: "Cache",
};

const mapName = (id: string) => MAP_LABEL[id] ?? id.replace(/^de_/, "");

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
  const [avatarPlayers, setAvatarPlayers] = useState<{ steamId: string, name: string, avatarSrc?: string }[]>([]);
  const [safeScores, setSafeScores] = useState<{ steamId: string, score: number, probation: boolean }[]>([]);
  const [activeTab, setActiveTab] = useState<"lobby" | "live">("lobby");
  const [safeQueue, setSafeQueue] = useState(false);
  const [showPostMatch, setShowPostMatch] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<{ id: string, name: string, expiresAt: number }[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [openPartyCard, setOpenPartyCard] = useState<{ steamId: string; rect: DOMRect } | null>(null);
  const [partyLoadouts, setPartyLoadouts] = useState<Record<string, { roleT: string, roleCt: string, isCaller: boolean, weapons: any, utility: any, notes: string }>>({});
  const [sideTab, setSideTab] = useState<Side>("T");
  const [savingRole, setSavingRole] = useState(false);

  const allIds = useMemo(() => {
    const ids = new Set<string>();
    state?.party?.members.forEach((m) => ids.add(m.steamId));
    state?.match?.teams.forEach((t) => t.players.forEach((p) => ids.add(p.steamId)));
    return Array.from(ids);
  }, [state?.party, state?.match]);
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
      fetch("/api/users/avatars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamIds: ids })
      })
      .then(r => r.json())
      .then(d => { if (active) setAvatarPlayers(d); })
      .catch(console.error);
      
      fetch("/api/users/safe-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamIds: ids })
      })
      .then(r => r.json())
      .then(d => { if (active && Array.isArray(d)) setSafeScores(d); })
      .catch(console.error);
      
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

  const queueId = party?.queue ?? "classic";
  const queueInfo = state?.queues.find((q) => q.id === queueId) ?? null;

  const onlineFriends = useMemo(
    () => friends.filter((f) => online.includes(f.friendId)),
    [friends, online]
  );
  const inPartyIds = useMemo(() => new Set((party?.members ?? []).map((m) => m.steamId)), [party]);

  const conflicts = useMemo(() => {
     if (!party) return [];
     const res: string[] = [];
     const max1T = ["sniper", "lurker"];
     const max1Ct = ["sniper", "anchor"];
     let callers = 0;
     const tRoles = new Map<string, number>();
     const ctRoles = new Map<string, number>();
     
     party.members.forEach(m => {
        const l = partyLoadouts[m.steamId];
        if (!l) return;
        if (l.isCaller) callers++;
        if (l.roleT) tRoles.set(l.roleT, (tRoles.get(l.roleT) ?? 0) + 1);
        if (l.roleCt) ctRoles.set(l.roleCt, (ctRoles.get(l.roleCt) ?? 0) + 1);
     });
     
     if (callers > 1) res.push("Max 1 Caller per team");
     max1T.forEach(r => { if ((tRoles.get(r) ?? 0) > 1) res.push(`Max 1 ${r} (T)`); });
     max1Ct.forEach(r => { if ((ctRoles.get(r) ?? 0) > 1) res.push(`Max 1 ${r} (CT)`); });
     return res;
  }, [party, partyLoadouts]);

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

      <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', justifyContent: 'center' }}>
        <button className={`rq-tab ${activeTab === 'lobby' ? 'active' : ''}`} onClick={() => setActiveTab('lobby')} style={{ background: 'none', color: activeTab === 'lobby' ? 'var(--color-accent)' : 'var(--muted)', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', border: 'none', borderBottom: activeTab === 'lobby' ? '2px solid var(--color-accent)' : '2px solid transparent', padding: '10px 20px', transition: 'all 0.2s' }}>Lobby</button>
        <button className={`rq-tab ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')} style={{ background: 'none', color: activeTab === 'live' ? 'var(--color-accent)' : 'var(--muted)', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', border: 'none', borderBottom: activeTab === 'live' ? '2px solid var(--color-accent)' : '2px solid transparent', padding: '10px 20px', transition: 'all 0.2s' }}>Live Games</button>
      </div>

      <div className="rq-grid" style={{ display: activeTab === 'lobby' ? 'grid' : 'none' }}>
        {/* ------------------------------------------------------------ party */}
        <aside className="panel rq-party">
          <header className="rq-panel-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
               <h2>{t("lobby.party")}</h2>
               <span className="rq-count">
                 {party?.members.length ?? 1}/{party?.capacity ?? 2}
               </span>
            </div>
            <button className="btn btn-ghost" onClick={() => setReportOpen(true)} style={{ color: 'var(--color-danger)', fontSize: '12px', padding: '4px 8px' }}>
               Report Lobby
            </button>
          </header>

          {party && (party.members.length >= Math.ceil(party.capacity * (2/3))) && (
            <div style={{ padding: "0 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Team Name:</span>
              {editingName ? (
                <input 
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
                  style={{ background: "transparent", border: "none", borderBottom: "1px solid var(--color-accent)", color: "#fff", outline: "none", fontSize: "14px", fontWeight: "bold", width: "120px" }}
                />
              ) : (
                <span style={{ fontSize: "14px", fontWeight: "bold", cursor: party.isLeader ? "pointer" : "default" }} onClick={() => {
                  if (party.isLeader) {
                    setDraftName(party.name || "");
                    setEditingName(true);
                  }
                }}>
                  {party.name || "Unnamed"} {party.isLeader && <span style={{ opacity: 0.5, fontSize: "12px", marginLeft: "4px" }}>✎</span>}
                </span>
              )}
            </div>
          )}

          <ul className="rq-members">
            {(party?.members ?? []).map((m) => {
              const avatarUrl = names[m.steamId]?.avatar;
              const displayName = displayNameFor(m.steamId, names, { isBot: false }) ?? m.name ?? t("lobby.player");
              return (
              <li 
                key={m.steamId} 
                className={m.steamId === steamId ? "me" : ""}
                onMouseEnter={(e) => setOpenPartyCard({ steamId: m.steamId, rect: e.currentTarget.getBoundingClientRect() })}
                onMouseLeave={() => setOpenPartyCard((o) => (o?.steamId === m.steamId ? null : o))}
              >
                <span className="rq-avatar" aria-hidden style={{ overflow: "hidden" }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="rq-member-name">
                  {displayName}
                  {m.steamId === party?.leader && <span className="rq-crown" title={t("lobby.leader")}>★</span>}
                  {(() => {
                    const ss = safeScores.find(s => s.steamId === m.steamId);
                    if (ss) return <SafeShield score={ss.score} probation={ss.probation} />;
                    return null;
                  })()}
                  {partyLoadouts[m.steamId]?.isCaller && <span title="Caller"><Mic size={14} style={{ marginLeft: 4, color: "var(--color-accent)" }} /></span>}
                  {partyLoadouts[m.steamId]?.roleT && <span style={{ marginLeft: 6, opacity: 0.7 }} title={`T: ${partyLoadouts[m.steamId].roleT}`}>
                     {partyLoadouts[m.steamId].roleT === 'sniper' && <Crosshair size={14} />}
                     {partyLoadouts[m.steamId].roleT === 'lurker' && <Ghost size={14} />}
                     {partyLoadouts[m.steamId].roleT === 'rifler' && <TargetIcon size={14} />}
                  </span>}
                  {partyLoadouts[m.steamId]?.roleCt && <span style={{ marginLeft: 4, opacity: 0.7 }} title={`CT: ${partyLoadouts[m.steamId].roleCt}`}>
                     {partyLoadouts[m.steamId].roleCt === 'sniper' && <Crosshair size={14} />}
                     {partyLoadouts[m.steamId].roleCt === 'anchor' && <Anchor size={14} />}
                     {partyLoadouts[m.steamId].roleCt === 'rotator' && <RotateCcw size={14} />}
                  </span>}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <FormLine form={partyForms[m.steamId]} />
                  <LevelBadge elo={m.elo} matches={m.matches} size="sm" />
                </span>
                {party?.isLeader && m.steamId !== steamId && (
                  <button
                    className="rq-kick"
                    onClick={() => send("rq:party:kick", { steamId: m.steamId })}
                    aria-label={t("lobby.kick")}
                  >
                    ✕
                  </button>
                )}
              </li>
            );})}
            {pendingInvites.map((inv) => (
              <li key={`inv-${inv.id}`} className="empty pending-invite" style={{ opacity: 0.7 }}>
                 <span className="rq-avatar ghost" aria-hidden>+</span>
                 <span className="rq-member-name muted">Inviting {inv.name}... ({(Math.max(0, inv.expiresAt - Date.now()) / 1000).toFixed(0)}s)</span>
              </li>
            ))}
            {Array.from({ length: Math.max(0, (party?.capacity ?? 2) - (party?.members.length ?? 1) - pendingInvites.length) }).map((_, i) => (
              <li key={`slot-${i}`} className="empty" onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/lobby/${lobbyId}`);
                  alert("Lobby invite link copied!");
              }} style={{ cursor: "pointer" }}>
                <span className="rq-avatar ghost" aria-hidden>
                  +
                </span>
                <span className="rq-member-name muted">{t("lobby.emptyslot")} - Click to copy link</span>
              </li>
            ))}
          </ul>

          {party && !party.isLeader && <p className="rq-hint">{t("lobby.leaderqueues")}</p>}

          {openPartyCard && (
            <FormCard
              form={partyForms[openPartyCard.steamId]}
              name={displayNameFor(openPartyCard.steamId, names, { isBot: false }) ?? party?.members.find((m) => m.steamId === openPartyCard.steamId)?.name ?? "—"}
              anchor={openPartyCard.rect}
              onClose={() => setOpenPartyCard(null)}
            />
          )}

          <h3 className="rq-subhead">{t("lobby.invitefriends")}</h3>
          {onlineFriends.length === 0 ? (
            <p className="rq-hint">{friends.length === 0 ? t("lobby.nofriends") : t("lobby.nofriendsonline")}</p>
          ) : (
            <ul className="rq-friends">
              {onlineFriends.map((f) => {
                const already = inPartyIds.has(f.friendId) || pendingInvites.some(inv => inv.id === f.friendId);
                const full = (party?.members.length ?? 1) + pendingInvites.length >= (party?.capacity ?? 2);
                return (
                  <li key={f.friendId}>
                    <span className="rq-avatar sm" aria-hidden>
                      {f.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="rq-member-name">{f.name}</span>
                    <button
                      className="btn btn-secondary rq-invite"
                      disabled={already || full || !party?.isLeader}
                      onClick={() => {
                         send("rq:party:invite", { steamId: f.friendId, name: f.name });
                         setPendingInvites(p => [...p, { id: f.friendId, name: f.name, expiresAt: Date.now() + 10000 }]);
                      }}
                    >
                      {already ? t("lobby.inparty") : t("lobby.invite")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ------------------------------------------------------------- queue */}
        <main className="panel rq-main">
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
              <label className="rq-safe-queue" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={safeQueue} onChange={(e) => setSafeQueue(e.target.checked)} style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: 'var(--color-accent)' }} />
                <span style={{ fontWeight: 'bold', fontSize: '14px', color: safeQueue ? 'var(--color-accent)' : 'var(--muted)', transition: 'color 0.2s' }}>Safe Queue</span>
              </label>

              <div data-tutorial="role-picker" style={{ marginBottom: 24, padding: "16px", background: "color-mix(in srgb, var(--color-surface) 50%, transparent)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px" }}>Your Role</h3>
                    <div style={{ display: "flex", gap: "8px" }}>
                       <button className={`btn btn-sm ${sideTab === 'T' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSideTab("T")} style={{ padding: "4px 8px", fontSize: "12px" }}>T Side</button>
                       <button className={`btn btn-sm ${sideTab === 'CT' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSideTab("CT")} style={{ padding: "4px 8px", fontSize: "12px" }}>CT Side</button>
                    </div>
                 </div>
                 <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {ROLES.filter(r => r.side === sideTab || r.side === "both").map(r => {
                       const active = sideTab === "T" ? partyLoadouts[steamId!]?.roleT === r.id : partyLoadouts[steamId!]?.roleCt === r.id;
                       return (
                         <button key={r.id} onClick={() => updateMyLoadout({ [sideTab === 'T' ? 'roleT' : 'roleCt']: active ? "" : r.id })} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: active ? "var(--color-accent)" : "var(--bg-elevated)", color: active ? "#fff" : "var(--fg)", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
                           {r.id === 'sniper' && <Crosshair size={14} />}
                           {r.id === 'lurker' && <Ghost size={14} />}
                           {r.id === 'rifler' && <TargetIcon size={14} />}
                           {r.id === 'anchor' && <Anchor size={14} />}
                           {r.id === 'rotator' && <RotateCcw size={14} />}
                           {r.id.charAt(0).toUpperCase() + r.id.slice(1)}
                         </button>
                       );
                    })}
                 </div>
                 <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "16px", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}>
                   <input type="checkbox" checked={partyLoadouts[steamId!]?.isCaller || false} onChange={e => updateMyLoadout({ isCaller: e.target.checked })} style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }} />
                   <Mic size={16} /> I am the Caller
                 </label>
              </div>

              {conflicts.length > 0 && party?.isLeader && (
                <div style={{ marginBottom: 16, padding: "12px", background: "rgba(224, 83, 58, 0.1)", border: "1px solid #E0533A", borderRadius: "8px", color: "#E0533A", fontSize: "14px" }}>
                   <strong>Role Conflict:</strong>
                   <ul style={{ margin: "4px 0 0", paddingLeft: "20px" }}>
                     {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                   </ul>
                </div>
              )}

              {/* ----------------------------------------------- queue picker */}
              <h3 className="rq-choose">{t("lobby.choosequeue")}</h3>
              <div className="rq-queues">
                {(state?.queues ?? []).map((q) => {
                  const tooBig = (party?.members.length ?? 1) > q.teamSize;
                  const on = queueId === q.id;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      className={`rq-queue ${on ? "on" : ""}`}
                      aria-pressed={on}
                      disabled={!party?.isLeader || tooBig}
                      onClick={() => send("rq:party:queue", { queue: q.id })}
                    >
                      <span className="rq-queue-size">{t("lobby.queue.size", { n: q.teamSize })}</span>
                      <span className="rq-queue-label">{queueName(t, q.id, q.label)}</span>
                      <span className="rq-queue-sub">{t(`lobby.queue.${q.id}sub`)}</span>
                      {tooBig && (
                        <span className="rq-queue-sub warn">{t("lobby.partytoobig", { n: q.teamSize })}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="rq-queue-current">
                {t("lobby.queue.current", { queue: queueName(t, queueId, queueInfo?.label) })}
              </p>

              <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
                <button
                  data-tutorial="queue-play"
                  className="btn btn-primary rq-play"
                  disabled={(!party?.isLeader && !match) || (conflicts.length > 0 && !match)}
                  onClick={() => {
                    if (match) setHideMatchRoom(false);
                    else send("rq:queue:join", { queue: queueId, safeQueue });
                  }}
                  style={{ flex: 1 }}
                >
                  {match ? "Return to Game" : conflicts.length > 0 ? "Fix Roles to Queue" : t("lobby.findmatch")}
                </button>
                {party && party.members.length > 1 && !match && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => send("rq:party:leave")}
                  >
                    Leave Lobby
                  </button>
                )}
              </div>

              <p className="rq-online">{t("lobby.onlinenow", { n: state?.online ?? 0 })}</p>
            </>
          )}
        </main>

        {/* ------------------------------------------------------------ format */}
        <aside className="panel rq-format">
          <header className="rq-panel-head">
            <h2>{t("lobby.format")}</h2>
          </header>
          <ol className="rq-steps">
            <li>
              <strong>{t("lobby.step1")}</strong>
              <span className="muted">{t("lobby.step1sub", { n: queueInfo?.teamSize ?? 5 })}</span>
            </li>
            <li>
              <strong>{t("lobby.step2")}</strong>
              <span className="muted">{t("lobby.step2sub")}</span>
            </li>
            <li>
              <strong>{t("lobby.step3")}</strong>
              <span className="muted">{t("lobby.step3sub")}</span>
            </li>
            <li>
              <strong>{t("lobby.step4")}</strong>
              <span className="muted">{t("lobby.step4sub")}</span>
            </li>
          </ol>

          <div className="rq-links">
            <a className="btn btn-secondary" href="/loadout">
              {t("lobby.yourloadout")}
            </a>
            <a className="btn btn-secondary" href="/stats/form">
              {t("lobby.yourform")}
            </a>
            <a className="btn btn-secondary" href="/retakes/economy">
              {t("lobby.economy")}
            </a>
            <button className="btn btn-secondary" onClick={() => setShowPostMatch(true)}>
              View Last Match
            </button>
          </div>
        </aside>
      </div>

      {activeTab === 'live' && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <LiveGames />
        </div>
      )}

      {showPostMatch && (
        <PostMatchModal 
          matchId="dummy-123"
          myTeamScore={13}
          enemyTeamScore={11}
          teammates={[
            { steamId: "u1", name: "PlayerOne", kills: 22, deaths: 14, rating: 1.2, eloChange: 25, elo: 1450 },
            { steamId: "u2", name: "PlayerTwo", kills: 18, deaths: 16, rating: 1.05, eloChange: 22, elo: 1380 }
          ]}
          onClose={() => setShowPostMatch(false)}
        />
      )}

      {state?.invite && (
        <InviteModal invite={state.invite} send={send} t={t} />
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
                <img src={`/maps/${match.result.map}.png`} alt={mapName(match.result.map)} />
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
                {match.result.connect ? (
                  <div className="rq-connect">
                    <code>connect {match.result.connect}</code>
                    <div className="rq-connect-buttons">
                      <button
                        className="btn"
                        onClick={() => navigator.clipboard?.writeText(`connect ${match.result!.connect}`)}
                      >
                        {t("lobby.copyconnect")}
                      </button>
                      <a className="btn btn-secondary" href={`steam://connect/${match.result.connect}`}>
                        {t("lobby.join_server")}
                      </a>
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
                      <img src={`/maps/${m}.png`} alt="" loading="lazy" />
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

function InviteModal({ invite, send, t }: { invite: any, send: any, t: any }) {
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
         <div>
            <span style={{ fontSize: "12px", color: "var(--color-accent)", textTransform: "uppercase", fontWeight: "bold" }}>{t("lobby.invited")}</span>
            <div style={{ fontSize: "16px", fontWeight: "bold" }}>{invite.fromName ?? t("lobby.player")}</div>
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
