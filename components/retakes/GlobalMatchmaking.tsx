"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "@/components/games/SocketProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./matchmaking.css";

/** Below this many seconds the countdown stops being information and starts being a warning. */
const URGENT_AT = 5;

type Player = { steamId: string; name?: string; bot?: boolean; accepted?: boolean };
type Team = { index?: number; name?: string; players: Player[] };

export default function GlobalMatchmaking({ avatarPlayers = [] }: { avatarPlayers?: any[] }) {
  const { socket, isAuthed, steamId } = useSocket();
  const [state, setState] = useState<any>(null);
  const pathname = usePathname();
  const [clicked, setClicked] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!socket || !isAuthed) return;
    socket.emit("rq:hello", {});
    const onState = (s: any) => setState(s);
    socket.on("rq:state", onState);
    return () => { socket.off("rq:state", onState); };
  }, [socket, isAuthed]);

  // Tick for timer
  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  const isFound = Boolean(state?.match && state.match.phase === "found");

  // Lock body scroll when match is found
  useEffect(() => {
    document.body.style.overflow = isFound ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isFound]);

  if (!state || !state.party) return null;
  const isQueueing = state.party.queuedAt !== null;

  const handlePlay = () => {
    if (!socket) return;
    setClicked(true);
    setTimeout(() => setClicked(false), 300);
    if (!isQueueing) socket.emit("rq:queue:join", { mode: state.party.mode });
  };
  const handleStop = () => { if (socket) socket.emit("rq:queue:leave"); };

  const elapsed = isQueueing ? Math.floor((now - state.party.queuedAt) / 1000) : 0;
  const formattedTime = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <>
      <div className="mm-bar">
        <div className="mm-bar-side">
          <div className="mm-avatars">
            {state.party.members.map((m: any) => {
              const p = avatarPlayers.find((ap) => ap.steamId === m.steamId);
              return (
                <div key={m.steamId} className="mm-avatar" title={m.name || undefined}>
                  {p?.avatarSrc ? (
                    <img src={p.avatarSrc} alt={m.name || "Player"} />
                  ) : (
                    <span>{(m.name || "?").charAt(0).toUpperCase()}</span>
                  )}
                </div>
              );
            })}
          </div>
          {state.party.name && <span className="mm-party-name">{state.party.name}</span>}
        </div>

        <div className="mm-bar-centre">
          {!isQueueing ? (
            pathname === "/lobby" ? (
              <button
                className="mm-cta"
                onClick={handlePlay}
                style={clicked ? { transform: "scale(0.97)" } : undefined}
              >
                Play
              </button>
            ) : (
              <Link className="mm-cta" href="/lobby">See lobby</Link>
            )
          ) : (
            <button className="mm-searching" onClick={handleStop} title="Leave the queue">
              <span className="mm-dot" />
              Searching
              <span className="mm-searching-time">{formattedTime}</span>
            </button>
          )}
        </div>

        <div className="mm-bar-side end" />
      </div>

      {isFound && (
        <AcceptModal
          match={state.match}
          mode={state.party.mode}
          me={steamId}
          now={now}
          onAccept={() => socket?.emit("rq:match:accept")}
          onDecline={() => socket?.emit("rq:match:decline")}
        />
      )}

      {pathname !== "/lobby" && (
        <style dangerouslySetInnerHTML={{ __html: `
          header nav a { opacity: 0.4 !important; transition: opacity 0.2s; }
          header nav a:hover { opacity: 0.8 !important; }
        `}} />
      )}
    </>
  );
}

/**
 * The twenty seconds everyone in the lobby is looking at the same screen.
 *
 * Two things were missing and both are the same complaint — the modal asked you
 * to wait without telling you what for. It now shows the clock draining as a bar
 * (readable before the number is), and one mark per player split by side, so
 * "3/6 accepted" has faces attached to it and a lobby can see who it is waiting
 * on. After you accept, the buttons are replaced by the count you are waiting
 * for rather than a dead greyed-out button.
 */
function AcceptModal({
  match,
  mode,
  me,
  now,
  onAccept,
  onDecline,
}: {
  match: { teams: Team[]; accept?: { deadline: number; total: number; done: number } | null };
  mode?: string;
  me?: string | null;
  now: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const accept = match.accept ?? null;
  const secondsLeft = accept ? Math.max(0, Math.ceil((accept.deadline - now) / 1000)) : 0;

  // The window's full length, remembered on first render: the server sends a
  // deadline, not a duration, so without this the bar would start at whatever
  // fraction was left when this component mounted.
  const totalRef = useRef<number | null>(null);
  if (accept && totalRef.current === null) {
    totalRef.current = Math.max(1, Math.ceil((accept.deadline - now) / 1000));
  }
  const total = totalRef.current ?? 1;
  const remaining = Math.min(100, Math.max(0, (secondsLeft / total) * 100));
  const urgent = secondsLeft <= URGENT_AT;

  const iAccepted = useMemo(
    () => match.teams.some((t) => t.players.some((p) => p.steamId === me && p.accepted)),
    [match.teams, me]
  );

  const done = accept?.done ?? 0;
  const totalPlayers = accept?.total ?? 0;
  const waitingOn = Math.max(0, totalPlayers - done);

  return (
    <div className="mm-scrim" role="dialog" aria-modal="true" aria-label="Match found">
      <div className="mm-modal">
        <div className="mm-drain">
          <div
            className={`mm-drain-fill${urgent ? " urgent" : ""}`}
            style={{ width: `${remaining}%` }}
          />
        </div>

        <div className="mm-modal-body">
          <span className="mm-kicker">Ready up</span>
          <h1 className="mm-title">Match found</h1>
          {mode && <p className="mm-mode">{mode.toUpperCase()} · Competitive retakes</p>}

          <div className={`mm-count${urgent ? " urgent" : ""}`} aria-live="off">
            {secondsLeft}
          </div>
          <div className="mm-accepted" aria-live="polite">
            {done} / {totalPlayers} accepted
          </div>

          <div className="mm-teams">
            {match.teams.map((team, i) => (
              <React.Fragment key={team.index ?? i}>
                {i > 0 && <span className="mm-vs">VS</span>}
                <div className="mm-team">
                  {team.players.map((p) => (
                    <span
                      key={p.steamId}
                      // Bots have nothing to accept, so they are always shown ready
                      // rather than as a slot the lobby appears to be waiting on.
                      className={[
                        "mm-slot",
                        p.accepted || p.bot ? "ready" : "",
                        p.steamId === me ? "me" : "",
                      ].filter(Boolean).join(" ")}
                      title={`${p.name ?? "Player"}${p.bot ? " (bot)" : p.accepted ? " — ready" : " — waiting"}`}
                    />
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>

          {iAccepted ? (
            <div className="mm-waiting">
              {waitingOn > 0 ? `Waiting for ${waitingOn} more` : "Starting…"}
            </div>
          ) : (
            <div className="mm-actions">
              <button className="mm-btn primary" onClick={onAccept} autoFocus>
                Accept
              </button>
              <button className="mm-btn" onClick={onDecline}>
                Decline
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
