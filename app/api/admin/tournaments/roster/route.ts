import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/adminAuth";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The organizer's edits to teams and players.
//
// Separate from /api/tournament/teams, which is the CAPTAIN's route and is
// session-authenticated as one of the players. This one is authorised by
// running the tournament, so an organizer can fix a team name at 19:55 without
// needing the captain to be awake.

type Body = {
  key?: string;
  action?: "rename-team" | "display-name" | "set-status";
  teamId?: number;
  steamId?: string;
  name?: string;
  tag?: string;
  displayName?: string;
  status?: string;
};

const TEAM_STATES = ["pending", "accepted", "withdrawn", "disqualified"];

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  if (!body.teamId) return NextResponse.json({ error: "teamId?" }, { status: 400 });

  const team = await prisma.tournamentTeam.findUnique({ where: { Id: body.teamId } });
  if (!team) return NextResponse.json({ error: "No such team." }, { status: 404 });

  // The gate is the TOURNAMENT, not the team: a team is only ever editable by
  // way of running the event it is in.
  const ctx = await getTournamentContext(body.key);
  if (!(await canManage(ctx, team.TournamentId))) {
    return NextResponse.json({ error: "You do not run this tournament." }, { status: 403 });
  }

  switch (body.action) {
    case "rename-team": {
      const name = (body.name ?? "").trim();
      if (name.length < 2) {
        return NextResponse.json({ error: "That name is too short." }, { status: 400 });
      }

      try {
        await prisma.tournamentTeam.update({
          where: { Id: team.Id },
          data: {
            Name: name.slice(0, 64),
            ...(body.tag === undefined ? {} : { Tag: body.tag.trim().slice(0, 8) || null }),
          },
        });
      } catch {
        // The unique index on (tournament, name) is the real guard; this is the
        // sentence somebody reads when they hit it.
        return NextResponse.json({ error: "A team already has that name." }, { status: 400 });
      }

      await logAdminAction(ctx, "tournament.team.rename", undefined, `#${team.Id} → ${name}`);
      return NextResponse.json({ ok: true });
    }

    case "display-name": {
      const steamId = (body.steamId ?? "").trim();
      if (!/^\d{17}$/.test(steamId)) {
        return NextResponse.json({ error: "That is not a SteamID64." }, { status: 400 });
      }

      const name = (body.displayName ?? "").trim();

      // Empty clears it back to the profile name. That is how a rename is
      // undone, so it is a real value rather than a validation failure.
      if (name.length > 0 && name.length < 2) {
        return NextResponse.json({ error: "That name is too short." }, { status: 400 });
      }

      const updated = await prisma.tournamentTeamMember.updateMany({
        where: { TeamId: team.Id, SteamId: BigInt(steamId) },
        data: { DisplayName: name.slice(0, 32) || null },
      });

      if (updated.count === 0) {
        return NextResponse.json({ error: "They are not on that team." }, { status: 400 });
      }

      await logAdminAction(ctx, "tournament.player.rename", { steamId }, name || "(cleared)");
      return NextResponse.json({ ok: true });
    }

    case "set-status": {
      const status = (body.status ?? "").trim();
      if (!TEAM_STATES.includes(status)) {
        return NextResponse.json({ error: `Status must be one of ${TEAM_STATES.join(", ")}.` }, { status: 400 });
      }

      await prisma.tournamentTeam.update({ where: { Id: team.Id }, data: { Status: status } });
      await logAdminAction(ctx, "tournament.team.status", undefined, `#${team.Id} → ${status}`);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
