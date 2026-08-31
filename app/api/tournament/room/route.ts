import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canModerate, getTournamentContext } from "@/lib/tournamentAuth";
import { resolveName } from "@/lib/names";
import { background } from "@/lib/background";
import { execOnServer } from "@/lib/tournament/servers";
import {
  readableScopes,
  mayPostTo,
  parseScope,
  type Viewer,
} from "@/lib/tournament/roomScope";

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
 * Which of the two rosters this viewer is on, or null.
 *
 * Pulled out of roleFor because the private team channel needs the same answer
 * and must not ask a differently-worded version of the question: the team whose
 * lines you can READ has to be the team whose lines you are BADGED as, or
 * somebody ends up able to read a channel they cannot post to, or worse.
 */
async function teamOf(
  match: { TeamAId: number | null; TeamBId: number | null },
  steamId: string | null,
): Promise<Viewer> {
  if (!steamId) return null;

  const id = BigInt(steamId);
  for (const [slot, teamId] of [["a", match.TeamAId], ["b", match.TeamBId]] as const) {
    if (!teamId) continue;
    const member = await prisma.tournamentTeamMember.findFirst({
      where: { TeamId: teamId, SteamId: id },
    });
    if (member) return slot;
  }

  return null;
}

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
  const slot = await teamOf(match, steamId);
  if (slot) return slot;

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
    select: {
      Id: true,
      TournamentId: true,
      TeamAId: true,
      TeamBId: true,
      Tournament: { select: { Published: true } },
    },
  });

  if (!match) return NextResponse.json({ messages: [] });

  // Which team is reading, which is both the private-channel key and — for an
  // unpublished tournament — the reason they are allowed to read at all.
  const session = await getSession();
  const viewerId = session?.steamId ? String(session.steamId) : null;
  const viewer = await teamOf(match, viewerId);

  /**
   * An unpublished tournament is still readable by the people playing in it.
   *
   * This used to be a flat `!Published -> []`, which made the room permanently
   * empty for every pickup match: pickups hang off a deliberately unpublished
   * tournament so they never appear in the hub beside a real event, so the
   * panel was there and nothing anybody typed ever came back. The match page
   * had exactly this bug and was fixed the same way.
   *
   * Unpublished still means unlisted — nothing links here but the lobby. This
   * only stops the room pretending to be empty for the two teams it is for.
   */
  if (!match.Tournament?.Published && viewer === null) {
    const ctx = await getTournamentContext(null);
    if (!(await canModerate(ctx, match.TournamentId))) {
      return NextResponse.json({ messages: [] });
    }
  }

  const afterRaw = req.nextUrl.searchParams.get("after");
  const after = afterRaw === null ? null : Number(afterRaw);

  const rows = await prisma.tournamentRoomMessage.findMany({
    where: {
      MatchId: matchId,
      // The permission, in the query. A team's private lines are never sent to
      // the other side rather than sent and hidden — the difference is one
      // devtools tab wide.
      Scope: { in: readableScopes(viewer) },
      ...(after !== null && Number.isFinite(after) ? { Id: { gt: after } } : {}),
    },
    // Newest first and capped, then reversed: a long room is hundreds of lines
    // and the panel shows the tail. `after` makes the steady state empty.
    orderBy: { Id: "desc" },
    take: 40,
  });

  return NextResponse.json({
    // Which team the caller is on, so the panel knows whether to offer a team
    // tab at all. Sent from here rather than passed down as a prop because the
    // match page's own "mySlot" means CAPTAIN, and every player on a roster has
    // a team channel — a prop would have shown the tab to two people per match.
    viewer,
    messages: rows.reverse().map((m) => ({
      id: m.Id,
      steamId: m.SteamId.toString(),
      name: m.Name,
      role: m.Role,
      source: m.Source,
      scope: m.Scope,
      body: m.Body,
      at: m.CreatedAtUtc.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const steamId = session?.steamId ? String(session.steamId) : null;
  if (!steamId) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  let body: { matchId?: number; body?: string; scope?: string };
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

  // Where it is addressed. An unrecognised value is refused rather than widened
  // to the room — a caller getting this wrong must not turn an intended private
  // line into a public one.
  const asked = parseScope(body.scope);
  if (!asked.ok) return NextResponse.json({ error: "unknown scope" }, { status: 400 });

  const viewer = await teamOf(match, steamId);
  if (!mayPostTo(viewer, asked.scope, true)) {
    return NextResponse.json({ error: "not your team" }, { status: 403 });
  }

  const role = await roleFor(matchId, steamId);

  const created = await prisma.tournamentRoomMessage.create({
    data: {
      MatchId: matchId,
      SteamId: BigInt(steamId),
      Name: await resolveName(steamId),
      Role: role,
      Source: "room",
      Scope: asked.scope,
      Body: text,
    },
  });

  /**
   * Staff are heard in the server, not only on the website.
   *
   * The whole reason an admin is in a match room is that somebody in the game
   * needs an answer, and an answer they cannot see is not one. Relayed in the
   * format every server uses — ADMIN - name: message — so it is unmistakably
   * staff rather than another player's opinion.
   *
   * Only staff, and only when there is a server. A player's line stays on the
   * website: they are already in the server and can type there, and echoing it
   * back would show them their own message twice.
   *
   * Best effort and last, exactly like the force-end reply: a server that
   * cannot be reached must not turn a sent message into an error, because the
   * message IS sent — it is in the room.
   */
  // Room lines only. A staff line addressed to one team is addressed to one
  // team; relaying it into the server would say it to both, which is the
  // opposite of what was asked for.
  if (role === "admin" && asked.scope === "room" && match.ServerId) {
    background("room:relay", async () => {
      const who = (await resolveName(steamId)).replace(/["\\;]/g, "").slice(0, 32);
      const line = text.replace(/["\\;]/g, "").slice(0, 200);
      await execOnServer(match.ServerId!, `css_t_say "${who}" "${line}"`);
    });
  }

  // The socket is the fast path; the poll below it is what makes a dropped
  // socket a slower room rather than a silent one.
  try {
    const io = (globalThis as { __gardenIo?: { emit: (e: string, p: unknown) => void } }).__gardenIo;
    // The scope rides along so a client can ignore a nudge for a channel it
    // cannot read. It is a hint for refetching, not the permission — the GET
    // re-decides that, so a client that ignores this still learns nothing.
    io?.emit("t:room", { matchId, id: created.Id, scope: asked.scope });
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
      source: created.Source,
      scope: created.Scope,
      body: created.Body,
      at: created.CreatedAtUtc.toISOString(),
    },
  });
}
