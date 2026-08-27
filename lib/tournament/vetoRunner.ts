import { prisma } from "@/lib/db";
import { autoAction, vetoState, type VetoAction, type Side } from "@/lib/tournament/veto";

// Finishing a veto: turning its result into maps, playing it out for bots, and
// letting an organizer set the maps by hand.
//
// The first of those closes a real gap. The veto recorded its actions and
// computed a state with `picked` in it — and nothing ever wrote those picks
// into TournamentMatchMap. startMatch() looks for the next unplayed map row and
// would have found none, so a match whose veto had completed correctly still
// had nothing to play. Materialising is now part of finishing the veto rather
// than an assumed step somebody else does.

/** The actions so far, in the shape lib/tournament/veto.ts expects. */
async function actionsFor(matchId: number): Promise<VetoAction[]> {
  const rows = await prisma.tournamentVetoAction.findMany({
    where: { MatchId: matchId },
    orderBy: { Ordinal: "asc" },
  });

  return rows.map((v) => ({
    ordinal: v.Ordinal,
    teamId: v.TeamId,
    kind: v.Kind as VetoAction["kind"],
    map: v.Map ?? undefined,
    side: (v.Side as Side | null) ?? undefined,
  }));
}

async function poolFor(tournamentId: number): Promise<string[]> {
  const maps = await prisma.tournamentMap.findMany({
    where: { TournamentId: tournamentId },
    orderBy: { Ordinal: "asc" },
    select: { Map: true },
  });
  return maps.map((m) => m.Map);
}

/**
 * Write a finished veto's picks into the match's map list.
 *
 * Idempotent: called again on a match that already has its maps, it does
 * nothing. Both the veto route and the admin override end here, so there is one
 * place that decides what "the maps for this match" means.
 */
export async function materialiseMaps(matchId: number): Promise<{ ok: boolean; maps: string[] }> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    include: { Maps: true },
  });
  if (!match) return { ok: false, maps: [] };

  // Already done. Not an error — a retry, a second admin pressing the same
  // button, or a GET that advanced an expired turn and reached completion.
  if (match.Maps.length > 0) {
    return { ok: true, maps: match.Maps.map((m) => m.Map) };
  }

  const pool = await poolFor(match.TournamentId);
  const state = vetoState(pool, match.BestOf, await actionsFor(matchId));

  if (!state.done || state.picked.length === 0) return { ok: false, maps: [] };

  await prisma.tournamentMatchMap.createMany({
    data: state.picked.map((p, i) => ({
      MatchId: matchId,
      Ordinal: i,
      Map: p.map,
      PickedByTeamId: p.pickedBy === "A" ? match.TeamAId : p.pickedBy === "B" ? match.TeamBId : null,
      SideChosenByTeamId:
        p.sideChosenBy === "A" ? match.TeamAId : p.sideChosenBy === "B" ? match.TeamBId : null,
      StartSideTeamA: p.startSideTeamA,
      IsDecider: p.isDecider,
      State: "pending",
    })),
  });

  await prisma.tournamentMatch.update({
    where: { Id: matchId },
    data: { State: "ready", VetoDeadline: null },
  });

  return { ok: true, maps: state.picked.map((p) => p.map) };
}

/**
 * Play a veto out without captains.
 *
 * Used for bot matches and as the organizer's "just decide it" button. Reuses
 * autoAction — the same function the turn timer uses when somebody runs out of
 * clock — so an auto-vetoed match is indistinguishable from one where both
 * captains timed out, rather than being a third code path with its own idea of
 * what a legal veto is.
 *
 * The map choice is randomised on top of that, because autoAction always takes
 * the first remaining map: a whole bracket auto-vetoed would play Dust2 in
 * every single match, which tells you nothing about how the pages look.
 */
export async function autoVeto(
  matchId: number,
  random: () => number = Math.random,
): Promise<{ ok: boolean; maps: string[]; steps: number }> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { Id: true, TournamentId: true, BestOf: true, TeamAId: true, TeamBId: true },
  });
  if (!match) return { ok: false, maps: [], steps: 0 };

  const pool = await poolFor(match.TournamentId);
  if (pool.length === 0) return { ok: false, maps: [], steps: 0 };

  let actions = await actionsFor(matchId);
  let steps = 0;

  // Bounded rather than while(true): a veto is at most pool-size-plus-picks
  // long, and a bug in the sequence must not spin here forever.
  const cap = pool.length * 2 + 8;

  while (steps < cap) {
    const state = vetoState(pool, match.BestOf, actions);
    if (state.done || !state.next) break;

    const auto = autoAction(pool, match.BestOf, actions);
    if (!auto) break;

    // Randomise which map, keeping the KIND the sequence asked for.
    const map =
      auto.kind === "side"
        ? undefined
        : state.remaining[Math.floor(random() * state.remaining.length)] ?? auto.map;

    const side: Side | undefined = auto.kind === "side" ? (random() < 0.5 ? "T" : "CT") : undefined;

    const teamId =
      state.next.team === "A" ? match.TeamAId : state.next.team === "B" ? match.TeamBId : null;

    await prisma.tournamentVetoAction.create({
      data: {
        MatchId: matchId,
        Ordinal: actions.length,
        TeamId: teamId,
        Kind: auto.kind,
        Map: map ?? null,
        Side: side ?? null,
        // Recorded as automatic, because it was. A veto board that showed these
        // as choices somebody made would be lying about the match.
        WasAuto: true,
      },
    });

    actions.push({ ordinal: actions.length, teamId, kind: auto.kind, map, side });
    steps++;
  }

  const result = await materialiseMaps(matchId);
  return { ok: result.ok, maps: result.maps, steps };
}

/**
 * The organizer setting the maps by hand.
 *
 * The escape hatch for when the veto has gone wrong, a team is unreachable, or
 * the maps were agreed somewhere else entirely — which happens, and previously
 * meant editing the database. Clears whatever veto exists first, so the board
 * does not show a sequence that disagrees with the maps being played.
 */
export async function setMapsDirectly(
  matchId: number,
  maps: { map: string; startSideTeamA?: Side | null }[],
): Promise<{ ok: boolean; error?: string }> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    include: { Maps: true },
  });
  if (!match) return { ok: false, error: "No such match." };

  const clean = maps.filter((m) => m.map?.trim()).slice(0, Math.max(1, match.BestOf));
  if (clean.length === 0) return { ok: false, error: "No maps given." };

  // A map that has already been played keeps its score — overwriting a live
  // series' history to change a map nobody has reached yet would be a much
  // bigger action than the button says.
  const played = match.Maps.filter((m) => m.State === "finished");
  if (played.length >= clean.length) {
    return { ok: false, error: "Those maps have already been played." };
  }

  await prisma.$transaction([
    prisma.tournamentMatchMap.deleteMany({
      where: { MatchId: matchId, State: { not: "finished" } },
    }),
    prisma.tournamentVetoAction.deleteMany({ where: { MatchId: matchId } }),
    prisma.tournamentMatchMap.createMany({
      data: clean.slice(played.length).map((m, i) => ({
        MatchId: matchId,
        Ordinal: played.length + i,
        Map: m.map.trim(),
        StartSideTeamA: m.startSideTeamA ?? null,
        IsDecider: played.length + i === clean.length - 1 && clean.length > 1,
        State: "pending",
      })),
    }),
    prisma.tournamentMatch.update({
      where: { Id: matchId },
      data: { State: "ready", VetoDeadline: null },
    }),
  ]);

  return { ok: true };
}
