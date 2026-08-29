import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  canActOn,
  checkTeamEntry,
  checkTeamName,
  cleanTag,
  isTeamRole,
  teamCan,
  type TeamRole,
} from "@/lib/tournament/teams";
import { createTeam, deleteTeam, enteredElsewhere, roleIn } from "@/lib/tournament/teamStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Standing teams: everything a captain or a manager does to one.
//
// One route with an action, like the tournament admin route, because every one
// of these needs the same two things — a signed-in caller, and that caller's
// role IN THIS TEAM — and writing that out per endpoint is how one of them ends
// up missing it.
//
// Who may do what is teamCan() and canActOn() in lib/tournament/teams.ts, which
// is tested. Nothing here decides authority for itself.

type Body = {
  action?:
    | "create"
    | "rename"
    | "invite"
    | "remove"
    | "role"
    | "transfer"
    | "delete"
    | "leave"
    | "enter";
  teamId?: number;
  name?: string;
  tag?: string | null;
  bio?: string | null;
  steamId?: string;
  role?: string;
  tournamentId?: number;
  /** For `enter`: which of the roster are playing. */
  players?: string[];
};

const looksLikeSteamId = (s: string) => /^7656119\d{10}$/.test(s.trim());

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const me = session.steamId;

  if (body.action === "create") {
    const made = await createTeam({
      name: body.name ?? "",
      tag: body.tag ?? null,
      captainSteamId: me,
    });

    return made.ok
      ? NextResponse.json({ ok: true, slug: made.slug, id: made.id })
      : NextResponse.json({ error: made.error }, { status: 400 });
  }

  // Everything else acts on a team, so the caller's standing in it is resolved
  // once, here, rather than per branch.
  if (!body.teamId) return NextResponse.json({ error: "Which team?" }, { status: 400 });

  const team = await prisma.gardenTeam.findUnique({ where: { Id: body.teamId } });
  if (!team) return NextResponse.json({ error: "No such team." }, { status: 404 });

  const mine = await roleIn(team.Id, me);

  const refuse = () => NextResponse.json({ error: "You cannot do that in this team." }, { status: 403 });

  switch (body.action) {
    case "rename": {
      if (!teamCan(mine, "edit")) return refuse();

      const name = (body.name ?? "").trim();
      const valid = checkTeamName(name);
      if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

      const clash = await prisma.gardenTeam.findUnique({ where: { Name: name } });
      if (clash && clash.Id !== team.Id) {
        return NextResponse.json({ error: "A team with that name already exists." }, { status: 400 });
      }

      // The slug is NOT changed. A link somebody shared is worth more than a
      // tidy URL, and a team that renames itself mid-tournament would otherwise
      // break every link to it.
      await prisma.gardenTeam.update({
        where: { Id: team.Id },
        data: {
          Name: name,
          Tag: body.tag === undefined ? undefined : body.tag ? cleanTag(body.tag) : null,
          Bio: body.bio === undefined ? undefined : (body.bio ?? "").slice(0, 2000) || null,
        },
      });

      return NextResponse.json({ ok: true });
    }

    case "invite": {
      if (!teamCan(mine, "invite")) return refuse();

      const id = (body.steamId ?? "").trim();
      if (!looksLikeSteamId(id)) {
        return NextResponse.json({ error: "That is not a SteamID64." }, { status: 400 });
      }

      // No roster cap. A standing team may hold twenty players; the tournament's
      // TeamSize decides how many of them play, at the point of entry.
      await prisma.gardenTeamMember.upsert({
        where: { TeamId_SteamId: { TeamId: team.Id, SteamId: BigInt(id) } },
        create: { TeamId: team.Id, SteamId: BigInt(id), Role: "player" },
        update: {},
      });

      return NextResponse.json({ ok: true });
    }

    case "remove": {
      const id = (body.steamId ?? "").trim();
      if (!looksLikeSteamId(id)) {
        return NextResponse.json({ error: "That is not a SteamID64." }, { status: 400 });
      }

      const theirs = await roleIn(team.Id, id);
      if (!theirs) return NextResponse.json({ error: "They are not in this team." }, { status: 400 });

      if (!teamCan(mine, "remove") || !canActOn(mine, theirs)) return refuse();

      await prisma.gardenTeamMember.deleteMany({ where: { TeamId: team.Id, SteamId: BigInt(id) } });
      return NextResponse.json({ ok: true });
    }

    case "role": {
      const id = (body.steamId ?? "").trim();
      const next = (body.role ?? "").trim();

      if (!isTeamRole(next) || next === "captain") {
        return NextResponse.json(
          { error: "A role is manager or player. Handing over the team is its own action." },
          { status: 400 },
        );
      }

      const theirs = await roleIn(team.Id, id);
      if (!theirs) return NextResponse.json({ error: "They are not in this team." }, { status: 400 });

      if (!teamCan(mine, "promote") || !canActOn(mine, theirs)) return refuse();

      await prisma.gardenTeamMember.updateMany({
        where: { TeamId: team.Id, SteamId: BigInt(id) },
        data: { Role: next as TeamRole },
      });

      return NextResponse.json({ ok: true });
    }

    case "transfer": {
      if (!teamCan(mine, "transfer")) return refuse();

      const id = (body.steamId ?? "").trim();
      const theirs = await roleIn(team.Id, id);
      if (!theirs) return NextResponse.json({ error: "They are not in this team." }, { status: 400 });

      // Both rows move in one transaction. Half of this is a team with two
      // captains or none, and both are worse than a failed request.
      await prisma.$transaction([
        prisma.gardenTeamMember.updateMany({
          where: { TeamId: team.Id, SteamId: BigInt(id) },
          data: { Role: "captain" },
        }),
        prisma.gardenTeamMember.updateMany({
          where: { TeamId: team.Id, SteamId: BigInt(me) },
          data: { Role: "manager" },
        }),
        prisma.gardenTeam.update({
          where: { Id: team.Id },
          data: { CaptainSteamId: BigInt(id) },
        }),
      ]);

      return NextResponse.json({ ok: true });
    }

    case "delete": {
      if (!teamCan(mine, "delete")) return refuse();
      await deleteTeam(team.Id);
      return NextResponse.json({ ok: true });
    }

    case "leave": {
      if (!mine) return NextResponse.json({ error: "You are not in this team." }, { status: 400 });

      // The captain cannot walk out: a team with no captain has nobody who can
      // delete it or hand it on. Transfer first, which the message says.
      if (mine === "captain") {
        return NextResponse.json(
          { error: "Hand the team to somebody else before you leave it." },
          { status: 400 },
        );
      }

      await prisma.gardenTeamMember.deleteMany({ where: { TeamId: team.Id, SteamId: BigInt(me) } });
      return NextResponse.json({ ok: true });
    }

    case "enter": {
      if (!teamCan(mine, "enter")) return refuse();
      if (!body.tournamentId) return NextResponse.json({ error: "Which tournament?" }, { status: 400 });

      const tournament = await prisma.tournament.findUnique({ where: { Id: body.tournamentId } });
      if (!tournament) return NextResponse.json({ error: "No such tournament." }, { status: 404 });
      if (tournament.StartedAt) {
        return NextResponse.json({ error: "That tournament has started." }, { status: 400 });
      }

      const chosen = (body.players ?? []).map(String);

      // The roster is the source of truth: you may only enter people who are
      // actually in the team, whatever the client sent.
      const roster = await prisma.gardenTeamMember.findMany({
        where: { TeamId: team.Id },
        select: { SteamId: true },
      });
      const inTeam = new Set(roster.map((r) => r.SteamId.toString()));

      for (const id of chosen) {
        if (!inTeam.has(id.trim())) {
          return NextResponse.json({ error: "You picked somebody who is not in the team." }, { status: 400 });
        }
      }

      const clashes = await enteredElsewhere(tournament.Id, chosen, team.Id);

      const verdict = checkTeamEntry({
        teamSize: tournament.TeamSize,
        chosen,
        alreadyEntered: clashes,
      });

      if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: 400 });

      // Already in with this team? Replace the roster rather than making a
      // second entry, so changing who plays is one action.
      const existing = await prisma.tournamentTeam.findFirst({
        where: { TournamentId: tournament.Id, GardenTeamId: team.Id },
      });

      const entry =
        existing ??
        (await prisma.tournamentTeam.create({
          data: {
            TournamentId: tournament.Id,
            GardenTeamId: team.Id,
            Name: team.Name,
            Tag: team.Tag,
            CaptainSteamId: team.CaptainSteamId,
            Status: "accepted",
          },
        }));

      await prisma.tournamentTeamMember.deleteMany({ where: { TeamId: entry.Id } });
      await prisma.tournamentTeamMember.createMany({
        data: chosen.map((id, i) => ({
          TeamId: entry.Id,
          SteamId: BigInt(id.trim()),
          IsCaptain: i === 0,
          Status: "accepted",
          RespondedAt: new Date(),
        })),
        skipDuplicates: true,
      });

      return NextResponse.json({ ok: true, entryId: entry.Id, slug: tournament.Slug });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
