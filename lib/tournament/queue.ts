import { prisma } from "@/lib/db";

// Waiting for a server.
//
// A bracket releases a whole round at once and the fleet is six servers, so
// more matches want to play than there is room for. That was not handled:
// startMatch returned "No server is free" and the match stayed in "ready",
// which from the match page is indistinguishable from a match nobody has got
// round to starting yet. Two organizers watching that both press start, and the
// server goes to whoever's request happened to arrive first rather than to
// whoever has been waiting longest.
//
// So waiting is a state. The match says it is queued, the page can say how many
// are ahead of it, and a released server goes to the head of the queue.
//
// One at a time, deliberately. Handing a freed server to every waiting match at
// once is exactly the race the queue exists to remove — claimServer would let
// one win and the rest would fail and re-queue, which is the old behaviour with
// extra steps.

export type QueueState = {
  waiting: boolean;
  /** 1 is next. Null when not waiting. */
  position: number | null;
  /** How many are waiting in total, for "3 of 5". */
  total: number;
};

/** Puts a match in the queue, if it is not already in it. */
export async function enqueue(matchId: number): Promise<void> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { QueuedAt: true, ServerId: true },
  });

  // Already waiting, or already placed. Re-stamping would send a match to the
  // back of a queue it was already at the front of, every time somebody
  // refreshed.
  if (!match || match.QueuedAt || match.ServerId) return;

  await prisma.tournamentMatch.update({
    where: { Id: matchId },
    data: { QueuedAt: new Date() },
  });
}

/** Takes a match out of the queue. */
export async function dequeue(matchId: number): Promise<void> {
  await prisma.tournamentMatch.updateMany({
    where: { Id: matchId, QueuedAt: { not: null } },
    data: { QueuedAt: null },
  });
}

/** Where a match stands in the queue. */
export async function queueState(matchId: number): Promise<QueueState> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { QueuedAt: true },
  });

  const total = await prisma.tournamentMatch.count({ where: { QueuedAt: { not: null } } });

  if (!match?.QueuedAt) return { waiting: false, position: null, total };

  const ahead = await prisma.tournamentMatch.count({
    where: { QueuedAt: { lt: match.QueuedAt } },
  });

  return { waiting: true, position: ahead + 1, total };
}

/**
 * Gives a freed server to whoever has waited longest.
 *
 * Called after a server is released. Imports startMatch lazily because
 * matchRunner imports this module for the enqueue side, and a static pair of
 * imports between them is a cycle Next resolves as undefined at runtime rather
 * than as an error at build time — which shows up as "startMatch is not a
 * function" the first time a match actually ends.
 */
export async function promoteNext(): Promise<{ started: number | null }> {
  const next = await prisma.tournamentMatch.findFirst({
    where: { QueuedAt: { not: null }, ServerId: null, State: { notIn: ["finished", "live"] } },
    orderBy: { QueuedAt: "asc" },
    select: { Id: true },
  });

  if (!next) return { started: null };

  // Out of the queue first. If the start fails it re-queues itself through the
  // same path everything else uses, which keeps one rule for how a match ends
  // up waiting rather than two.
  await dequeue(next.Id);

  const { startMatch } = await import("@/lib/tournament/matchRunner");
  const result = await startMatch(next.Id);

  return { started: result.ok ? next.Id : null };
}
