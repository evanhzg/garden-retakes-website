import { prisma } from "@/lib/db";
import { resolveNames } from "@/lib/names";
import {
  checkTeamName,
  cleanTag,
  teamSlug,
  type TeamRole,
} from "@/lib/tournament/teams";

// Standing teams, against the database.
//
// The rules live in teams.ts and are tested there; this only reads and writes.
// The one thing worth saying twice: there are NO foreign keys in this database,
// so deleting a team deletes its members by hand. Prisma's cascade is a client
// -side fiction and relying on it is how four tournament deletes once left 160
// orphaned rows behind.

export type TeamMemberView = {
  steamId: string;
  name: string;
  role: TeamRole;
  joinedAt: string;
};

export type TeamView = {
  id: number;
  name: string;
  slug: string;
  tag: string | null;
  bio: string | null;
  captainSteamId: string;
  hasAvatar: boolean;
  createdAt: string;
  members: TeamMemberView[];
};

/** A unique slug, adding -2, -3 … only when it has to. */
async function freeSlug(name: string, exceptId?: number): Promise<string> {
  const base = teamSlug(name) || "team";

  for (let n = 1; n < 200; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.gardenTeam.findUnique({ where: { Slug: candidate } });
    if (!taken || taken.Id === exceptId) return candidate;
  }

  // Two hundred teams with the same name is not a naming collision, it is
  // somebody scripting. A suffix nobody will guess ends the loop.
  return `${base}-${Date.now().toString(36)}`;
}

export async function teamBySlug(slug: string): Promise<TeamView | null> {
  const team = await prisma.gardenTeam.findUnique({
    where: { Slug: slug },
    include: { Members: { orderBy: { JoinedAt: "asc" } } },
  });

  if (!team) return null;

  const names = await resolveNames(team.Members.map((m) => m.SteamId));

  return {
    id: team.Id,
    name: team.Name,
    slug: team.Slug,
    tag: team.Tag,
    bio: team.Bio,
    captainSteamId: team.CaptainSteamId.toString(),
    hasAvatar: team.AvatarBytes !== null,
    createdAt: team.CreatedAt.toISOString(),
    members: team.Members.map((m) => {
      const id = m.SteamId.toString();
      return {
        steamId: id,
        name: names.get(id) ?? id,
        role: (m.Role as TeamRole) ?? "player",
        joinedAt: m.JoinedAt.toISOString(),
      };
    }),
  };
}

/** What role this player holds in this team, or null if they are not in it. */
export async function roleIn(teamId: number, steamId: string | null): Promise<TeamRole | null> {
  if (!steamId) return null;

  const row = await prisma.gardenTeamMember.findFirst({
    where: { TeamId: teamId, SteamId: BigInt(steamId) },
    select: { Role: true },
  });

  return (row?.Role as TeamRole) ?? null;
}

export async function createTeam(args: {
  name: string;
  tag?: string | null;
  captainSteamId: string;
}): Promise<{ ok: true; slug: string; id: number } | { ok: false; error: string }> {
  const valid = checkTeamName(args.name);
  if (!valid.ok) return { ok: false, error: valid.error };

  const name = args.name.trim();

  const clash = await prisma.gardenTeam.findUnique({ where: { Name: name } });
  if (clash) return { ok: false, error: "A team with that name already exists." };

  const team = await prisma.gardenTeam.create({
    data: {
      Name: name,
      Slug: await freeSlug(name),
      Tag: args.tag ? cleanTag(args.tag) : null,
      CaptainSteamId: BigInt(args.captainSteamId),
    },
  });

  // The captain is a member. Without this row every membership query has to
  // special-case the captain, and one of them would eventually forget.
  await prisma.gardenTeamMember.create({
    data: { TeamId: team.Id, SteamId: BigInt(args.captainSteamId), Role: "captain" },
  });

  return { ok: true, slug: team.Slug, id: team.Id };
}

/** Deletes a team and everything hanging off it, top down. */
export async function deleteTeam(teamId: number): Promise<void> {
  await prisma.gardenTeamMember.deleteMany({ where: { TeamId: teamId } });

  // Entries are NOT deleted. A tournament that has been played holds this team
  // in its bracket and its scoreboards; removing the row would orphan all of
  // it. The pointer is cleared so the entry becomes what an ad-hoc team has
  // always been.
  await prisma.tournamentTeam.updateMany({
    where: { GardenTeamId: teamId },
    data: { GardenTeamId: null },
  });

  await prisma.gardenTeam.delete({ where: { Id: teamId } });
}

/**
 * Every tournament this team has entered, newest first.
 *
 * The point of a standing team: three entries by the same five people are one
 * history rather than three unrelated rows.
 */
export async function teamHistory(teamId: number) {
  const entries = await prisma.tournamentTeam.findMany({
    where: { GardenTeamId: teamId },
    include: { Tournament: { select: { Name: true, Slug: true, StartedAt: true, State: true } } },
    orderBy: { Id: "desc" },
    take: 50,
  });

  const ids = entries.map((e) => e.Id);

  // Placings come from the bracket: a team that won its last match and has no
  // next match won the tournament. Cheap enough to compute here and honest —
  // there is no Placing column to be wrong.
  const matches = ids.length
    ? await prisma.tournamentMatch.findMany({
        where: { OR: [{ TeamAId: { in: ids } }, { TeamBId: { in: ids } }] },
        select: {
          TeamAId: true,
          TeamBId: true,
          WinnerTeamId: true,
          State: true,
          NextMatchId: true,
          TournamentId: true,
        },
      })
    : [];

  return entries.map((e) => {
    const mine = matches.filter((m) => m.TeamAId === e.Id || m.TeamBId === e.Id);
    const played = mine.filter((m) => m.State === "finished");
    const won = played.filter((m) => m.WinnerTeamId === e.Id).length;

    const wonFinal = played.some((m) => m.WinnerTeamId === e.Id && m.NextMatchId === null);

    return {
      entryId: e.Id,
      teamName: e.Name,
      tournament: e.Tournament.Name,
      slug: e.Tournament.Slug,
      startedAt: e.Tournament.StartedAt?.toISOString() ?? null,
      state: e.Tournament.State,
      played: played.length,
      won,
      lost: played.length - won,
      /** True only when they won a match that led nowhere — i.e. the final. */
      champion: wonFinal,
    };
  });
}

/** The standing teams this player belongs to. */
export async function teamsOf(steamId: string) {
  const rows = await prisma.gardenTeamMember.findMany({
    where: { SteamId: BigInt(steamId) },
    include: { Team: { include: { _count: { select: { Members: true } } } } },
    orderBy: { JoinedAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.Team.Id,
    name: r.Team.Name,
    slug: r.Team.Slug,
    tag: r.Team.Tag,
    role: (r.Role as TeamRole) ?? "player",
    memberCount: r.Team._count.Members,
    hasAvatar: r.Team.AvatarBytes !== null,
  }));
}

/**
 * Which of this player's OTHER standing teams are already in this tournament.
 *
 * The shape lib/tournament/teams.ts wants for its one-team-per-tournament rule.
 */
export async function enteredElsewhere(
  tournamentId: number,
  steamIds: string[],
  exceptTeamId: number,
): Promise<Record<string, { teamId: number; teamName: string }[]>> {
  if (steamIds.length === 0) return {};

  const entries = await prisma.tournamentTeam.findMany({
    where: { TournamentId: tournamentId, Status: { not: "withdrawn" } },
    include: { Members: { where: { Status: { not: "removed" } }, select: { SteamId: true } } },
  });

  const out: Record<string, { teamId: number; teamName: string }[]> = {};
  const wanted = new Set(steamIds.map((s) => s.trim()));

  for (const entry of entries) {
    if (entry.GardenTeamId === exceptTeamId) continue;

    for (const m of entry.Members) {
      const id = m.SteamId.toString();
      if (!wanted.has(id)) continue;
      (out[id] ??= []).push({ teamId: entry.Id, teamName: entry.Name });
    }
  }

  return out;
}
