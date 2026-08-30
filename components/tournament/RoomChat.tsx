"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import { useI18n } from "@/components/I18nProvider";
import { useSocket } from "@/components/SocketProvider";
import CallAdmin from "./CallAdmin";
import "./roomchat.css";

type Line = {
  id: number;
  steamId: string;
  name: string | null;
  role: string | null;
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

  const cursor = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const url = `/api/tournament/room?matchId=${matchId}` +
        (cursor.current === null ? "" : `&after=${cursor.current}`);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;

      const data: { messages: Line[] } = await res.json();
      if (data.messages.length === 0) return;

      cursor.current = data.messages[data.messages.length - 1].id;
      // Capped at a couple of hundred: a long match room is not something
      // anybody scrolls back through in the browser, and an unbounded list is a
      // page that gets slower the longer it is left open.
      setLines((prev) => [...prev, ...data.messages].slice(-200));
    } catch {
      // A dropped poll is a late line, not a broken room.
    }
  }, [matchId]);

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
    try {
      const res = await fetch("/api/tournament/room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId, body }),
      });
      const data = await res.json().catch(() => null);

      // Appended from the response rather than optimistically: the server
      // decides the role badge, and guessing it here then correcting it a
      // moment later makes your own line flicker between two colours.
      if (data?.message) {
        cursor.current = Math.max(cursor.current ?? 0, data.message.id);
        setLines((prev) => [...prev, data.message].slice(-200));
      } else {
        setInput(body);
      }
    } catch {
      setInput(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="rc" aria-label={t("room.title")}>
      <header className="rc-head">
        <h3>{t("room.title")}</h3>
        <CallAdmin matchId={matchId} />
      </header>

      <div className="rc-log" ref={logRef}>
        {lines.length === 0 && <p className="rc-empty">{t("room.empty")}</p>}

        {lines.map((l) => (
          <div key={l.id} className={`rc-line ${l.steamId === steamId ? "mine" : ""}`}>
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
