import { prisma } from "@/lib/db";

// What a player is called.
//
// Three sources, and the order matters because they answer slightly different
// questions:
//
//   1. TournamentTeamMember.DisplayName — what this player is called FOR THIS
//      TOURNAMENT. An organizer sets it precisely so a bracket does not
//      inherit clan tags and jokes, so when it exists it wins.
//   2. PlayerProfile.LastKnownName — their Steam name, for anybody who never
//      set a tournament name.
//   3. The SteamID64.
//
// Third was happening far too often. The tournament page looked only at the
// profile and fell straight through to the raw id — so a player who had never
// touched the ladder appeared as 76561198… in the bracket, the rosters and the
// stats table, and every bot appeared that way too because a synthetic account
// has no profile row at all. DisplayName was populated the whole time and was
// simply never read.

/** Pure, so the ordering can be reasoned about without a database. */
export function resolveName(
  displayName: string | null | undefined,
  profileName: string | null | undefined,
  steamId: string,
): string {
  const display = displayName?.trim();
  if (display) return display;

  const profile = profileName?.trim();
  if (profile) return profile;

  return steamId;
}

/**
 * Every name in one tournament, keyed by SteamID64.
 *
 * One query per source rather than one per player: a tournament of sixteen
 * 3v3 teams is 48 people, and 48 round trips to render a page is the kind of
 * thing that is invisible in testing and obvious in production.
 */
export async function tournamentPlayerNames(
  tournamentId: number,
): Promise<Record<string, string>> {
  const members = await prisma.tournamentTeamMember.findMany({
    where: { Team: { TournamentId: tournamentId } },
    select: { SteamId: true, DisplayName: true },
  });

  if (members.length === 0) return {};

  const profiles = await prisma.playerProfile.findMany({
    where: { SteamId: { in: members.map((m) => m.SteamId) } },
    select: { SteamId: true, LastKnownName: true },
  });

  const profileName = new Map(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName]));

  const out: Record<string, string> = {};
  for (const m of members) {
    const id = m.SteamId.toString();
    out[id] = resolveName(m.DisplayName, profileName.get(id), id);
  }
  return out;
}

/**
 * Names across every tournament, for the cross-event leaderboards.
 *
 * A player can carry a different display name in each event they enter, so
 * "their name" is genuinely ambiguous here. The most recent one wins, on the
 * grounds that a leaderboard is read now and the name somebody uses now is the
 * one a reader will recognise.
 */
export async function allPlayerNames(steamIds: bigint[]): Promise<Record<string, string>> {
  if (steamIds.length === 0) return {};

  const [members, profiles] = await Promise.all([
    prisma.tournamentTeamMember.findMany({
      where: { SteamId: { in: steamIds }, DisplayName: { not: null } },
      orderBy: { Id: "desc" },
      select: { SteamId: true, DisplayName: true },
    }),
    prisma.playerProfile.findMany({
      where: { SteamId: { in: steamIds } },
      select: { SteamId: true, LastKnownName: true },
    }),
  ]);

  // Descending by id, so the first row seen for a player is their newest and
  // every later one can be skipped.
  const display = new Map<string, string | null>();
  for (const m of members) {
    const id = m.SteamId.toString();
    if (!display.has(id)) display.set(id, m.DisplayName);
  }

  const profileName = new Map(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName]));

  const out: Record<string, string> = {};
  for (const steamId of steamIds) {
    const id = steamId.toString();
    out[id] = resolveName(display.get(id), profileName.get(id), id);
  }
  return out;
}
