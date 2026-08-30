"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, Send } from "lucide-react";

import { useI18n } from "@/components/I18nProvider";
import { useSocket } from "@/components/SocketProvider";
import CallAdmin from "./CallAdmin";
import "./roomchat.css";

type Line = {
  id: number;
  steamId: string;
  name: string | null;
  role: string | null;
  /** "room" — typed here — or "game", said in the server. */
  source: string;
  body: string;
  at: string;
};

/**
 * Fast, because a conversation is the one thing on this page where lag is felt.
 *
 * The socket carries the "something arrived" signal and this refetches; the
 * poll underneath makes a dropped socket a slower room rather than a silent
 * one. `after` means the steady state returns nothing at all.
 */
const POLL_MS = 2500;

/**
 * The match room.
 *
 * Two teams arranging themselves, and an organizer trying to work out what
 * happened. Today that conversation is in Discord, in a DM, or nowhere — and
 * the organizer who arrives at a problem has no idea what has already been
 * said. Beside the match, in public, it is context for whoever turns up next.
 *
 * The call-admin button lives in the header rather than at the bottom of the
 * conversation, because the moment you need it is the moment you have stopped
 * reading.
 */
export default function RoomChat({ matchId }: { matchId: number }) {
  const { t } = useI18n();
  const { socket, steamId } = useSocket();

  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  /**
   * Whether in-game chat is mixed in.
   *
   * On by default, because the whole reason an admin has this open is to see
   * what is being said in the server. Off is for the moment a match is loud and
   * the two people arranging something need to hear each other — which is the
   * clarity the toggle is for.
   */
  const [showGame, setShowGame] = useState(true);

  const cursor = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  /**
   * Adds lines, keyed by id.
   *
   * Three things append to this room and they race: the POST that sent a
   * message, the socket event the same POST emits, and the two-second poll.
   * Appending blindly meant your own line could arrive twice, and a poll that
   * had already advanced the cursor past it could drop it instead — which is
   * how a message showed for a moment, vanished, and was only there again
   * after a reload.
   *
   * A temporary line is replaced rather than duplicated: it carries a negative
   * id until the server gives it a real one, so the same body from the same
   * sender collapses onto the real row when it lands.
   */
  const merge = useCallback((incoming: Line[]) => {
    setLines((prev) => {
      const byId = new Map(prev.map((l) => [l.id, l]));

      for (const line of incoming) {
        // Whatever pending copy this line is the real version of.
        for (const [id, held] of Array.from(byId.entries())) {
          if (id < 0 && held.body === line.body && held.steamId === line.steamId) {
            byId.delete(id);
          }
        }
        byId.set(line.id, line);
      }

      // Capped at a couple of hundred: a long match room is not something
      // anybody scrolls back through in the browser, and an unbounded list is a
      // page that gets slower the longer it is left open.
      return Array.from(byId.values()).sort((a, b) => a.id - b.id).slice(-200);
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const url = `/api/tournament/room?matchId=${matchId}` +
        (cursor.current === null ? "" : `&after=${cursor.current}`);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;

      const data: { messages: Line[] } = await res.json();
      if (data.messages.length === 0) return;

      cursor.current = Math.max(cursor.current ?? 0, data.messages[data.messages.length - 1].id);
      merge(data.messages);
    } catch {
      // A dropped poll is a late line, not a broken room.
    }
  }, [matchId, merge]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onRoom = (p: { matchId?: number }) => {
      if (p?.matchId === matchId) load();
    };
    socket.on("t:room", onRoom);
    return () => {
      socket.off("t:room", onRoom);
    };
  }, [socket, matchId, load]);

  // Stick to the newest line.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || sending) return;

    setInput("");
    setSending(true);

    /**
     * Shown straight away, under a negative id.
     *
     * It used to wait for the response and put the text back into the box if
     * one did not arrive with a `message` on it — so a save that worked but
     * answered slowly, or answered without the echo, looked exactly like a
     * failure: the line flashed, went, and the text reappeared ready to be sent
     * a second time. The message was in the room the whole time, which is why a
     * reload showed it.
     *
     * Negative because every real id is positive and `merge` uses the sign to
     * know which lines are still waiting for one.
     */
    const pendingId = -Date.now();
    merge([
      {
        id: pendingId,
        steamId: steamId ?? "",
        // Left blank rather than guessed: the server decides the name and the
        // role badge, and inventing one here then correcting it a moment later
        // is what made your own line flicker between two colours.
        name: null,
        role: null,
        source: "room",
        body,
        at: new Date().toISOString(),
      } as Line,
    ]);

    try {
      const res = await fetch("/api/tournament/room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId, body }),
      });
      const data = await res.json().catch(() => null);

      if (data?.message) {
        cursor.current = Math.max(cursor.current ?? 0, data.message.id);
        merge([data.message]);
        return;
      }

      // Refused outright — signed out, or a body the server would not take. The
      // text goes back because there is nothing in the room to keep.
      if (!res.ok) {
        setLines((prev) => prev.filter((l) => l.id !== pendingId));
        setInput(body);
        return;
      }

      // Accepted, but the echo did not come back. The message is in the room,
      // so the pending line stays and the next poll replaces it with the real
      // one. Putting the text back here is what caused people to send twice.
      load();
    } catch {
      // The request never completed, which does NOT mean it never arrived. The
      // poll is the arbiter: if it shows up, merge collapses the pending copy
      // onto it; if it does not, the line disappears on its own.
      load();
    } finally {
      setSending(false);
    }
  };

  const shown = showGame ? lines : lines.filter((l) => l.source !== "game");
  const gameCount = lines.reduce((n, l) => n + (l.source === "game" ? 1 : 0), 0);

  return (
    <aside className="rc" aria-label={t("room.title")}>
      <header className="rc-head">
        <h3>{t("room.title")}</h3>

        <div className="rc-head-actions">
          {/* In-game chat, on or off. A count when it is off, so turning it
              down is not the same as not knowing anything happened. */}
          <button
            className={`rc-toggle ${showGame ? "on" : ""}`}
            onClick={() => setShowGame((v) => !v)}
            title={t("room.toggleGame")}
            aria-pressed={showGame}
          >
            <Gamepad2 size={13} />
            {!showGame && gameCount > 0 && <span className="rc-toggle-count">{gameCount}</span>}
          </button>

          <CallAdmin matchId={matchId} />
        </div>
      </header>

      <div className="rc-log" ref={logRef}>
        {shown.length === 0 && <p className="rc-empty">{t("room.empty")}</p>}

        {shown.map((l) => (
          <div
            key={l.id}
            className={`rc-line ${l.steamId === steamId ? "mine" : ""} from-${l.source}`}
          >
            {/* Said in the server, not here. Marked rather than colour-coded,
                because the colours are already spoken for by which side you are
                on and that is the more useful thing to keep. */}
            {l.source === "game" && <Gamepad2 size={11} className="rc-ingame" />}
            {/* Staff say so, and players do not — even when the player IS
                staff. Somebody on one of the two rosters is playing this match,
                and an ADMIN badge on their opinion about their own game reads
                as a ruling on it. The server decides which; see roleFor. */}
            {l.role === "admin" && <span className="rc-admin">ADMIN</span>}
            <span className={`rc-who role-${l.role ?? "none"}`}>{l.name ?? l.steamId}</span>
            <span className="rc-body">{l.body}</span>
          </div>
        ))}
      </div>

      {steamId ? (
        <form className="rc-form" onSubmit={send}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("room.placeholder")}
            maxLength={500}
          />
          <button type="submit" disabled={!input.trim() || sending} aria-label={t("room.send")}>
            <Send size={15} />
          </button>
        </form>
      ) : (
        <p className="rc-signin">{t("room.signIn")}</p>
      )}
    </aside>
  );
}
