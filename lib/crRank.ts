// Competitive Retakes rank levels: FACEIT-style 1-10, derived from
// GardenCompetitiveRating.Elo (a different scale from the general ladder Elo —
// see CompetitiveEloEngine.cs, StartingElo 1000, Floor 100). That table has
// almost no real match history yet (CR only actually started working once the
// RCON/round-scoring fixes landed), so there is no live distribution to
// calibrate percentile cutoffs against. These bands are anchored to the
// engine's own constants instead — StartingElo sits inside level 5, Floor at
// the bottom of level 1 — and are meant to be revisited once real matches
// accumulate.

export const CR_PLACEMENT_MATCHES = 10; // mirrors CompetitiveEloEngine.PlacementMatches

export type CrLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const CUTOFFS: { level: CrLevel; min: number }[] = [
  { level: 1, min: 0 },
  { level: 2, min: 500 },
  { level: 3, min: 700 },
  { level: 4, min: 850 },
  { level: 5, min: 1000 },
  { level: 6, min: 1150 },
  { level: 7, min: 1300 },
  { level: 8, min: 1500 },
  { level: 9, min: 1700 },
  { level: 10, min: 2000 },
];

export function crLevelForElo(elo: number): CrLevel {
  let level: CrLevel = 1;
  for (const c of CUTOFFS) {
    if (elo >= c.min) level = c.level;
  }
  return level;
}

export type CrRankState =
  | { kind: "placement"; matchesPlayed: number; matchesToGo: number }
  | { kind: "ranked"; level: CrLevel; elo: number };

export function crRankState(elo: number | null | undefined, matchesPlayed: number): CrRankState {
  if (matchesPlayed < CR_PLACEMENT_MATCHES) {
    return { kind: "placement", matchesPlayed, matchesToGo: CR_PLACEMENT_MATCHES - matchesPlayed };
  }
  return { kind: "ranked", level: crLevelForElo(elo ?? 0), elo: elo ?? 0 };
}
