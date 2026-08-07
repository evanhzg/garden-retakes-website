"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "@/components/games/SocketProvider";
import { useI18n } from "@/components/I18nProvider";
import { useOverlay } from "@/lib/useOverlay";
import { FormCard, FormLine, useRosterForm, type RecentForm } from "./PlayerForm";
import LevelBadge from "./LevelBadge";
import LiveGames from "./LiveGames";
import PostMatchModal from "./PostMatchModal";
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

type State = {
  modes: { id: string; label: string; teamSize: number }[];
  party: {
    id: string;
    leader: string;
    isLeader: boolean;
    name?: string | null;
    mode: string;
    capacity: number;
    elo?: number;
    members: Member[];
    queuedAt: number | null;
    queueReason: string | null;
  } | null;
  invite: { partyId: string; from: string; fromName: string | null; at: number } | null;
  queue: { mode: string; since: number; searching: number; botFillAt: number } | null;
  match: {
    id: string;
    mode: string;
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
    result: { map: string; connect: string | null; sides: (string | null)[] } | null;
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

      return () => { active = false; };
    }
  }, [state?.party?.members]);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");

  const match = state?.match ?? null;
  const now = useNow(Boolean(state?.queue || match));

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

  const party = state?.party ?? null;
  const mode = party?.mode ?? "2v2";
  const modeInfo = state?.modes.find((m) => m.id === mode);

  const onlineFriends = useMemo(
    () => friends.filter((f) => online.includes(f.friendId)),
    [friends, online]
  );
  const inPartyIds = useMemo(() => new Set((party?.members ?? []).map((m) => m.steamId)), [party]);

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
  if (match?.phase === "found" && match.accept) {
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
            </div>
          )}
        </div>
      </div>
    );
  }

  if (match && (match.phase === "veto" || match.phase === "ready")) {
    return (
      <div className="rq">
        <MatchRoom
          match={match}
          me={steamId ?? ""}
          now={now}
          onBan={(m) => send("rq:veto:ban", { map: m })}
          onSide={(s) => send("rq:veto:side", { side: s })}
          onChat={(text, teamOnly) => send("rq:chat", { text, teamOnly })}
          t={t}
        />
        {notice && <div className={`rq-toast ${notice.kind}`}>{notice.text}</div>}
      </div>
    );
  }

  const queue = state?.queue ?? null;
  const botIn = queue ? secondsTo(queue.botFillAt, now) : 0;

  return (
    <div className="rq">
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
        <aside className="rq-panel rq-party">
          <header className="rq-panel-head">
            <h2>{t("lobby.party")}</h2>
            <span className="rq-count">
              {party?.members.length ?? 1}/{party?.capacity ?? 2}
            </span>
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
              const pAvatar = avatarPlayers.find((ap) => ap.steamId === m.steamId);
              return (
              <li key={m.steamId} className={m.steamId === steamId ? "me" : ""}>
                <span className="rq-avatar" aria-hidden style={{ overflow: "hidden" }}>
                  {pAvatar?.avatarSrc ? (
                    <img src={pAvatar.avatarSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    (m.name ?? "?").slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="rq-member-name">
                  {m.name ?? t("lobby.player")}
                  {m.steamId === party?.leader && <span className="rq-crown" title={t("lobby.leader")}>★</span>}
                  {(() => {
                    const ss = safeScores.find(s => s.steamId === m.steamId);
                    if (ss) return <SafeShield score={ss.score} probation={ss.probation} />;
                    return null;
                  })()}
                </span>
                <LevelBadge elo={m.elo} matches={m.matches} size="sm" />
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
            {Array.from({ length: Math.max(0, (party?.capacity ?? 2) - (party?.members.length ?? 1)) }).map((_, i) => (
              <li key={`slot-${i}`} className="empty">
                <span className="rq-avatar ghost" aria-hidden>
                  +
                </span>
                <span className="rq-member-name muted">{t("lobby.emptyslot")}</span>
              </li>
            ))}
          </ul>

          {party && !party.isLeader && <p className="rq-hint">{t("lobby.leaderqueues")}</p>}

          <h3 className="rq-subhead">{t("lobby.invitefriends")}</h3>
          {onlineFriends.length === 0 ? (
            <p className="rq-hint">{friends.length === 0 ? t("lobby.nofriends") : t("lobby.nofriendsonline")}</p>
          ) : (
            <ul className="rq-friends">
              {onlineFriends.map((f) => {
                const already = inPartyIds.has(f.friendId);
                const full = (party?.members.length ?? 1) >= (party?.capacity ?? 2);
                return (
                  <li key={f.friendId}>
                    <span className="rq-avatar sm" aria-hidden>
                      {f.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="rq-member-name">{f.name}</span>
                    <button
                      className="btn btn-secondary rq-invite"
                      disabled={already || full || !party?.isLeader}
                      onClick={() => send("rq:party:invite", { steamId: f.friendId, name: f.name })}
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
        <main className="rq-panel rq-main">
          {queue ? (
            <div className="rq-searching">
              <div className="rq-radar" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <h2>{t("lobby.searching")}</h2>
              <div className="rq-timer">{clock(now - queue.since)}</div>
              <p className="muted">
                {t("lobby.inqueue", { n: queue.searching, mode: modeInfo?.label ?? mode })}
              </p>
              {/* Said plainly rather than pretending a full lobby is imminent:
                  on a server this size the honest answer is usually bots. */}
              <p className="rq-botfill">
                {botIn > 0 ? t("lobby.botfillin", { n: botIn }) : t("lobby.botfillnow")}
              </p>
              <button className="btn btn-ghost" onClick={() => send("rq:queue:leave")}>
                {t("lobby.cancel")}
              </button>
            </div>
          ) : (
            <>
              <h2 className="rq-choose">{t("lobby.choosemode")}</h2>
              
              <div className="rq-mode-toggle" style={{ display: 'flex', background: 'color-mix(in srgb, var(--color-text) 5%, transparent)', borderRadius: '999px', padding: '4px', marginBottom: '24px', width: '100%', maxWidth: '300px' }}>
                {(state?.modes ?? []).map((m) => {
                  const tooBig = (party?.members.length ?? 1) > m.teamSize;
                  return (
                    <button
                      key={m.id}
                      className={`rq-toggle-btn ${mode === m.id ? 'active' : ''}`}
                      disabled={!party?.isLeader || tooBig}
                      onClick={() => send("rq:party:mode", { mode: m.id })}
                      style={{ 
                        flex: 1, 
                        padding: '10px 20px', 
                        borderRadius: '999px', 
                        border: 'none', 
                        background: mode === m.id ? 'var(--color-accent)' : 'transparent', 
                        color: mode === m.id ? '#fff' : 'var(--color-text)', 
                        cursor: (!party?.isLeader || tooBig) ? 'not-allowed' : 'pointer',
                        opacity: tooBig ? 0.4 : 1,
                        fontWeight: 'bold',
                        transition: 'all 0.2s',
                        fontSize: '15px'
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>

              <label className="rq-safe-queue" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={safeQueue} onChange={(e) => setSafeQueue(e.target.checked)} style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: 'var(--color-accent)' }} />
                <span style={{ fontWeight: 'bold', fontSize: '14px', color: safeQueue ? 'var(--color-accent)' : 'var(--muted)', transition: 'color 0.2s' }}>Safe Queue</span>
              </label>

              <button
                className="btn btn-primary rq-play"
                disabled={!party?.isLeader}
                onClick={() => send("rq:queue:join", { mode, safeQueue })}
              >
                {t("lobby.findmatch")}
              </button>

              <p className="rq-online">{t("lobby.onlinenow", { n: state?.online ?? 0 })}</p>
            </>
          )}
        </main>

        {/* ------------------------------------------------------------ format */}
        <aside className="rq-panel rq-format">
          <header className="rq-panel-head">
            <h2>{t("lobby.format")}</h2>
          </header>
          <ol className="rq-steps">
            <li>
              <strong>{t("lobby.step1")}</strong>
              <span className="muted">{t("lobby.step1sub", { n: modeInfo?.teamSize ?? 2 })}</span>
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

      {/* An invite is a modal because it expires and because saying no is a
          real answer — a banner people scroll past is neither. */}
      {state?.invite && (
        <div className="rq-takeover soft">
          <div className="rq-invite-card">
            <span className="rq-found-kicker">{t("lobby.invited")}</span>
            <h2>{state.invite.fromName ?? t("lobby.player")}</h2>
            <p className="muted">{t("lobby.invitedblurb")}</p>
            <div className="rq-found-actions">
              <button className="btn btn-primary" onClick={() => send("rq:party:accept")}>
                {t("lobby.join")}
              </button>
              <button className="btn btn-ghost" onClick={() => send("rq:party:decline")}>
                {t("lobby.decline")}
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className={`rq-toast ${notice.kind}`}>{notice.text}</div>}
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
  t,
}: {
  match: NonNullable<State["match"]>;
  me: string;
  now: number;
  onBan: (map: string) => void;
  onSide: (side: string) => void;
  onChat: (text: string, teamOnly: boolean) => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const [teamChatDraft, setTeamChatDraft] = useState("");
  const [globalChatDraft, setGlobalChatDraft] = useState("");
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
      <header className="rq-room-head">
        <TeamHead team={match.teams[0]} nameOverride={t0Name} mine={match.yourTeam === 0} align="left" t={t} />
        <div className="rq-room-status">
          {ready ? (
            <>
              <span className="rq-phase ready">{t("lobby.matchready")}</span>
              <span className="muted">{t("lobby.mode", { mode: match.mode })}</span>
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
          <Roster team={match.teams[0]} me={me} align="left" forms={forms} t={t} />
          {match.yourTeam === 0 ? (
            <ChatBox messages={match.chat.filter(c => c.team === 0)} draft={teamChatDraft} setDraft={setTeamChatDraft} onSend={(text) => onChat(text, true)} placeholder="Team chat" t={t} />
          ) : match.yourTeam === 1 ? (
            <ChatBox messages={match.chat.filter(c => c.team == null)} draft={globalChatDraft} setDraft={setGlobalChatDraft} onSend={(text) => onChat(text, false)} placeholder="Global chat" t={t} />
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
                ) : (
                  <div className="rq-loading-server" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                    <div className="spinner" style={{ width: "24px", height: "24px", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "white", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
                    <span style={{ fontSize: "14px", color: "var(--fg-muted)" }}>Configuring server...</span>
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
          <Roster team={match.teams[1]} me={me} align="right" forms={forms} t={t} />
          {match.yourTeam === 1 ? (
            <ChatBox messages={match.chat.filter(c => c.team === 1)} draft={teamChatDraft} setDraft={setTeamChatDraft} onSend={(text) => onChat(text, true)} placeholder="Team chat" t={t} />
          ) : match.yourTeam === 0 ? (
            <ChatBox messages={match.chat.filter(c => c.team == null)} draft={globalChatDraft} setDraft={setGlobalChatDraft} onSend={(text) => onChat(text, false)} placeholder="Global chat" t={t} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChatBox({
  messages,
  draft,
  setDraft,
  onSend,
  placeholder,
  t
}: {
  messages: NonNullable<State["match"]>["chat"];
  draft: string;
  setDraft: (v: string) => void;
  onSend: (text: string) => void;
  placeholder: string;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [messages.length]);

  return (
    <div className="rq-chat">
      <div className="rq-chat-log" ref={ref}>
        {messages.map((c, i) => (
          <p key={i}>
            <strong>{c.name ?? t("lobby.player")}</strong> {c.text}
          </p>
        ))}
        {messages.length === 0 && <p className="muted">{t("lobby.chatempty")}</p>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          onSend(text);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          maxLength={240}
        />
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
  t,
}: {
  team: NonNullable<State["match"]>["teams"][number];
  me: string;
  align: "left" | "right";
  forms: Record<string, RecentForm>;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  // Which row is showing its full card, and where that row is on screen. Kept
  // here rather than per row so only one card can be open at a time.
  const [open, setOpen] = useState<{ steamId: string; rect: DOMRect } | null>(null);

  return (
    <ul className={`rq-roster ${align}`}>
      {team.players.map((p) => (
        <li
          key={p.steamId}
          className={`${p.steamId === me ? "me" : ""} ${p.bot ? "bot" : ""}`}
          onMouseEnter={(e) => !p.bot && setOpen({ steamId: p.steamId, rect: e.currentTarget.getBoundingClientRect() })}
          onMouseLeave={() => setOpen((o) => (o?.steamId === p.steamId ? null : o))}
        >
          {p.bot
            ? <span className="rq-avatar" aria-hidden>{(p.name ?? "?").slice(0, 1).toUpperCase()}</span>
            : <LevelBadge elo={p.elo} matches={p.matches} size="md" />}
          <span className="rq-player">
            <span className="rq-member-name">
              {p.name ?? "—"}
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
      ))}

      {open && (
        <FormCard
          form={forms[open.steamId]}
          name={team.players.find((p) => p.steamId === open.steamId)?.name ?? "—"}
          anchor={open.rect}
          onClose={() => setOpen(null)}
        />
      )}
    </ul>
  );
}
