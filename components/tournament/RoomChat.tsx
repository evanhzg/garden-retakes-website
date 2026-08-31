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
  /** Who it is for: "room" (everybody) or "a"/"b" (one team). */
  scope?: string;
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

  /**
   * Which team this viewer is on, as the endpoint sees it. Null for anybody
   * else, and null until the first fetch lands.
   *
   * Asked of the server rather than passed in, because the match page's own
   * "mySlot" means CAPTAIN — it is what decides who may ban a map — and every
   * player on a roster has a team channel. Threading that prop down would have
   * offered the tab to two people per match.
   *
   * It only decides whether the tab is drawn. What is readable is decided in
   * the query, which never sends the other team's lines at all.
   */
  const [mySlot, setMySlot] = useState<"a" | "b" | null>(null);

  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  /**
   * Which channel is on screen, and where a new line goes.
   *
   * One fetch feeds both: the endpoint returns the room plus whichever team
   * channel this viewer may read, so switching tabs is a filter rather than a
   * request. Two polls for one panel would double the traffic to show strictly
   * less than one already returns.
   *
   * Defaults to the room even for a player. The room is where the other team
   * is, and a first message meant for them that silently went to your own side
   * is worse than one extra click.
   */
  const [channel, setChannel] = useState<"room" | "team">("room");

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

      const data: { messages: Line[]; viewer?: "a" | "b" | null } = await res.json();

      // Set every time, not only on the first fetch: a player added to a roster
      // mid-veto gets their team tab on the next poll rather than on a reload.
      setMySlot(data.viewer ?? null);

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

  /**
   * Where a new line goes: the tab that is open, resolved to a real scope.
   *
   * Falls back to the room if the team tab is somehow open without a team —
   * a scope of "team" is not a thing the endpoint accepts, and sending one
   * would be refused rather than delivered somewhere unexpected.
   */
  const sendScope: "room" | "a" | "b" = channel === "team" && mySlot ? mySlot : "room";

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
        // The pending line has to carry the scope it was sent with, or a team
        // message shows for a moment in the room tab before the real one lands
        // in the right place.
        scope: sendScope,
        body,
        at: new Date().toISOString(),
      } as Line,
    ]);

    try {
      const res = await fetch("/api/tournament/room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId, body, scope: sendScope }),
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

  // The channel first, then the in-game toggle within it.
  //
  // A line with no scope is a room line: every row written before the column
  // existed is one, and so is everything the plugin relays from the server —
  // in-game chat is said out loud to everybody in it, which is the room.
  const inChannel = lines.filter((l) =>
    channel === "team" ? l.scope === mySlot : (l.scope ?? "room") === "room",
  );

  const shown = showGame ? inChannel : inChannel.filter((l) => l.source !== "game");
  const gameCount = inChannel.reduce((n, l) => n + (l.source === "game" ? 1 : 0), 0);

  // Unread-ish: how much is waiting in the tab that is not open. Not a real
  // unread count — it does not track what has been read — but "there is
  // something over there" is the part that matters when a team is talking
  // during a veto and the room tab is open.
  const otherCount = mySlot
    ? channel === "team"
      ? lines.filter((l) => (l.scope ?? "room") === "room").length
      : lines.filter((l) => l.scope === mySlot).length
    : 0;

  return (
    <aside className="rc" aria-label={t("room.title")}>
      <header className="rc-head">
        {/* The two channels, where the title was.

            Only for somebody with a second one to switch to: a spectator has
            one channel and a pair of tabs with one tab in it is furniture. */}
        {mySlot ? (
          <div className="rc-tabs" role="tablist" aria-label={t("room.title")}>
            <button
              role="tab"
              aria-selected={channel === "room"}
              className={`rc-tab ${channel === "room" ? "on" : ""}`}
              onClick={() => setChannel("room")}
            >
              {t("room.title")}
              {channel === "team" && otherCount > 0 && (
                <span className="rc-tab-count">{otherCount}</span>
              )}
            </button>
            <button
              role="tab"
              aria-selected={channel === "team"}
              className={`rc-tab ${channel === "team" ? "on" : ""}`}
              onClick={() => setChannel("team")}
            >
              {t("room.team")}
              {channel === "room" && otherCount > 0 && (
                <span className="rc-tab-count">{otherCount}</span>
              )}
            </button>
          </div>
        ) : (
          <h3>{t("room.title")}</h3>
        )}

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
        {shown.length === 0 && (
          <p className="rc-empty">{channel === "team" ? t("room.emptyTeam") : t("room.empty")}</p>
        )}

        {shown.map((l) => (
          <div
            key={l.id}
            className={
              `rc-line ${l.steamId === steamId ? "mine" : ""} from-${l.source}` +
              // Marked in the team channel, so a line that is private looks it.
              // Nobody can see this class on a channel they cannot read — the
              // endpoint never sends those lines — it is a reminder, not a gate.
              (l.scope && l.scope !== "room" ? " scope-team" : "")
            }
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
            placeholder={channel === "team" ? t("room.placeholderTeam") : t("room.placeholder")}
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
