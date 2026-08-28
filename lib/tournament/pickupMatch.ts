import { prisma } from "@/lib/db";
import { VETO_MAPS } from "@/lib/maps";
import {
  pickupMatchKey,
  pickupName,
  pickupSlug,
  pickupTeamName,
  validatePickup,
  type PickupTeam,
} from "@/lib/tournament/pickup";

// A formed lobby, made into a match.
//
// The DB half of pickup.ts. Everything decidable from the rosters is decided
// there; this only writes rows, and it writes exactly the rows a tournament
// match already has — so the match page, the role draft, the veto, the server
// queue, the scoreboard and the admin controls all work on a pickup without
// knowing it is one.
//
// The tournament it hangs off is created once per team size and reused for
// ever. It is Published: false, so it never appears in the hub beside real
// events, and State "live" with StartedAt set, because every gate downstream
// asks "has this tournament started" before letting a match run.

/**
 * The hidden tournament for pickups of this size, creating it the first time.
 *
 * Its map pool is the veto pool — the Active Duty seven, the same list the
 * tournaments run — not everything the servers can load. Ten maps is nine bans
 * before a BO1 starts, which is minutes of banning for a pickup game. The veto
 * reads the pool from the tournament, so without this a pickup would have
 * nothing to ban at all.
 */
export async function pickupTournamentFor(teamSize: number) {
  const slug = pickupSlug(teamSize);

  const existing = await prisma.tournament.findUnique({ where: { Slug: slug } });
  if (existing) return existing;

  const created = await prisma.tournament.create({
    data: {
      Slug: slug,
      Name: pickupName(teamSize),
      Description: "Blitz games formed in the lobby. Not a scheduled event.",
      State: "live",
      TeamSize: teamSize,
      MaxTeams: 9999,
      Format: "single",
      BestOf: 1,
      Seeding: "manual",
      // Hidden: a pickup is not an event and must not sit in the hub next to
      // one. Everything that lists tournaments filters on Published.
      Published: false,
      StartedAt: new Date(),
    },
  });

  await prisma.tournamentMap.createMany({
    data: VETO_MAPS.map((m, i) => ({ TournamentId: created.Id, Map: m, Ordinal: i })),
    skipDuplicates: true,
  });

  return created;
}

/** One stage per pickup tournament; every pickup match is a round of its own. */
async function pickupStage(tournamentId: number) {
  const existing = await prisma.tournamentStage.findFirst({
    where: { TournamentId: tournamentId },
    orderBy: { Id: "asc" },
  });

  if (existing) return existing;

  return prisma.tournamentStage.create({
    data: {
      TournamentId: tournamentId,
      Name: "Pickups",
      Kind: "single",
      Ordinal: 0,
      BestOf: 1,
      State: "live",
    },
  });
}

export type PickupResult =
  | { ok: true; matchId: number; slug: string; url: string }
  | { ok: false; error: string };

/**
 * Turns two rosters into a match and hands back where to send everybody.
 *
 * Teams are created fresh per match rather than reused. A pickup team is not an
 * identity — the same four people in a different arrangement next game are a
 * different team, and reusing a row would attach this game's stats to that one.
 * The cost is rows, which are cheap; the alternative is a scoreboard that lies.
 */
export async function createPickupMatch(args: {
  teamSize: number;
  a: PickupTeam;
  b: PickupTeam;
  /** Display names by SteamID, for naming the teams after their captains. */
  names?: Record<string, string | null>;
}): Promise<PickupResult> {
  const check = validatePickup(args.teamSize, args.a, args.b);
  if (!check.ok) return { ok: false, error: check.error };

  const tournament = await pickupTournamentFor(args.teamSize);
  const stage = await pickupStage(tournament.Id);

  const names = args.names ?? {};
  const nameOf = (id: string) => names[id.trim()] ?? null;

  const made: number[] = [];

  for (const [side, team, fallback] of [
    ["A", args.a, "Team A"],
    ["B", args.b, "Team B"],
  ] as const) {
    void side;

    const captain = team.players[0].trim();

    const row = await prisma.tournamentTeam.create({
      data: {
        TournamentId: tournament.Id,
        // Unique per tournament, and a pickup tournament lives for ever — so the
        // name carries the clock, or the second game of the evening collides
        // with the first.
        Name: `${pickupTeamName(team, nameOf(captain), fallback)} #${Date.now() % 100000}`.slice(0, 64),
        CaptainSteamId: BigInt(captain),
        Status: "accepted",
      },
    });

    await prisma.tournamentTeamMember.createMany({
      data: team.players.map((p, i) => ({
        TeamId: row.Id,
        SteamId: BigInt(p.trim()),
        IsCaptain: i === 0,
        Status: "accepted",
        RespondedAt: new Date(),
      })),
      skipDuplicates: true,
    });

    made.push(row.Id);
  }

  const match = await prisma.tournamentMatch.create({
    data: {
      TournamentId: tournament.Id,
      StageId: stage.Id,
      // Replaced immediately below with one built from the id, which is the only
      // thing guaranteed unique. Temporary and unique so the insert cannot
      // collide with a concurrent lobby.
      MatchKey: `pu-pending-${crypto.randomUUID()}`,
      Round: 1,
      Slot: 0,
      BestOf: 1,
      TeamAId: made[0],
      TeamBId: made[1],
      State: "pending",
    },
  });

  await prisma.tournamentMatch.update({
    where: { Id: match.Id },
    data: { MatchKey: pickupMatchKey(match.Id) },
  });

  return {
    ok: true,
    matchId: match.Id,
    slug: tournament.Slug,
    url: `/tournaments/${tournament.Slug}/match/${match.Id}`,
  };
}
