"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A full-screen game lives below the site header rather than under it. Flagging
 * `body.in-game` lets the site header turn itself into the game's top bar, tuck
 * the friends button into it, and expose its hide toggle. The header owns the
 * `--games-top-inset` variable the boards reserve (see NavBar), so it can zero
 * it out when hidden.
 */
export function useGameChrome() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("in-game");
    return () => document.body.classList.remove("in-game");
  }, []);
}

export type GameEvent = { seq: number; type: string; at: number; [k: string]: any };

/**
 * Fire `handler` once per *new* server event. The games ship a rolling event
 * log inside their state so the client can drive sound and motion off what
 * actually happened rather than diffing two snapshots. The log present on the
 * first state is treated as history and skipped.
 */
export function useGameEvents(events: GameEvent[] | undefined, handler: (e: GameEvent) => void) {
  const seenRef = useRef(0);
  const primedRef = useRef(false);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!events || events.length === 0) return;
    if (!primedRef.current) {
      primedRef.current = true;
      seenRef.current = events[events.length - 1].seq;
      return;
    }
    for (const e of events) {
      if (e.seq > seenRef.current) {
        seenRef.current = e.seq;
        handlerRef.current(e);
      }
    }
  }, [events]);
}

/**
 * `name` is null when nobody has one for this id.
 *
 * It used to be a string that the API filled with the SteamID when it had
 * nothing better, which made every caller's "Player 4821" fallback dead code —
 * a 17-digit string satisfies `??` perfectly well — and put people's own
 * SteamIDs on screen as their nicknames. An avatar can exist without a name, so
 * the two are separate rather than the whole entry being dropped.
 */
export type ResolvedPlayer = { name: string | null; avatar: string | null };
export type PlayerNameMap = Record<string, ResolvedPlayer>;

// Module-level cache so navigating hub <-> lobby doesn't refetch the same ids
const nameCache = new Map<string, ResolvedPlayer>();

/**
 * Identity used by the games hub: the logged-in Steam session if present,
 * otherwise a persistent per-browser guest id.
 */
export function useGameIdentity(): string | null {
  const [steamId, setSteamId] = useState<string | null>(null);

  useEffect(() => {
    const fallbackGuest = () => {
      let guestId = localStorage.getItem("garden_guest_id");
      if (!guestId) {
        guestId = "GUEST_" + Math.random().toString(36).slice(2, 11);
        localStorage.setItem("garden_guest_id", guestId);
      }
      setSteamId(guestId);
    };

    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((session) => {
        if (session.steamId) setSteamId(session.steamId);
        else fallbackGuest();
      })
      .catch(fallbackGuest);
  }, []);

  return steamId;
}

/**
 * Batch-resolve display names + avatars for SteamID64s via /api/players/resolve.
 * Guest and bot ids are skipped (label those with displayNameFor below).
 */
export function usePlayerNames(ids: string[]): PlayerNameMap {
  const [names, setNames] = useState<PlayerNameMap>({});
  const pendingRef = useRef<Set<string>>(new Set());

  const numericIds = ids.filter((id) => /^\d{5,20}$/.test(id));
  const key = numericIds.slice().sort().join(",");

  useEffect(() => {
    if (!key) return;

    const cached: PlayerNameMap = {};
    const missing: string[] = [];
    for (const id of key.split(",")) {
      const hit = nameCache.get(id);
      if (hit) cached[id] = hit;
      else if (!pendingRef.current.has(id)) missing.push(id);
    }
    if (Object.keys(cached).length > 0) {
      setNames((prev) => ({ ...prev, ...cached }));
    }
    if (missing.length === 0) return;

    missing.forEach((id) => pendingRef.current.add(id));
    fetch("/api/players/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: missing }),
    })
      .then((r) => r.json())
      .then((data) => {
        const players: PlayerNameMap = data.players || {};
        for (const [id, p] of Object.entries(players)) nameCache.set(id, p);
        setNames((prev) => ({ ...prev, ...players }));
      })
      .catch(() => {})
      .finally(() => missing.forEach((id) => pendingRef.current.delete(id)));
  }, [key]);

  return names;
}

/** Display name for any lobby participant (player object from lobby state). */
export function displayNameFor(
  steamId: string,
  names: PlayerNameMap,
  player?: { isBot?: boolean; botName?: string }
): string {
  if (player?.isBot) return player.botName ? `${player.botName} (bot)` : "Bot";
  if (steamId.startsWith("BOT_")) return "Bot";
  if (steamId.startsWith("GUEST_")) return `Guest ${steamId.slice(-4).toUpperCase()}`;
  return names[steamId]?.name || `Player ${steamId.slice(-4)}`;
}
