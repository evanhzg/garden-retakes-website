import { prisma } from "@/lib/db";
import { claimServer, connectString, execOnServer, releaseServer } from "@/lib/tournament/servers";

// Starting a tournament match on a server.
//
// The sequence is the one the ladder already uses, extended with the two things
// a tournament adds: roles, and sides that were settled in the veto. It is
// staged one short command at a time because that is what survives RCON and what
// a person can retype in a console when a match will not start.
//
// Every reply is checked. The plugin answers a refusal with a LINE rather than
// an error, so a match that was turned down looks exactly like one that started
// unless somebody reads what came back — the ladder learned that once and had to
// write a debugging document about it.

export type StartResult =
  | { ok: true; connect: string; serverId: number; reply: string }
  | { ok: false; error: string };

/** Waits for the map to actually be loaded before declaring a match on it. */
async function waitForMap(serverId: number, map: string, attempts = 20): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, 1500));

    try {
      const status = await execOnServer(serverId, "status");
      // `status` prints the loaded map; matching on the name is enough and does
      // not depend on the exact format, which differs between builds.
      if (status.includes(map)) return true;
    } catch {
      // A server mid-changelevel refuses connections. That is expected here, so
      // it is not an error until we run out of attempts.
    }
  }

  return false;
}

/**
 * Puts a match on a server and starts it.
 *
 * Claims a server first and releases it again on any failure, so a match that
 * did not start cannot leave a server marked busy forever — which would silently
 * shrink the pool by one every time something went wrong.
 */
export async function startMatch(matchId: number): Promise<StartResult> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    include: { Maps: { orderBy: { Ordinal: "asc" } } },
  });

  if (!match) return { ok: false, error: "No such match." };
  if (!match.TeamAId || !match.TeamBId) return { ok: false, error: "The match does not have two teams yet." };
  if (match.State === "live") return { ok: false, error: "That match is already live." };

  const nextMap = match.Maps.find((m) => m.State === "pending");
  if (!nextMap) return { ok: false, error: "No map left to play." };

  const [teamA, teamB] = await Promise.all([
    prisma.tournamentTeam.findUnique({
      where: { Id: match.TeamAId },
      include: { Members: { where: { Status: "accepted" } } },
    }),
    prisma.tournamentTeam.findUnique({
      where: { Id: match.TeamBId },
      include: { Members: { where: { Status: "accepted" } } },
    }),
  ]);

  if (!teamA || !teamB) return { ok: false, error: "A team is missing." };

  const rosterA = teamA.Members.map((m) => m.SteamId.toString());
  const rosterB = teamB.Members.map((m) => m.SteamId.toString());

  if (rosterA.length === 0 || rosterB.length === 0) {
    return { ok: false, error: "A team has nobody who has accepted." };
  }

  if (rosterA.length !== rosterB.length) {
    return { ok: false, error: `Rosters differ: ${rosterA.length} v ${rosterB.length}.` };
  }

  const server = match.ServerId
    ? { id: match.ServerId, ...(await serverRow(match.ServerId)) }
    : await claimServer(matchId);

  if (!server) return { ok: false, error: "No server is free." };

  try {
    await prisma.tournamentMatch.update({
      where: { Id: matchId },
      data: { ServerId: server.id, State: "ready" },
    });

    await execOnServer(server.id, `map ${nextMap.Map}`);

    if (!(await waitForMap(server.id, nextMap.Map))) {
      throw new Error(`${nextMap.Map} did not load.`);
    }

    // Cancel first, then reset.
    //
    // css_t_reset clears a PENDING match; a live one needs css_t_cancel, and
    // TryStart refuses outright while IsLive. So a server the website thinks is
    // idle — because a match was released, or an admin freed it, or a test was
    // abandoned — can hold a live match in the plugin that nothing ever clears,
    // and every future start on that server is refused with "a match is already
    // live". This is the reconciliation: the website has just claimed this
    // server, so whatever the plugin still believes about it is stale.
    await execOnServer(server.id, "css_t_cancel");
    await execOnServer(server.id, "css_t_reset");
    await execOnServer(server.id, `css_t_team 0 ${slug(teamA.Name)} ${rosterA.join(" ")}`);
    await execOnServer(server.id, `css_t_team 1 ${slug(teamB.Name)} ${rosterB.join(" ")}`);

    // Roles, per player and per side.
    //
    // Only sent for players who actually chose one. The plugin falls back to the
    // side's generalist for anybody it was not told about, so a half-filled team
    // sheet plays correctly — and sending a role nobody picked would be worse
    // than sending none.
    for (const team of [teamA, teamB]) {
      for (const member of team.Members) {
        const steamId = member.SteamId.toString();

        if (member.RoleT) {
          await execOnServer(server.id, `css_t_role ${steamId} T ${member.RoleT}`);
        }

        if (member.RoleCt) {
          await execOnServer(server.id, `css_t_role ${steamId} CT ${member.RoleCt}`);
        }
      }
    }

    // Sides. A picked map arrives already settled by the veto; only a decider or
    // a BO1 knifes for it — and that distinction is exactly the null below.
    if (nextMap.StartSideTeamA) {
      await execOnServer(server.id, `css_t_side 0 ${nextMap.StartSideTeamA}`);
    } else {
      await execOnServer(server.id, "css_t_knife");
    }

    for (const steamId of await spectatorsFor(match.TournamentId)) {
      await execOnServer(server.id, `css_t_spectator ${steamId}`);
    }

    const reply = await execOnServer(server.id, `css_t_go ${match.MatchKey}`);

    if (!/T:\s*started/i.test(reply)) {
      throw new Error(reply.trim() || "The plugin refused without saying why.");
    }

    await prisma.$transaction([
      prisma.tournamentMatch.update({
        where: { Id: matchId },
        data: { State: "live", StartedAt: new Date() },
      }),
      prisma.tournamentMatchMap.update({
        where: { Id: nextMap.Id },
        data: { State: "live" },
      }),
    ]);

    return {
      ok: true,
      connect: connectString(server as Parameters<typeof connectString>[0]),
      serverId: server.id,
      reply: reply.trim(),
    };
  } catch (err) {
    // The server goes back in the pool. A failed start that holds a server is
    // how a pool of six quietly becomes a pool of four.
    await releaseServer(server.id);
    await prisma.tournamentMatch.update({
      where: { Id: matchId },
      data: { ServerId: null, State: "pending" },
    });

    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function serverRow(id: number) {
  const row = await prisma.gameServer.findUniqueOrThrow({ where: { Id: id } });
  return {
    name: row.Name,
    host: row.Host,
    port: row.Port,
    connectAddress: row.ConnectAddress,
    gotvAddress: row.GotvAddress,
    status: row.Status,
    currentMatchId: row.CurrentMatchId,
  };
}

async function spectatorsFor(tournamentId: number): Promise<string[]> {
  const rows = await prisma.tournamentSpectator.findMany({ where: { TournamentId: tournamentId } });
  return rows.map((r) => r.SteamId.toString());
}

/**
 * A team name as one console token.
 *
 * css_t_team is positional and the name sits between the index and the first
 * SteamID, so a space in it would swallow the first player of the roster.
 */
function slug(name: string): string {
  const cleaned = name.replace(/[^\w-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 32) : "team";
}

/**
 * Records a finished map and advances the match, and the bracket behind it.
 *
 * Called by the ingest when the plugin reports a match end. Idempotent on the
 * map's state, because a plugin that retries must not advance a bracket twice.
 */
export async function finishMap(
  matchKey: string,
  scoreA: number,
  scoreB: number,
): Promise<{ ok: boolean; matchOver: boolean }> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { MatchKey: matchKey },
    include: { Maps: { orderBy: { Ordinal: "asc" } } },
  });

  if (!match) return { ok: false, matchOver: false };

  const live = match.Maps.find((m) => m.State === "live");
  if (!live) return { ok: true, matchOver: match.State === "finished" };

  const winnerTeamId = scoreA > scoreB ? match.TeamAId : scoreB > scoreA ? match.TeamBId : null;

  await prisma.tournamentMatchMap.update({
    where: { Id: live.Id },
    data: { ScoreA: scoreA, ScoreB: scoreB, WinnerTeamId: winnerTeamId, State: "finished" },
  });

  const wonA = match.Maps.filter((m) => m.Id !== live.Id && m.WinnerTeamId === match.TeamAId).length +
    (winnerTeamId === match.TeamAId ? 1 : 0);
  const wonB = match.Maps.filter((m) => m.Id !== live.Id && m.WinnerTeamId === match.TeamBId).length +
    (winnerTeamId === match.TeamBId ? 1 : 0);

  const needed = Math.floor(match.BestOf / 2) + 1;
  const matchOver = wonA >= needed || wonB >= needed;

  await prisma.tournamentMatch.update({
    where: { Id: match.Id },
    data: {
      ScoreA: wonA,
      ScoreB: wonB,
      State: matchOver ? "finished" : "ready",
      WinnerTeamId: matchOver ? (wonA > wonB ? match.TeamAId : match.TeamBId) : null,
      EndedAt: matchOver ? new Date() : null,
    },
  });

  if (matchOver) {
    await releaseServer(match.ServerId);
    await advance(match.Id);
  }

  return { ok: true, matchOver };
}

/**
 * Moves the winner into the next match, and the loser into theirs.
 *
 * The loser pointer is the whole of a double-elimination bracket — a single-elim
 * plan simply leaves it null, so one function covers both.
 */
export async function advance(matchId: number): Promise<void> {
  const match = await prisma.tournamentMatch.findUnique({ where: { Id: matchId } });
  if (!match?.WinnerTeamId) return;

  const loserId = match.WinnerTeamId === match.TeamAId ? match.TeamBId : match.TeamAId;

  if (match.NextMatchId) {
    await prisma.tournamentMatch.update({
      where: { Id: match.NextMatchId },
      data: match.NextSlot === 0 ? { TeamAId: match.WinnerTeamId } : { TeamBId: match.WinnerTeamId },
    });
  }

  if (match.LoserNextMatchId && loserId) {
    await prisma.tournamentMatch.update({
      where: { Id: match.LoserNextMatchId },
      data: match.LoserNextSlot === 0 ? { TeamAId: loserId } : { TeamBId: loserId },
    });
  }
}
