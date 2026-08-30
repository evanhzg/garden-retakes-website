import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canModerate, getTournamentContext } from "@/lib/tournamentAuth";
import { resolveName } from "@/lib/names";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The match room's chat.
 *
 * Readable by anybody who can see the match, which is the same rule the rest of
 * the page uses: a published tournament's matches are public, and a room where
 * the two teams are arranging themselves is part of that.
 *
 * Writable by anybody signed in. Not just the rostered players — a substitute
 * who is not on the roster yet, a coach, and the organizer who is trying to
 * work out what happened are exactly the people who need to speak, and they are
 * the ones a roster check would silence.
 */

/**
 * Who this person is in this match, which changes how a line reads.
 *
 * PLAYING BEATS STAFF, and the order of the two checks is the whole rule. An
 * organizer who is also on one of the two rosters is playing this match — their
 * line is a player's line, and badging it ADMIN would make an opinion about
 * their own game look like a ruling on it. Get the order wrong and the person
 * with the most authority is the one whose word carries the most weight in an
 * argument they are a party to.
 *
 * Everybody else with standing — the site's admins, the org's organizers, its
 * moderators — is staff, and says so.
 */
async function roleFor(matchId: number, steamId: string | null): Promise<string | null> {
  if (!steamId) return null;

  const match = await prisma.tournamentMatch.findUnique({ where: { Id: matchId } });
  if (!match) return null;

  // Playing, first.
  const id = BigInt(steamId);
  for (const [slot, teamId] of [["a", match.TeamAId], ["b", match.TeamBId]] as const) {
    if (!teamId) continue;
    const member = await prisma.tournamentTeamMember.findFirst({
      where: { TeamId: teamId, SteamId: id },
    });
    if (member) return slot;
  }

  // Then standing. canModerate is the wider of the two gates and covers both
  // an org's organizers and its moderators, plus site admins — which is exactly
  // the set of people whose word in a match room is a ruling.
  const ctx = await getTournamentContext(null);
  if (await canModerate(ctx, match.TournamentId)) return "admin";

  return null;
}

export async function GET(req: NextRequest) {
  const matchId = Number(req.nextUrl.searchParams.get("matchId"));
  if (!Number.isFinite(matchId) || matchId <= 0) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }

  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { Id: true, Tournament: { select: { Published: true } } },
  });

  if (!match?.Tournament?.Published) return NextResponse.json({ messages: [] });

  const afterRaw = req.nextUrl.searchParams.get("after");
  const after = afterRaw === null ? null : Number(afterRaw);

  const rows = await prisma.tournamentRoomMessage.findMany({
    where: {
      MatchId: matchId,
      ...(after !== null && Number.isFinite(after) ? { Id: { gt: after } } : {}),
    },
    // Newest first and capped, then reversed: a long room is hundreds of lines
    // and the panel shows the tail. `after` makes the steady state empty.
    orderBy: { Id: "desc" },
    take: 40,
  });

  return NextResponse.json({
    messages: rows.reverse().map((m) => ({
      id: m.Id,
      steamId: m.SteamId.toString(),
      name: m.Name,
      role: m.Role,
      body: m.Body,
      at: m.CreatedAtUtc.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const steamId = session?.steamId ? String(session.steamId) : null;
  if (!steamId) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  let body: { matchId?: number; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const matchId = Number(body.matchId);
  const text = (body.body ?? "").trim().slice(0, 500);
  if (!Number.isFinite(matchId) || !text) {
    return NextResponse.json({ error: "matchId and body required" }, { status: 400 });
  }

  const match = await prisma.tournamentMatch.findUnique({ where: { Id: matchId } });
  if (!match) return NextResponse.json({ error: "no such match" }, { status: 404 });

  const created = await prisma.tournamentRoomMessage.create({
    data: {
      MatchId: matchId,
      SteamId: BigInt(steamId),
      Name: await resolveName(steamId),
      Role: await roleFor(matchId, steamId),
      Body: text,
    },
  });

  // The socket is the fast path; the poll below it is what makes a dropped
  // socket a slower room rather than a silent one.
  try {
    const io = (globalThis as { __gardenIo?: { emit: (e: string, p: unknown) => void } }).__gardenIo;
    io?.emit("t:room", { matchId, id: created.Id });
  } catch {
    /* the poll will catch it */
  }

  return NextResponse.json({
    ok: true,
    message: {
      id: created.Id,
      steamId,
      name: created.Name,
      role: created.Role,
      body: created.Body,
      at: created.CreatedAtUtc.toISOString(),
    },
  });
}
