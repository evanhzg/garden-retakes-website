import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { randomBytes } from "node:crypto";
import { canRegister, registrationBlockedReason, type EditionState } from "@/lib/tournament/edition";
import { CT_ROLES, T_ROLES } from "@/lib/tournament/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Captains registering their own teams.
//
// Session-authenticated, never by key: this is the one part of the tournament
// system ordinary players touch, and every action has to be attributable to the
// person who took it. A captain inviting somebody, and that somebody accepting,
// are two different people's decisions and both are recorded.

// The role lists live in lib/tournament/roles.ts, which is also what the draft
// and the board read. Two hand-written copies of the same seven ids is how one
// of them ends up a rename behind the other.
const CT_ROLE_IDS = CT_ROLES.map((r) => r.id);
const T_ROLE_IDS = T_ROLES.map((r) => r.id);

type Body = {
  action?:
    | "create"
    | "invite"
    | "accept"
    | "decline"
    | "leave"
    | "kick"
    | "rename"
    | "role"
    | "join"
    | "team-link"
    | "display-name";
  roleT?: string | null;
  roleCt?: string | null;
  tournamentId?: number;
  teamId?: number;
  name?: string;
  tag?: string;
  steamId?: string;
  /** The tournament's invite token, when arriving from an invite link. */
  invite?: string;
  /** A team's own invite token, for joining one directly. */
  teamToken?: string;
  /** The name to carry for this tournament only. */
  displayName?: string;
};

/** Short, unguessable, and safe in a URL without escaping. */
const freshToken = () => randomBytes(16).toString("hex");

/**
 * A message for each way registration can be shut.
 *
 * Written out rather than reduced to "closed" because each one leads somewhere
 * different: full means watch the bracket, invite-only means ask for a link,
 * not-published means it does not exist yet as far as you are concerned.
 */
const REGISTRATION_REFUSAL: Record<string, string> = {
  "not-published": "That tournament is not open yet.",
  started: "That tournament has already started.",
  "wrong-state": "Registration is closed.",
  full: "The tournament is full.",
  "invite-only": "This tournament is invite only — you need a link from the organizer.",
};

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in with Steam first." }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const me = BigInt(session.steamId);

  switch (body.action) {
    case "create": {
      if (!body.tournamentId) return NextResponse.json({ error: "tournamentId?" }, { status: 400 });

      const tournament = await prisma.tournament.findUnique({
        where: { Id: body.tournamentId },
        include: { _count: { select: { Teams: true } } },
      });
      if (!tournament) return NextResponse.json({ error: "No such tournament." }, { status: 404 });

      // One gate, shared with the page that renders the form, so what the
      // button offers and what the server allows cannot drift apart. The
      // invite token has to MATCH — holding any token is not holding this one.
      const edition: EditionState = {
        published: tournament.Published,
        state: tournament.State,
        visibility: tournament.Visibility === "invite" ? "invite" : "public",
        maxTeams: tournament.MaxTeams,
        teamCount: tournament._count.Teams,
        startsAt: tournament.StartsAt,
        startedAt: tournament.StartedAt,
      };

      const holdsInvite =
        Boolean(tournament.InviteToken) && body.invite === tournament.InviteToken;

      if (!canRegister(edition, holdsInvite)) {
        const why = registrationBlockedReason(edition, holdsInvite) ?? "wrong-state";
        return NextResponse.json({ error: REGISTRATION_REFUSAL[why] ?? "Registration is closed." }, { status: 400 });
      }

      const name = (body.name ?? "").trim();
      if (name.length < 2) {
        return NextResponse.json({ error: "That name is too short." }, { status: 400 });
      }

      // One team per person per tournament. Without this a captain can register
      // twice and take a slot from somebody, which only shows up when the
      // bracket is generated and is painful to unpick then.
      const already = await prisma.tournamentTeamMember.findFirst({
        where: { SteamId: me, Team: { TournamentId: tournament.Id, Status: { not: "withdrawn" } } },
        include: { Team: true },
      });

      if (already) {
        return NextResponse.json(
          { error: `You are already in ${already.Team.Name}.` },
          { status: 400 },
        );
      }

      try {
        const team = await prisma.tournamentTeam.create({
          data: {
            TournamentId: tournament.Id,
            Name: name.slice(0, 64),
            Tag: (body.tag ?? "").trim().slice(0, 8) || null,
            CaptainSteamId: me,
            InviteToken: freshToken(),
            Members: {
              create: { SteamId: me, IsCaptain: true, Status: "accepted", RespondedAt: new Date() },
            },
          },
        });

        return NextResponse.json({ ok: true, teamId: team.Id });
      } catch {
        // The unique index on (tournament, name) is the real guard; this is the
        // message somebody reads when they hit it.
        return NextResponse.json({ error: "A team already has that name." }, { status: 400 });
      }
    }

    case "invite": {
      const team = await captainOf(body.teamId, me);
      if ("error" in team) return team.error;

      const steamId = (body.steamId ?? "").trim();
      if (!/^\d{17}$/.test(steamId)) {
        return NextResponse.json({ error: "That is not a SteamID64." }, { status: 400 });
      }

      const tournament = await prisma.tournament.findUnique({
        where: { Id: team.value.TournamentId },
      });

      const size = await prisma.tournamentTeamMember.count({
        where: { TeamId: team.value.Id, Status: { in: ["invited", "accepted"] } },
      });

      // Room for a substitute, but not for a second team hiding inside one.
      const cap = (tournament?.TeamSize ?? 3) + 2;
      if (size >= cap) {
        return NextResponse.json({ error: `A team may hold ${cap} players.` }, { status: 400 });
      }

      const elsewhere = await prisma.tournamentTeamMember.findFirst({
        where: {
          SteamId: BigInt(steamId),
          Status: "accepted",
          Team: { TournamentId: team.value.TournamentId },
        },
      });

      if (elsewhere) {
        return NextResponse.json({ error: "They are already on a team." }, { status: 400 });
      }

      await prisma.tournamentTeamMember.upsert({
        where: { TeamId_SteamId: { TeamId: team.value.Id, SteamId: BigInt(steamId) } },
        create: { TeamId: team.value.Id, SteamId: BigInt(steamId), Status: "invited" },
        update: { Status: "invited", RespondedAt: null },
      });

      return NextResponse.json({ ok: true });
    }

    case "accept":
    case "decline": {
      if (!body.teamId) return NextResponse.json({ error: "teamId?" }, { status: 400 });

      const membership = await prisma.tournamentTeamMember.findUnique({
        where: { TeamId_SteamId: { TeamId: body.teamId, SteamId: me } },
      });

      if (!membership || membership.Status !== "invited") {
        return NextResponse.json({ error: "You have no invitation to that team." }, { status: 400 });
      }

      await prisma.tournamentTeamMember.update({
        where: { Id: membership.Id },
        data: {
          Status: body.action === "accept" ? "accepted" : "declined",
          RespondedAt: new Date(),
        },
      });

      return NextResponse.json({ ok: true });
    }

    case "kick": {
      const team = await captainOf(body.teamId, me);
      if ("error" in team) return team.error;

      const steamId = (body.steamId ?? "").trim();
      if (BigInt(steamId || "0") === me) {
        return NextResponse.json({ error: "A captain cannot kick themselves." }, { status: 400 });
      }

      await prisma.tournamentTeamMember.updateMany({
        where: { TeamId: team.value.Id, SteamId: BigInt(steamId) },
        data: { Status: "removed", RespondedAt: new Date() },
      });

      return NextResponse.json({ ok: true });
    }

    case "leave": {
      if (!body.teamId) return NextResponse.json({ error: "teamId?" }, { status: 400 });

      const team = await prisma.tournamentTeam.findUnique({ where: { Id: body.teamId } });

      // A captain leaving would orphan the team, so it withdraws instead —
      // explicit, and visible to everybody else on it.
      if (team?.CaptainSteamId === me) {
        await prisma.tournamentTeam.update({
          where: { Id: team.Id },
          data: { Status: "withdrawn" },
        });

        return NextResponse.json({ ok: true, withdrew: true });
      }

      await prisma.tournamentTeamMember.updateMany({
        where: { TeamId: body.teamId, SteamId: me },
        data: { Status: "removed", RespondedAt: new Date() },
      });

      return NextResponse.json({ ok: true });
    }

    case "rename": {
      const team = await captainOf(body.teamId, me);
      if ("error" in team) return team.error;

      const name = (body.name ?? "").trim();
      if (name.length < 2) return NextResponse.json({ error: "That name is too short." }, { status: 400 });

      try {
        await prisma.tournamentTeam.update({
          where: { Id: team.value.Id },
          data: { Name: name.slice(0, 64), Tag: (body.tag ?? "").trim().slice(0, 8) || null },
        });
        return NextResponse.json({ ok: true });
      } catch {
        return NextResponse.json({ error: "A team already has that name." }, { status: 400 });
      }
    }

    case "team-link": {
      // The captain's shareable link. Rotating it is how you revoke one that
      // reached the wrong Discord, so the same action serves both purposes.
      const team = await captainOf(body.teamId, me);
      if ("error" in team) return team.error;

      const fresh = freshToken();
      await prisma.tournamentTeam.update({
        where: { Id: team.value.Id },
        data: { InviteToken: fresh },
      });

      return NextResponse.json({ ok: true, teamToken: fresh });
    }

    case "join": {
      // Joining by link rather than by being invited by SteamID.
      //
      // The captain does not need to know anybody's 17-digit id, and the player
      // proves who they are by signing in with Steam before this runs — which
      // is why the link alone is enough and why it carries no identity itself.
      const token = (body.teamToken ?? "").trim();
      if (!token) return NextResponse.json({ error: "That link is missing its code." }, { status: 400 });

      const team = await prisma.tournamentTeam.findUnique({
        where: { InviteToken: token },
        include: { Tournament: { include: { _count: { select: { Teams: true } } } } },
      });

      if (!team) {
        return NextResponse.json({ error: "That invite link is not valid any more." }, { status: 404 });
      }

      const tournament = team.Tournament;

      if (tournament.StartedAt) {
        return NextResponse.json({ error: "That tournament has already started." }, { status: 400 });
      }

      // Already here? Say so plainly and succeed, so a player who clicks the
      // link twice is not told they have done something wrong.
      const existing = await prisma.tournamentTeamMember.findFirst({
        where: { TeamId: team.Id, SteamId: me, Status: { not: "removed" } },
      });

      if (existing) {
        if (existing.Status !== "accepted") {
          await prisma.tournamentTeamMember.update({
            where: { Id: existing.Id },
            data: { Status: "accepted", RespondedAt: new Date() },
          });
        }
        return NextResponse.json({ ok: true, teamId: team.Id, alreadyThere: true });
      }

      const elsewhere = await prisma.tournamentTeamMember.findFirst({
        where: {
          SteamId: me,
          Status: { in: ["accepted", "invited"] },
          Team: { TournamentId: tournament.Id, Status: { not: "withdrawn" } },
        },
        include: { Team: true },
      });

      if (elsewhere) {
        return NextResponse.json(
          { error: `You are already in ${elsewhere.Team.Name} for this tournament.` },
          { status: 400 },
        );
      }

      const size = await prisma.tournamentTeamMember.count({
        where: { TeamId: team.Id, Status: { in: ["invited", "accepted"] } },
      });

      const cap = tournament.TeamSize + 2;
      if (size >= cap) {
        return NextResponse.json({ error: `${team.Name} is full.` }, { status: 400 });
      }

      await prisma.tournamentTeamMember.create({
        data: {
          TeamId: team.Id,
          SteamId: me,
          Status: "accepted",
          RespondedAt: new Date(),
          DisplayName: (body.displayName ?? "").trim().slice(0, 32) || null,
        },
      });

      return NextResponse.json({ ok: true, teamId: team.Id, team: team.Name });
    }

    case "display-name": {
      // The name this player carries FOR THIS TOURNAMENT.
      //
      // A player sets their own and a captain sets anyone's on their team —
      // the same rule as roles, for the same reason: a captain filling in a
      // team sheet before everybody has logged in is the normal case.
      if (!body.teamId) return NextResponse.json({ error: "teamId?" }, { status: 400 });

      const team = await prisma.tournamentTeam.findUnique({ where: { Id: body.teamId } });
      if (!team) return NextResponse.json({ error: "No such team." }, { status: 404 });

      const target = body.steamId && /^\d{17}$/.test(body.steamId) ? BigInt(body.steamId) : me;

      if (target !== me && team.CaptainSteamId !== me) {
        return NextResponse.json(
          { error: "Only the captain can rename somebody else." },
          { status: 403 },
        );
      }

      const name = (body.displayName ?? "").trim();

      // Empty clears it, falling back to the profile name. That is a real
      // choice rather than an error — it is how you undo a rename.
      if (name.length > 0 && name.length < 2) {
        return NextResponse.json({ error: "That name is too short." }, { status: 400 });
      }

      const updated = await prisma.tournamentTeamMember.updateMany({
        where: { TeamId: team.Id, SteamId: target },
        data: { DisplayName: name.slice(0, 32) || null },
      });

      if (updated.count === 0) {
        return NextResponse.json({ error: "They are not on that team." }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    case "role": {
      // A player sets their own; a captain may set anyone's on their team. Both
      // are legitimate — a captain building a team sheet before everybody has
      // logged in is the normal case, not an exception.
      if (!body.teamId) return NextResponse.json({ error: "teamId?" }, { status: 400 });

      const team = await prisma.tournamentTeam.findUnique({ where: { Id: body.teamId } });
      if (!team) return NextResponse.json({ error: "No such team." }, { status: 404 });

      const target = body.steamId && /^\d{17}$/.test(body.steamId) ? BigInt(body.steamId) : me;

      if (target !== me && team.CaptainSteamId !== me) {
        return NextResponse.json({ error: "Only the captain can set someone else's role." }, { status: 403 });
      }

      const roleT = (body.roleT ?? "").trim();
      const roleCt = (body.roleCt ?? "").trim();

      if (roleT && !T_ROLE_IDS.includes(roleT)) {
        return NextResponse.json({ error: `'${roleT}' is not a T role.` }, { status: 400 });
      }

      if (roleCt && !CT_ROLE_IDS.includes(roleCt)) {
        return NextResponse.json({ error: `'${roleCt}' is not a CT role.` }, { status: 400 });
      }

      const updated = await prisma.tournamentTeamMember.updateMany({
        where: { TeamId: team.Id, SteamId: target },
        data: { RoleT: roleT || null, RoleCt: roleCt || null },
      });

      if (updated.count === 0) {
        return NextResponse.json({ error: "They are not on that team." }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}

/** The team, if this person captains it. Everything else is somebody else's team. */
async function captainOf(teamId: number | undefined, me: bigint) {
  if (!teamId) {
    return { error: NextResponse.json({ error: "teamId?" }, { status: 400 }) };
  }

  const team = await prisma.tournamentTeam.findUnique({ where: { Id: teamId } });

  if (!team) {
    return { error: NextResponse.json({ error: "No such team." }, { status: 404 }) };
  }

  if (team.CaptainSteamId !== me) {
    return { error: NextResponse.json({ error: "Only the captain can do that." }, { status: 403 }) };
  }

  return { value: team };
}

/** A player's own team and invitations, for the registration page. */
export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in with Steam first." }, { status: 401 });
  }

  const url = new URL(req.url);
  const tournamentId = Number(url.searchParams.get("tournamentId"));

  if (!Number.isInteger(tournamentId)) {
    return NextResponse.json({ error: "tournamentId?" }, { status: 400 });
  }

  const me = BigInt(session.steamId);

  const memberships = await prisma.tournamentTeamMember.findMany({
    where: { SteamId: me, Team: { TournamentId: tournamentId } },
    include: { Team: { include: { Members: true } } },
  });

  return NextResponse.json({
    steamId: session.steamId,
    memberships: memberships.map((m) => ({
      status: m.Status,
      isCaptain: m.IsCaptain,
      team: {
        id: m.Team.Id,
        name: m.Team.Name,
        tag: m.Team.Tag,
        status: m.Team.Status,
        members: m.Team.Members.map((x) => ({
          steamId: x.SteamId.toString(),
          status: x.Status,
          isCaptain: x.IsCaptain,
          roleT: x.RoleT,
          roleCt: x.RoleCt,
        })),
      },
    })),
  });
}
