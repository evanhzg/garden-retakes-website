import { prisma } from "@/lib/db";

// The rows behind a match's hover bubble.
//
// One builder rather than three, because the bracket, the live wall and the
// admin panel all want the same answer, and the interesting part is the same in
// all three: a BO3 has three rows whether or not three maps have been decided,
// and the undecided ones have to say so. Building the rows off `bestOf` rather
// than off the map rows that happen to exist is what makes that true — derive
// them from the table and a BO3 with one map picked looks like a BO1.

export type PreviewRow = {
  ordinal: number;
  /** null until the veto has reached this map. */
  map: string | null;
  label: string | null;
  image: string | null;
  scoreA: number;
  scoreB: number;
  /** Which side of the match won this map, or null while it is undecided. */
  winner: "a" | "b" | null;
  /** The map's own state — pending | live | finished — not the match's. */
  state: string;
  decider: boolean;
};

export type MatchPreview = {
  matchId: number;
  bestOf: number;
  rows: PreviewRow[];
};

const pretty = (map: string) =>
  map
    .replace(/^(de_|cs_|ar_)/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Previews for every match of a tournament, keyed by match id.
 *
 * Three queries regardless of how many matches there are. The bracket renders
 * every match at once, so a per-match query would be one round trip per box.
 */
export async function previewsForTournament(tournamentId: number): Promise<Map<number, MatchPreview>> {
  const matches = await prisma.tournamentMatch.findMany({
    where: { TournamentId: tournamentId },
    select: { Id: true, BestOf: true, TeamAId: true },
  });

  if (matches.length === 0) return new Map();

  const maps = await prisma.tournamentMatchMap.findMany({
    where: { MatchId: { in: matches.map((m) => m.Id) } },
    orderBy: { Ordinal: "asc" },
  });

  // The map library, for the artwork. Missing artwork is normal for a workshop
  // map nobody has given an image to yet, and the row still renders — the name
  // is the part that matters and the background is decoration.
  const names = Array.from(new Set(maps.map((m) => m.Map)));
  const library = names.length
    ? await prisma.gardenMap.findMany({
        where: { MapName: { in: names } },
        select: { MapName: true, ImageUrl: true, DisplayName: true },
      })
    : [];

  const art = new Map(library.map((m) => [m.MapName, m]));

  const byMatch = new Map<number, typeof maps>();
  for (const row of maps) {
    const list = byMatch.get(row.MatchId) ?? [];
    list.push(row);
    byMatch.set(row.MatchId, list);
  }

  const out = new Map<number, MatchPreview>();

  for (const match of matches) {
    const played = byMatch.get(match.Id) ?? [];
    const bestOf = Math.max(1, match.BestOf);
    const rows: PreviewRow[] = [];

    for (let ordinal = 0; ordinal < bestOf; ordinal++) {
      const row = played.find((m) => m.Ordinal === ordinal);

      if (!row) {
        rows.push({
          ordinal,
          map: null,
          label: null,
          image: null,
          scoreA: 0,
          scoreB: 0,
          winner: null,
          state: "pending",
          decider: false,
        });
        continue;
      }

      const meta = art.get(row.Map);
      rows.push({
        ordinal,
        map: row.Map,
        label: meta?.DisplayName || pretty(row.Map),
        image: meta?.ImageUrl ?? null,
        scoreA: row.ScoreA,
        scoreB: row.ScoreB,
        // Stored as a team id, so which side of the bubble that is depends on
        // the match rather than on the map row.
        winner: row.WinnerTeamId == null ? null : row.WinnerTeamId === match.TeamAId ? "a" : "b",
        state: row.State,
        decider: row.IsDecider,
      });
    }

    out.set(match.Id, { matchId: match.Id, bestOf, rows });
  }

  return out;
}
