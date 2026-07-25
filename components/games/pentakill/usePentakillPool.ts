"use client";

// Fetches the PENTAKILL champion pool once per tab. Mirrors useHeadshotPool:
// the whole list has to be on the client for autocomplete and local scoring, so
// it is fetched once, cached at module level, and shared by the daily page and
// the lobby race.

import { useEffect, useState } from "react";
import type { LolChampion } from "@/scripts/pentakillRules";

export type ChampionPool = {
  date: string;
  patch: string;
  generatedAt: string;
  champions: LolChampion[];
  byId: Map<string, LolChampion>;
  /** Data Dragon square portrait for a champion. */
  portrait: (c: LolChampion) => string;
};

let cached: ChampionPool | null = null;
let inflight: Promise<ChampionPool> | null = null;

async function load(): Promise<ChampionPool> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = fetch("/api/pentakill/champions")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      const byId = new Map<string, LolChampion>(data.champions.map((c: LolChampion) => [c.id, c]));
      cached = {
        date: data.date,
        patch: data.patch,
        generatedAt: data.generatedAt,
        champions: data.champions,
        byId,
        portrait: (c: LolChampion) =>
          `https://ddragon.leagueoflegends.com/cdn/${data.patch}/img/champion/${c.image}`,
      };
      return cached;
    })
    .finally(() => { inflight = null; });

  return inflight;
}

export function usePentakillPool() {
  const [pool, setPool] = useState<ChampionPool | null>(cached);
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
