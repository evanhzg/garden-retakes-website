import { NextResponse } from "next/server";
import { prisma, getActiveSeason } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveNames, nameFrom } from "@/lib/names";
import { resolveAvatars } from "@/lib/avatars";
import { VOTE_CATEGORIES, award } from "@/lib/medals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The season-end community vote.
//
// GET  — the open poll, its candidates, and either your ballot (while open) or
//        the results (once closed).
// POST — cast or change one vote in one category.
//
// Three things keep it honest, all server-side, because the client is not a
// place to enforce anything:
//
//   1. a unique key on (category, voter) — one vote per person per category is
//      true in the database, not merely intended by the UI;
//   2. the window is checked here, so a stale page cannot vote after closing;
//   3. the candidate list is frozen into the poll when it opens, so a target
//      has to have been on the ballot rather than merely be a valid SteamID.
//
// Changing your mind while the poll is open is allowed. "One vote" is about how
// much you count, not about being punished for a misclick.

type Candidate = { steamId: string; name: string; avatar?: string; rank: number };

async function pollView(now: Date) {
  const poll = await prisma.gardenVotePoll.findFirst({
    where: { ClosesAt: { gt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30) } },
    orderBy: { Id: "desc" },
  });
  if (!poll) return null;

  const categories = await prisma.gardenVoteCategory.findMany({
    where: { PollId: poll.Id },
    orderBy: { Sort: "asc" },
  });

  const frozen: { steamId: string; rank: number }[] = JSON.parse(poll.Candidates || "[]");
  const ids = frozen.map((c) => BigInt(c.steamId));
  const [names, avatars] = await Promise.all([resolveNames(ids), resolveAvatars(ids)]);
  const candidates: Candidate[] = frozen.map((c) => ({
    steamId: c.steamId,
    rank: c.rank,
    name: nameFrom(names, BigInt(c.steamId)),
    avatar: avatars[c.steamId],
  }));

  return { poll, categories, candidates };
}

export async function GET() {
  const now = new Date();
  const view = await pollView(now);
  if (!view) return NextResponse.json({ poll: null });

  const { poll, categories, candidates } = view;
  const open = now >= poll.OpensAt && now < poll.ClosesAt;
  const session = getSession();

  const votes = await prisma.gardenVote.findMany({
    where: { CategoryId: { in: categories.map((c) => c.Id) } },
  });

  // While it is open nobody sees the running totals — a visible tally turns a
  // vote into a bandwagon.
  const tally = open
    ? null
    : categories.map((c) => {
        const counts = new Map<string, number>();
        for (const v of votes.filter((v) => v.CategoryId === c.Id)) {
          const k = v.TargetSteamId.toString();
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        const ranked = Array.from(counts.entries())
          .map(([steamId, count]) => ({
            steamId,
            count,
            name: candidates.find((x) => x.steamId === steamId)?.name ?? steamId,
            avatar: candidates.find((x) => x.steamId === steamId)?.avatar,
          }))
          .sort((a, b) => b.count - a.count);
        return { category: c.Slug, name: c.Name, results: ranked, total: ranked.reduce((n, r) => n + r.count, 0) };
      });

  const mine = session
    ? Object.fromEntries(
        votes
          .filter((v) => v.VoterSteamId === BigInt(session.steamId))
          .map((v) => [categories.find((c) => c.Id === v.CategoryId)?.Slug ?? "", v.TargetSteamId.toString()])
      )
    : {};

  return NextResponse.json({
    poll: {
      id: poll.Id,
      seasonId: poll.SeasonId,
      opensAt: poll.OpensAt.toISOString(),
      closesAt: poll.ClosesAt.toISOString(),
      open,
    },
    categories: categories.map((c) => ({ id: c.Id, slug: c.Slug, name: c.Name, description: c.Description })),
    candidates,
    mine,
    results: tally,
    signedIn: Boolean(session),
  });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in with Steam to vote." }, { status: 401 });

  let body: { category?: string; target?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const now = new Date();
  const view = await pollView(now);
  if (!view) return NextResponse.json({ error: "No vote is running." }, { status: 404 });

  const { poll, categories, candidates } = view;
  if (now < poll.OpensAt) return NextResponse.json({ error: "Voting has not opened yet." }, { status: 409 });
  if (now >= poll.ClosesAt) return NextResponse.json({ error: "Voting has closed." }, { status: 409 });

  const category = categories.find((c) => c.Slug === body.category);
  if (!category) return NextResponse.json({ error: "No such category." }, { status: 400 });

  const target = String(body.target ?? "");
  if (!candidates.some((c) => c.steamId === target)) {
    return NextResponse.json({ error: "That player is not on the ballot." }, { status: 400 });
  }

  const voter = BigInt(session.steamId);
  await prisma.gardenVote.upsert({
    where: { CategoryId_VoterSteamId: { CategoryId: category.Id, VoterSteamId: voter } },
    create: { CategoryId: category.Id, VoterSteamId: voter, TargetSteamId: BigInt(target) },
    update: { TargetSteamId: BigInt(target) },
  });

  return NextResponse.json({ ok: true });
}

/**
 * Close a finished poll: award each category's medal to its winner.
 *
 * Idempotent, and safe to call from anywhere — it does nothing until the window
 * has actually passed.
 */
export async function PATCH() {
  const now = new Date();
  const view = await pollView(now);
  if (!view) return NextResponse.json({ awarded: 0 });
  const { poll, categories } = view;
  if (now < poll.ClosesAt) return NextResponse.json({ awarded: 0, note: "still open" });

  let awarded = 0;
  for (const c of categories) {
    const votes = await prisma.gardenVote.findMany({ where: { CategoryId: c.Id } });
    if (votes.length === 0) continue;
    const counts = new Map<string, number>();
    for (const v of votes) {
      const k = v.TargetSteamId.toString();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const [winner, count] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    
    // Remove any existing medal for this category and season to prevent duplicates (e.g. on ties resolving differently)
    await prisma.gardenPlayerMedal.deleteMany({
      where: { SeasonId: poll.SeasonId, MedalSlug: c.MedalSlug },
    });

    await award(BigInt(winner), c.MedalSlug, poll.SeasonId, `${count} vote${count === 1 ? "" : "s"}`);
    awarded += 1;
  }

  return NextResponse.json({ ok: true, awarded });
}
