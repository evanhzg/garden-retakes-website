import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Starting the next season early.
//
// Opening the vote ends the season: ELO freezes and ranked and competitive
// retakes stop being offered, because points that go nowhere are not points.
// The poll then runs for a fixed number of hours, which is the right default and
// the wrong answer on the night everyone has already voted and wants to play
// ranked again. This closes the window now, which is the single fact the freeze
// is derived from — no separate flag to keep in step.
//
// Owner-only, for the same reason opening the vote is: it decides when a
// season's story ends, and clicking it again cannot put the time back.

export async function POST(req: Request) {
  const keyParam = new URL(req.url).searchParams.get("key");
  const ctx = await getAdminContext(keyParam);
  if (ctx.level < AdminLevel.Owner) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  // The newest poll is the only one that can be open — opening a vote creates a
  // row, so anything older has already been settled.
  const poll = await prisma.gardenVotePoll.findFirst({ orderBy: { Id: "desc" } });
  if (!poll) {
    return NextResponse.json({ error: "No season vote has been opened." }, { status: 409 });
  }

  const now = new Date();
  if (now >= poll.ClosesAt) {
    // Already closed, so the freeze has already lifted. Reporting that as
    // success rather than as an error means a double click, or two admins
    // clicking at once, does not produce a failure that describes nothing wrong.
    return NextResponse.json({ ok: true, pollId: poll.Id, alreadyClosed: true, closesAt: poll.ClosesAt.toISOString() });
  }

  const closed = await prisma.gardenVotePoll.update({
    where: { Id: poll.Id },
    data: { ClosesAt: now },
  });

  await logAdminAction(
    ctx,
    "season.start",
    undefined,
    `poll ${poll.Id} closed early — was due ${poll.ClosesAt.toISOString()}`
  );

  return NextResponse.json({
    ok: true,
    pollId: closed.Id,
    seasonId: closed.SeasonId,
    closesAt: closed.ClosesAt.toISOString(),
  });
}
