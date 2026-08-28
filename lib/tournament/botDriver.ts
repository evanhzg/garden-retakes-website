import { prisma } from "@/lib/db";
import { autoRoleDraft, draftSides } from "@/lib/tournament/roleDraft";
import { autoStart, autoVeto, beginVeto, materialiseMaps } from "@/lib/tournament/vetoRunner";

// Bots doing the parts of a match that need a person.
//
// A bot cannot ready up, cannot pick a role and cannot ban a map — there is
// nobody at the keyboard. Before this an all-bot match reached the role draft
// and stopped there for ever, which made the one tournament that exists to
// exercise the whole flow unable to exercise any of it past ready-up.
//
// The delay is deliberate and it is not padding. An all-bot draft that resolves
// in the same tick as it opens is a screen that flashes through six picks and a
// seven-map veto too fast to read, so the thing you set up to WATCH shows you
// nothing. Two seconds a step is slow enough to follow and fast enough that a
// bracket still resolves in a couple of minutes.

/** How long to wait before a bot takes its turn. */
export const BOT_THINK_MS = 2000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The map a BO1 should end on.
 *
 * Only de_dust2 has authored tournament spawns, so a bot match anywhere else
 * has nowhere to put its players — and a BO1 is the shape used to check that
 * spawn work, which makes steering it there the difference between a test that
 * proves something and one that cannot start.
 *
 * Steered rather than forced: the veto still runs its real sequence through its
 * real validator, and this only decides which map survives it.
 */
export const SPAWN_READY_MAP = "de_dust2";

/** Whether every player on both sides of a match is a bot. */
export async function isAllBots(matchId: number): Promise<boolean> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { TeamAId: true, TeamBId: true },
  });

  if (!match?.TeamAId || !match.TeamBId) return false;

  const members = await prisma.tournamentTeamMember.findMany({
    where: { TeamId: { in: [match.TeamAId, match.TeamBId] }, Status: "accepted" },
    select: { IsBot: true },
  });

  return members.length > 0 && members.every((m) => m.IsBot);
}

/**
 * Plays a bot match's role draft and veto, a step at a time.
 *
 * Returns what it did, so a caller can log it. Safe to call twice: both the
 * draft and the veto are idempotent about work already done, and a match whose
 * maps exist is left alone.
 */
export async function driveBotMatch(
  matchId: number,
  options: { preferMap?: string | null; thinkMs?: number } = {},
): Promise<{ drafted: number; maps: string[] }> {
  const think = options.thinkMs ?? BOT_THINK_MS;

  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { BestOf: true, Maps: { select: { Id: true } } },
  });

  if (!match) return { drafted: 0, maps: [] };

  // Already decided. Not an error — a retry, or a second caller.
  if (match.Maps.length > 0) return { drafted: 0, maps: [] };

  // A BO1 is the shape used to check spawn work, so it ends on the one map that
  // has spawns. A longer series plays whatever the veto produces, because there
  // the point is the series rather than the ground.
  const prefer =
    options.preferMap !== undefined
      ? options.preferMap
      : match.BestOf <= 1
        ? SPAWN_READY_MAP
        : null;

  await wait(think);

  const sides = await draftSides(matchId);
  const owed = sides ? sides.drafting.A.length + sides.drafting.B.length : 0;

  const drafted = await autoRoleDraft(matchId);

  // The veto cannot open until the draft is closed, and autoRoleDraft closes it
  // without opening the veto — that is its caller's job everywhere else too.
  await beginVeto(matchId);

  await wait(think);

  const veto = await autoVeto(matchId, Math.random, prefer);
  await materialiseMaps(matchId);

  // And onto a server. The plugin declares its own bot slots from css_t_bot and
  // maintains the quota itself, so there is nothing to fill by hand — the match
  // simply starts and the bots arrive.
  await autoStart(matchId);

  return { drafted: drafted.picks || owed, maps: veto.maps };
}
