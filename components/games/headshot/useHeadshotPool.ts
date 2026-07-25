"use client";

// Fetches the HEADSHOT roster once per tab and hands back the answer pools.
//
// The whole list has to be on the client anyway — autocomplete needs it, and
// scoring a guess locally is what makes the grid feel instant — so it is
// fetched once, cached at module level, and shared by the daily page and the
// lobby race.

import { useEffect, useState } from "react";
import type { HeadshotPlayer } from "@/scripts/headshotRules";

export type Pool = {
  date: string;
  generatedAt: string;
  source: string;
  players: HeadshotPlayer[];
  byId: Map<string, HeadshotPlayer>;
  daily: HeadshotPlayer[];
  endless: HeadshotPlayer[];
};

let cached: Pool | null = null;
let inflight: Promise<Pool> | null = null;

async function load(): Promise<Pool> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = fetch("/api/headshot/players")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      const byId = new Map<string, HeadshotPlayer>(data.players.map((p: HeadshotPlayer) => [p.id, p]));
      // Answer pools arrive as id lists in fame order; rebuild them in place.
      const resolve = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean) as HeadshotPlayer[];
      cached = {
        date: data.date,
        generatedAt: data.generatedAt,
        source: data.source,
        players: data.players,
        byId,
        daily: resolve(data.daily || []),
        endless: resolve(data.endless || []),
      };
      return cached;
    })
    .finally(() => { inflight = null; });

  return inflight;
}

export function useHeadshotPool() {
  const [pool, setPool] = useState<Pool | null>(cached);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    load()
      .then((p) => { if (alive) setPool(p); })
      .catch((e) => { if (alive) setError(String(e.message || e)); });
    return () => { alive = false; };
  }, [attempt]);

  return { pool, error, retry: () => { cached = null; setAttempt((a) => a + 1); } };
}
