import { background } from "@/lib/background";
import { prisma } from "@/lib/db";
import { autoAction, vetoState, type VetoAction, type Side } from "@/lib/tournament/veto";
import { startMatch } from "@/lib/tournament/matchRunner";
import { turnSecondsFor } from "@/lib/tournament/edition";
import { isPickupSlug } from "@/lib/tournament/pickup";
import { beginRoleDraft } from "@/lib/tournament/roleDraft";
import { driveBotMatch, isAllBots } from "@/lib/tournament/botDriver";

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
 * Opens the veto and starts the first turn's clock.
 *
 * Lives here rather than in the route because two routes reach it now: ready-up
 * still opens the veto directly when nothing has to be drafted, and the role
 * draft opens it when its last pick lands. A second copy would be a second
 * place that could forget the deadline, and a turn with no deadline is a turn
 * that never times out.
 */
export async function beginVeto(matchId: number): Promise<void> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { VetoStartedAt: true, Tournament: { select: { Slug: true } } },
  });

  // Already running. Reached twice when the last role pick and an expired role
  // turn land together, and redrawing the deadline would hand somebody a fresh
  // turn they had already spent.
  if (!match || match.VetoStartedAt) return;

  // A pickup gets ten seconds a turn, a tournament thirty. The first turn's
  // clock is written here and every later one by the veto route, so both have
  // to ask the same question — see turnSecondsFor.
  const seconds = turnSecondsFor(isPickupSlug(match.Tournament.Slug));

  await prisma.tournamentMatch.update({
    where: { Id: matchId },
    data: {
      VetoStartedAt: new Date(),
      VetoDeadline: new Date(Date.now() + seconds * 1000),
      State: "veto",
    },
  });
}

/**
 * What ready-up leads to: the role draft, or straight to the veto.
 *
 * The draft is skipped rather than shown empty when there is nothing to pick —
 * a tournament that drafts once, on the second match of a team that has already
 * been through it. Putting a board in front of two teams to tell them there is
 * nothing to do would be worse than not showing it at all.
 */
export async function beginRolesOrVeto(matchId: number): Promise<"roles" | "veto"> {
  const opened = await beginRoleDraft(matchId);

  // Nobody at the keyboard on either side: the bots take their own turns.
  //
  // Not awaited. driveBotMatch pauses two seconds a step so the draft and the
  // veto can be WATCHED — which is the point of a bot tournament — and holding
  // the request open for that would make ready-up feel broken to whoever
  // pressed it. The page polls and shows each step as it lands.
  if (await isAllBots(matchId)) {
    // Deliberately slow — two seconds a step so the draft can be watched — and
    // therefore exactly the kind of work `void` loses on a serverless host.
    background("veto:driveBotMatch", () => driveBotMatch(matchId));
  }

  if (opened) return "roles";

  await beginVeto(matchId);
  return "veto";
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
 * Put a decided match on a server, now.
 *
 * The veto ending and the match starting were two separate acts, the second of
 * which nobody performed: a match sat "ready" with maps chosen and no server
 * until an organizer noticed and pressed a button. Ten teams waiting on one
 * person to click ten times is the thing an automated bracket exists to avoid.
 *
 * Deliberately tolerant. No free server, a server that will not load the map, a
 * plugin that refuses — none of those should turn a completed veto into an
 * error, because the veto itself succeeded. The match stays "ready" and can be
 * started by hand exactly as before.
 */
export async function autoStart(matchId: number): Promise<{ started: boolean; error?: string }> {
  try {
    const match = await prisma.tournamentMatch.findUnique({
      where: { Id: matchId },
      select: { State: true, ServerId: true, Maps: { select: { Id: true } } },
    });

    if (!match) return { started: false, error: "gone" };
    // Already on a server, or already playing. Nothing to do, and re-running
    // startMatch would claim a second one.
    if (match.ServerId !== null || match.State === "live") return { started: false };
    if (match.Maps.length === 0) return { started: false, error: "no maps" };

    const result = await startMatch(matchId);
    return result.ok ? { started: true } : { started: false, error: result.error };
  } catch (err) {
    return { started: false, error: String(err) };
  }
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
  /**
   * A map to steer the result towards.
   *
   * Only one map has authored tournament spawns so far, so a bot match on any
   * other one has nowhere for its players to stand. Rather than special-casing
   * the spawn engine, the veto is steered: the preferred map is never banned
   * and is always the pick, so it survives to be played. The sequence itself is
   * untouched — the same number of bans and picks happen in the same order, by
   * the same validator.
   */
  prefer?: string | null,
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

    // Which map, keeping the KIND the sequence asked for.
    let map: string | undefined;

    if (auto.kind === "side") {
      map = undefined;
    } else {
      const wanted = prefer && state.remaining.includes(prefer) ? prefer : null;

      if (auto.kind === "pick" && wanted) {
        map = wanted;
      } else {
        // Banning: everything except the preferred map is fair game. If it is
        // the only one left there is nothing to protect it from, so fall
        // through to the normal choice rather than banning nothing.
        const pool = wanted
          ? state.remaining.filter((m) => m !== wanted)
          : state.remaining;
        const from = pool.length > 0 ? pool : state.remaining;
        map = from[Math.floor(random() * from.length)] ?? auto.map;
      }
    }

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
