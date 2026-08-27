import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

// Bot teams, for testing a tournament end to end without six people.
//
// Bots are ordinary rows: a real-looking SteamId, an accepted membership, a
// captain. Every join, bracket, scoreboard and stats path then treats them as
// players with no special case anywhere, and IsBot is the single column that
// says otherwise. The alternative — a parallel "test roster" concept — would
// mean every query grew a branch and the thing being tested stopped being the
// thing that runs.

/**
 * SteamIDs for bots.
 *
 * Real Steam accounts are 7656119[0-9]{10} and allocated upwards from
 * 76561197960265728. This range sits far above anything Valve has issued, so a
 * bot can never collide with a person, and a 17-digit id that starts 76561999
 * is recognisable as synthetic at a glance in a database client.
 */
// BigInt() rather than a 76561999000000000n literal: tsconfig targets below
// ES2020, where BigInt literals are a syntax error.
const BOT_BASE = BigInt("76561999000000000");

/** Names that read as people in a bracket, which is the point of the exercise. */
const BOT_NAMES = [
  "Rezan", "Darryl", "Rouchard", "Dragomir", "Arno", "Cavalry",
  "Baroud", "Getaway", "Enforcer", "Maximus", "Jaques", "Sox",
  "Trapper", "Vitesse", "Karol", "Nomad", "Pike", "Quill",
  "Renard", "Sable", "Talon", "Ulysse", "Vega", "Wren",
];

const TEAM_NAMES = [
  "Ashgrove", "Blackpine", "Coldwater", "Drakemoor", "Eastwind",
  "Fernhollow", "Greyhaven", "Highmark", "Ironvale", "Jetstream",
  "Kestrel", "Lowfield", "Mistral", "Northgate", "Oakshade", "Pinecrest",
];

/**
 * Add one team of bots to a tournament.
 *
 * Refuses anywhere that is not explicitly a test tournament. IsTest is a
 * deliberate flag rather than a synonym for unpublished, precisely so that an
 * organizer setting up a real event cannot acquire a "fill with bots" button by
 * having not published yet.
 */
export async function addBotTeam(
  tournamentId: number,
  name?: string,
): Promise<{ ok: boolean; error?: string; teamId?: number }> {
  const tournament = await prisma.tournament.findUnique({
    where: { Id: tournamentId },
    select: { Id: true, IsTest: true, TeamSize: true, MaxTeams: true, StartedAt: true },
  });

  if (!tournament) return { ok: false, error: "No such tournament." };
  if (!tournament.IsTest) return { ok: false, error: "Not a test tournament." };
  if (tournament.StartedAt !== null) return { ok: false, error: "Already started." };

  const existing = await prisma.tournamentTeam.count({ where: { TournamentId: tournamentId } });
  if (existing >= tournament.MaxTeams) return { ok: false, error: "Tournament is full." };

  // Highest bot id in use, so two teams added in the same tournament do not
  // share players — which would make one bot appear on both sides of a match.
  const highest = await prisma.tournamentTeamMember.findFirst({
    where: { IsBot: true },
    orderBy: { SteamId: "desc" },
    select: { SteamId: true },
  });

  let nextId = highest && highest.SteamId >= BOT_BASE ? highest.SteamId + BigInt(1) : BOT_BASE;

  const teamName = name?.trim() || `${TEAM_NAMES[existing % TEAM_NAMES.length]} Bots`;
  const captainId = nextId;

  const team = await prisma.tournamentTeam.create({
    data: {
      TournamentId: tournamentId,
      Name: teamName,
      Tag: teamName.slice(0, 3).toUpperCase(),
      CaptainSteamId: captainId,
      Status: "accepted",
      InviteToken: randomBytes(16).toString("hex"),
    },
  });

  const members = [];
  for (let i = 0; i < tournament.TeamSize; i++) {
    members.push({
      TeamId: team.Id,
      SteamId: nextId,
      IsCaptain: i === 0,
      Status: "accepted",
      IsBot: true,
      DisplayName: `${BOT_NAMES[Number(nextId % BigInt(BOT_NAMES.length))]}`,
      RespondedAt: new Date(),
    });
    nextId += BigInt(1);
  }

  await prisma.tournamentTeamMember.createMany({ data: members });

  return { ok: true, teamId: team.Id };
}

/** Fill a test tournament to its team count in one action. */
export async function fillWithBots(
  tournamentId: number,
): Promise<{ ok: boolean; error?: string; added: number }> {
  const tournament = await prisma.tournament.findUnique({
    where: { Id: tournamentId },
    select: { MaxTeams: true, IsTest: true },
  });

  if (!tournament) return { ok: false, error: "No such tournament.", added: 0 };
  if (!tournament.IsTest) return { ok: false, error: "Not a test tournament.", added: 0 };

  const existing = await prisma.tournamentTeam.count({ where: { TournamentId: tournamentId } });
  let added = 0;

  for (let i = existing; i < tournament.MaxTeams; i++) {
    const result = await addBotTeam(tournamentId);
    if (!result.ok) return { ok: added > 0, error: result.error, added };
    added++;
  }

  return { ok: true, added };
}
