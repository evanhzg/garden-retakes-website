import { prisma } from "@/lib/db";
import { pickupMatchKey } from "@/lib/tournament/pickup";
import { beginRolesOrVeto } from "@/lib/tournament/vetoRunner";
import {
  canOfferRematch,
  rematchPool,
  rematchVote,
  sequenceForMatch,
  type Slot,
  type VoteState,
  type Voter,
} from "@/lib/tournament/rematch";
import type { VetoStep } from "@/lib/tournament/veto";

// The database half of the rematch. lib/tournament/rematch.ts decides; this
// reads the rows it needs and writes the match it produces.

export type RematchStatus = {
  /** Whether the button should be offered at all, and why not. */
  available: boolean;
  reason: string | null;
  /** Who still has to answer, as SteamID strings. */
  waitingOn: string[];
  /** Everybody's answer so far, for drawing the list. */
  accepted: string[];
  declined: string[];
  /** The rematch, once it exists. */
  matchId: number | null;
  url: string | null;
};

/**
 * Everybody playing the match, with the party they arrived in.
 *
 * The party is what makes the premade shortcut possible, and it is not stored
 * on the match: a pickup team IS the party that queued together — that is how
 * createPickupMatch builds it — so the team row is the party, and its captain
 * is the leader. A tournament team is the same shape for this purpose.
 *
 * That equivalence is worth stating because it is load-bearing and invisible:
 * without it there is no party id anywhere in the match tables and the
 * shortcut could not exist at all.
 */
async function votersFor(matchId: number): Promise<Voter[]> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { TeamAId: true, TeamBId: true },
  });

  if (!match) return [];

  const teamIds = [match.TeamAId, match.TeamBId].filter((x): x is number => x !== null);
  if (teamIds.length === 0) return [];

  const members = await prisma.tournamentTeamMember.findMany({
    where: { TeamId: { in: teamIds }, Status: "accepted" },
    select: { TeamId: true, SteamId: true, IsCaptain: true, IsBot: true },
  });

  return members.map((m) => ({
    steamId: m.SteamId.toString(),
    partyId: String(m.TeamId),
    isPartyLeader: m.IsCaptain,
    isBot: m.IsBot,
  }));
}

async function votesFor(matchId: number): Promise<VoteState> {
  const rows = await prisma.tournamentRematchVote.findMany({
    where: { MatchId: matchId },
    select: { SteamId: true, Accepted: true },
  });

  return {
    accepted: rows.filter((r) => r.Accepted).map((r) => r.SteamId.toString()),
    declined: rows.filter((r) => !r.Accepted).map((r) => r.SteamId.toString()),
  };
}

/** Where the rematch offer stands, for the match page's poll. */
export async function rematchStatus(matchId: number): Promise<RematchStatus> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    include: {
      Maps: { orderBy: { Ordinal: "asc" } },
      Tournament: { select: { Id: true, Slug: true } },
    },
  });

  const none: RematchStatus = {
    available: false,
    reason: "No such match.",
    waitingOn: [],
    accepted: [],
    declined: [],
    matchId: null,
    url: null,
  };

  if (!match) return none;

  // Already made. Everything else is moot — the answer is the link.
  const existing = await prisma.tournamentMatch.findFirst({
    where: { RematchOfMatchId: matchId },
    select: { Id: true },
  });

  if (existing) {
    return {
      available: false,
      reason: null,
      waitingOn: [],
      accepted: [],
      declined: [],
      matchId: existing.Id,
      url: `/tournaments/${match.Tournament.Slug}/match/${existing.Id}`,
    };
  }

  const pool = (
    await prisma.tournamentMap.findMany({
      where: { TournamentId: match.TournamentId },
      orderBy: { Ordinal: "asc" },
      select: { Map: true },
    })
  ).map((m) => m.Map);

  const offer = canOfferRematch({
    state: match.State,
    played: match.Maps.map((m) => m.Map),
    pool,
    alreadyRematched: false,
  });

  if (!offer.ok) {
    return { ...none, reason: offer.error };
  }

  const [voters, votes] = await Promise.all([votersFor(matchId), votesFor(matchId)]);
  const outcome = rematchVote(voters, votes);

  return {
    available: true,
    reason: null,
    waitingOn: outcome.kind === "pending" ? outcome.waitingOn : [],
    accepted: votes.accepted,
    declined: votes.declined,
    matchId: null,
    url: null,
  };
}

/**
 * The pool and the order of play for a match's veto.
 *
 * ONE function, used by everything that replays a veto, because a rematch
 * differs from an ordinary match in two ways at once and getting either half
 * alone is worse than getting neither:
 *
 *   - its pool excludes the map already played, which is game one
 *   - its sequence is 1-2-1 bans with the loser first and no side picks
 *
 * Use the standard pool with the rematch sequence and the veto offers a map
 * that is already in the series. Use the rematch pool with the standard
 * sequence and the loser's compensation quietly disappears. Neither shows up
 * as an error; both change who is favoured.
 */
export async function vetoShapeFor(matchId: number): Promise<{
  pool: string[];
  sequence: VetoStep[] | undefined;
}> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: {
      TournamentId: true,
      BestOf: true,
      TeamAId: true,
      RematchOfMatchId: true,
      Maps: { select: { Map: true, State: true }, orderBy: { Ordinal: "asc" } },
    },
  });

  if (!match) return { pool: [], sequence: undefined };

  const pool = (
    await prisma.tournamentMap.findMany({
      where: { TournamentId: match.TournamentId },
      orderBy: { Ordinal: "asc" },
      select: { Map: true },
    })
  ).map((m) => m.Map);

  if (!match.RematchOfMatchId) return { pool, sequence: undefined };

  // The parent decides the order: the loser of THAT match bans first.
  const parent = await prisma.tournamentMatch.findUnique({
    where: { Id: match.RematchOfMatchId },
    select: { WinnerTeamId: true, TeamAId: true },
  });

  const winner: Slot | null = parent?.WinnerTeamId
    ? parent.WinnerTeamId === parent.TeamAId
      ? "a"
      : "b"
    : null;

  // Game one is carried onto the rematch as a finished map row, so the maps
  // already on the match are exactly what must not be offered again.
  const played = match.Maps.filter((m) => m.State === "finished").map((m) => m.Map);

  return {
    pool: rematchPool(pool, played),
    sequence: sequenceForMatch(true, winner, () => []) as VetoStep[],
  };
}

export type RematchResult =
  | { ok: true; status: RematchStatus }
  | { ok: false; error: string };

/**
 * Record one answer, and create the rematch if that was the last one needed.
 *
 * The create is here rather than in a separate "start" call because the moment
 * the last person agrees is the moment the rematch should exist — a second
 * step would be a lobby of people who have all said yes, waiting for somebody
 * to press a further button.
 */
export async function voteRematch(
  matchId: number,
  steamId: string,
  accepted: boolean,
): Promise<RematchResult> {
  const before = await rematchStatus(matchId);

  if (before.matchId) return { ok: true, status: before };
  if (!before.available) return { ok: false, error: before.reason ?? "Not available." };

  const voters = await votersFor(matchId);
  if (!voters.some((v) => v.steamId === steamId)) {
    return { ok: false, error: "You are not playing in this match." };
  }

  await prisma.tournamentRematchVote.upsert({
    where: { MatchId_SteamId: { MatchId: matchId, SteamId: BigInt(steamId) } },
    create: { MatchId: matchId, SteamId: BigInt(steamId), Accepted: accepted },
    // Changing your mind is allowed right up until the vote resolves. The
    // alternative is a misclick that costs everybody the rematch.
    update: { Accepted: accepted, AtUtc: new Date() },
  });

  const outcome = rematchVote(voters, await votesFor(matchId));
  if (outcome.kind !== "accepted") {
    return { ok: true, status: await rematchStatus(matchId) };
  }

  const created = await createRematch(matchId);
  if (!created.ok) return created;

  return { ok: true, status: await rematchStatus(matchId) };
}

/**
 * Build the rematch: same teams, same sides of the bracket, BO3, 1-0 up.
 *
 * The played map is carried across as a finished map row rather than as a
 * number on the match. It IS game one — the score has to survive, the map has
 * to be visible in the series, and the veto has to know not to offer it.
 */
async function createRematch(matchId: number): Promise<RematchResult> {
  const parent = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    include: {
      Maps: { orderBy: { Ordinal: "asc" } },
      Tournament: { select: { Slug: true } },
    },
  });

  if (!parent) return { ok: false, error: "No such match." };
  if (!parent.WinnerTeamId) return { ok: false, error: "That match has no winner." };

  // Belt and braces against two last votes landing together. The unique index
  // cannot help — the rematch is a new row, not a constrained one — so this is
  // the check that stops a double-click producing two BO3s.
  const already = await prisma.tournamentMatch.findFirst({
    where: { RematchOfMatchId: matchId },
    select: { Id: true },
  });
  if (already) return { ok: true, status: await rematchStatus(matchId) };

  const played = parent.Maps[0];

  const match = await prisma.tournamentMatch.create({
    data: {
      TournamentId: parent.TournamentId,
      StageId: parent.StageId,
      MatchKey: `rm-pending-${crypto.randomUUID()}`,
      Round: parent.Round,
      Slot: parent.Slot,
      // The played map is game one, so two more decide it.
      BestOf: 3,
      TeamAId: parent.TeamAId,
      TeamBId: parent.TeamBId,
      RematchOfMatchId: parent.Id,
      // Everybody has just agreed to play, so there is nothing to ready up for
      // — the same reasoning as a pickup, and for the same people.
      ReadyA: true,
      ReadyB: true,
      State: "pending",
    },
  });

  await prisma.tournamentMatch.update({
    where: { Id: match.Id },
    data: { MatchKey: pickupMatchKey(match.Id) },
  });

  // Game one, already played, already won. Ordinal 0 so the two maps the veto
  // produces land after it.
  if (played) {
    await prisma.tournamentMatchMap.create({
      data: {
        MatchId: match.Id,
        Ordinal: 0,
        Map: played.Map,
        ScoreA: played.ScoreA,
        ScoreB: played.ScoreB,
        WinnerTeamId: played.WinnerTeamId,
        StartSideTeamA: played.StartSideTeamA,
        State: "finished",
      },
    });

    // And the series score follows from it: 1-0 to whoever won.
    await prisma.tournamentMatch.update({
      where: { Id: match.Id },
      data: {
        ScoreA: played.WinnerTeamId === parent.TeamAId ? 1 : 0,
        ScoreB: played.WinnerTeamId === parent.TeamBId ? 1 : 0,
      },
    });
  }

  try {
    await beginRolesOrVeto(match.Id);
  } catch (err) {
    console.error(`rematch ${match.Id}: could not open the draft —`, err);
  }

  return { ok: true, status: await rematchStatus(matchId) };
}
