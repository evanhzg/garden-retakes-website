import { background } from "@/lib/background";
import { prisma } from "@/lib/db";
import { claimServer, connectString, execOnServer, reclaimServer, releaseServer } from "@/lib/tournament/servers";
import { rolesForMatch } from "@/lib/tournament/roleDraft";
import { dequeue, enqueue, promoteNext } from "@/lib/tournament/queue";
import { forcedMapScore, forcedSeriesScore, type Slot } from "@/lib/tournament/forceEnd";

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

  /** Set when this start is recovering a match the server forgot. */
  let restoreScore: { a: number; b: number } | null = null;

  /**
   * "Already live" is a claim about the server, not about this row.
   *
   * A game server that restarts — a deploy, a crash, an admin — comes back with
   * no match in it, while this row still says "live". startMatch then refused
   * on the strength of the row alone, so the match was live nowhere and
   * unstartable: the website would not run it because it thought it already
   * was, and the plugin had never heard of it. The only way out was somebody
   * editing the database by hand, which is where three of these ended up.
   *
   * So the row is checked against the server before it is believed. If the
   * plugin is still running THIS match, refusing is right and the state is
   * left alone. If it is not — no match, or a different one — the row is stale
   * and this restarts it, which is the reconciliation the rest of the function
   * was already written to perform (it cancels and resets the plugin before
   * declaring anything).
   *
   * Unreachable counts as "still live". A server that cannot be asked is not a
   * server that has lost the match, and restarting on a dropped RCON packet
   * would take a real match away from the people playing it.
   */
  if (match.State === "live") {
    if (!match.ServerId) {
      return { ok: false, error: "That match is already live." };
    }

    let plugin: string;
    try {
      plugin = await execOnServer(match.ServerId, "css_t_status");
    } catch {
      return { ok: false, error: "That match is already live." };
    }

    const stillOurs =
      /live=yes/i.test(plugin) &&
      (!match.MatchKey || plugin.includes(match.MatchKey));

    if (stillOurs) return { ok: false, error: "That match is already live." };

    // Stale. Put the row back where the rest of this function expects to find
    // it: the map it was on goes back to pending so there is something to play.
    const stranded = match.Maps.find((m) => m.State === "live");
    if (stranded) {
      await prisma.tournamentMatchMap.update({
        where: { Id: stranded.Id },
        data: { State: "pending" },
      });
      stranded.State = "pending";

      // And remember where the match had got to. The plugin lost the score with
      // the match; the website did not, and a recovery that restarts a 9-9 map
      // at 0-0 has thrown away nine rounds nobody wants to play twice.
      if (stranded.ScoreA > 0 || stranded.ScoreB > 0) {
        restoreScore = { a: stranded.ScoreA, b: stranded.ScoreB };
      }
    }

    await prisma.tournamentMatch.update({
      where: { Id: match.Id },
      data: { State: "ready" },
    });
    match.State = "ready";
  }

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

  // Reusing the server this match already names — a restart, or the next map
  // of a series — re-asserts the claim rather than assuming it still holds.
  // Without that the pool could say idle while the match ran there, and the
  // next match to look claimed the same box: two matches on one server, each
  // declaring rosters over the other. Losing the race means waiting in the
  // queue, which is what the null below leads to.
  const server = match.ServerId
    ? (await reclaimServer(match.ServerId, matchId))
      ? { id: match.ServerId, ...(await serverRow(match.ServerId)) }
      : null
    : await claimServer(matchId);

  // Nothing free: wait in line rather than failing.
  //
  // A bracket releases a whole round at once and the fleet is six servers, so
  // this is the normal case rather than an error. Returning a bare failure left
  // the match in "ready" — indistinguishable from one nobody had started — and
  // the server then went to whoever retried fastest instead of whoever had
  // waited longest.
  if (!server) {
    await enqueue(matchId);
    return { ok: false, error: "No server is free — the match is waiting for one." };
  }

  // Placed, so it is no longer waiting.
  await dequeue(matchId);

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
    await execOnServer(server.id, `css_t_team 0 ${consoleName(teamA.Name)} ${rosterA.join(" ")}`);
    await execOnServer(server.id, `css_t_team 1 ${consoleName(teamB.Name)} ${rosterB.join(" ")}`);

    // Roles, per player and per side.
    //
    // The match's own draft first, the team sheet second. That order is what
    // makes "roles are re-picked every match" mean anything: the sheet holds
    // whatever the team last chose, and for a match drafted an hour ago that is
    // not what they agreed to play.
    //
    // Only sent for players who actually have one. The plugin falls back to the
    // side's generalist for anybody it was not told about, so a half-filled team
    // sheet plays correctly — and sending a role nobody picked would be worse
    // than sending none.
    const drafted = await rolesForMatch(matchId);

    for (const team of [teamA, teamB]) {
      for (const member of team.Members) {
        const steamId = member.SteamId.toString();
        const pick = drafted.get(steamId);

        const roleT = pick?.roleT ?? member.RoleT;
        const roleCt = pick?.roleCt ?? member.RoleCt;

        if (roleT) {
          await execOnServer(server.id, `css_t_role ${steamId} T ${roleT}`);
        }

        if (roleCt) {
          await execOnServer(server.id, `css_t_role ${steamId} CT ${roleCt}`);
        }
      }
    }

    // Which roster slots the server should fill with bots.
    //
    // This is the seam that used to be missing entirely. A bot is rostered here
    // as an ordinary player with a synthetic SteamID64, so every bracket and
    // stats path treats it as one — but a CS2 bot has no SteamID, so the server
    // could not tell which of the six ids it was supposed to spawn somebody for,
    // and a bot match arrived on an empty server that then waited for a .ready
    // nobody could type. The plugin does the quota and the seating; it only
    // needed telling which slots, and what to call them.
    for (const team of [teamA, teamB]) {
      for (const member of team.Members.filter((m) => m.IsBot)) {
        // The name is optional: a bot slot with no display name is still a bot
        // slot, and the server keeps whatever the engine called it.
        //
        // The empty check is on the SANITISED name, not the raw one. A display
        // name of "  " is truthy and sanitises to nothing, which would have sent
        // the team fallback and put a bot called "team" on the scoreboard.
        const clean = consoleName(member.DisplayName ?? "", "");
        await execOnServer(
          server.id,
          `css_t_bot ${member.SteamId.toString()}${clean ? ` ${clean}` : ""}`,
        );
      }
    }

    // What the server cannot know: which event this is, and whether the series
    // continues after this map. The first names the demo folder; the second
    // decides whether the map ending holds everybody in warmup for the next one
    // or stops recording so the demo is written.
    const played = match.Maps.filter((m) => m.State === "finished").length;
    const more = played + 1 < match.Maps.length;

    const tournament = await prisma.tournament.findUnique({
      where: { Id: match.TournamentId },
      select: { Name: true },
    });

    await execOnServer(
      server.id,
      `css_t_series ${more ? "more" : "last"} ${consoleName(tournament?.Name ?? "", "tournament")}`,
    );

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

    // Recovering a match the server lost: put the scoreline back.
    //
    // Only ever after a reconcile — a normal start is 0-0 and setting it would
    // be a no-op with a side-effect, since css_score also decides which side
    // each team is on for the scoreline it is given. That is wanted here: a map
    // resumed at 9-9 has to come back with the teams where those nine rounds
    // left them, not where the fresh map put them.
    if (restoreScore) {
      await execOnServer(server.id, `css_score ${restoreScore.a} ${restoreScore.b}`);
    }

    await prisma.$transaction([
      prisma.tournamentMatch.update({
        where: { Id: matchId },
        data: { State: "live", StartedAt: new Date() },
      }),
      prisma.tournamentMatchMap.update({
        where: { Id: nextMap.Id },
        // The score stays as it was on a recovery; the map is being resumed,
        // not replayed.
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
 * A team name, safe to send down a console line.
 *
 * Spaces are kept. css_t_team is positional but its parser takes everything
 * between the index and the first SteamID as the name, so "Ashgrove Bots"
 * arrives intact — and now that the plugin puts these on the scoreboard through
 * mp_teamname_1/2, hyphenating them was a visible loss rather than a harmless
 * one.
 *
 * Quotes, semicolons and newlines are not kept. Any of them would end the
 * argument and turn the rest of the name into a second console command run with
 * the server's privileges, and team names come from a public registration form.
 */
function consoleName(name: string, fallback = "team"): string {
  const cleaned = name.replace(/["';\r\n]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 32) : fallback;
}

/**
 * Records a finished map and advances the match, and the bracket behind it.
 *
 * Called by the ingest when the plugin reports a match end. Idempotent on the
 * map's state, because a plugin that retries must not advance a bracket twice.
 */
/**
 * How long the plugin holds everybody between maps of a series.
 *
 * Mirrors MatchFlow.BetweenMapsSeconds in the plugin, which announces exactly
 * this number in chat. If one changes the other has to.
 */
const BETWEEN_MAPS_MS = 15_000;

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

    // The match KEEPS its ServerId on purpose: "which server did that match run
    // on" is a question asked after the fact, and clearing it threw the answer
    // away. It cannot cause a stale spectate button, because the match route
    // gates that on serverIsUp — ServerId AND a state of ready or live — so a
    // finished match names its server without offering a way into it.
    //
    // The server itself is released above, which is what actually frees it for
    // the next match; the two facts are separate and only one of them expires.
    await advance(match.Id);

    // The freed server goes to whoever has waited longest. Not awaited for its
    // result: promoteNext runs a whole startMatch, map load included, and the
    // plugin reporting a finished map must not wait on the next match booting.
    // Losing this one is quieter than losing a start and was costing more:
    // promoteNext runs a whole startMatch, so abandoning it meant a freed
    // server was never handed to the match that had waited longest. The queue
    // simply stopped moving, and nothing said so.
    background("match:promoteNext", () => promoteNext());
  } else {
    /**
     * The series continues, so somebody has to load the next map — and until
     * now nobody did.
     *
     * finishMap put the match back to "ready" and stopped there, which looks
     * finished from the database's side and is anything but from the server's:
     * the plugin holds everybody in the between-maps warmup waiting for a map
     * change that was never coming. A bot BO3 sat there knife-fighting in
     * warmup on map one with the website already showing map one won.
     *
     * Delayed by the countdown the plugin has just announced in chat, so the
     * map does not change out from under "next map in 15s". background() keeps
     * the instance alive across it; the route's maxDuration covers the wait
     * plus the start.
     */
    background("match:nextMap", async () => {
      await new Promise((r) => setTimeout(r, BETWEEN_MAPS_MS));
      await startMatch(match.Id);
    });
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


/**
 * Ends a match by hand, and makes the result stick.
 *
 * Deliberately NOT a wrapper around the plugin's css_endmatch. That command was
 * the whole implementation of "force end" and it fails silently in the one
 * situation an admin most needs it: the game server restarted, the plugin came
 * back with no match in memory, and it answers "no match is live" while the
 * website still shows the match running. Measured on the fleet — the website
 * had #17 live on server 4 and the plugin had nothing at all. Every admin
 * button was a no-op and the match could not be ended from anywhere.
 *
 * So the database is the thing that ends, and the server is told afterwards as
 * a courtesy. If the server has a match it wraps up; if it does not, the
 * bracket has still moved, which is what an admin pressing "force end" wants.
 */
export async function forceEndMatch(
  matchId: number,
  winner: Slot,
): Promise<{ ok: boolean; error?: string; reply?: string }> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    include: { Maps: { orderBy: { Ordinal: "asc" } } },
  });

  if (!match) return { ok: false, error: "No such match." };
  if (match.State === "finished") return { ok: false, error: "That match has already ended." };

  const winnerTeamId = winner === "a" ? match.TeamAId : match.TeamBId;
  const loserTeamId = winner === "a" ? match.TeamBId : match.TeamAId;

  // The map that was being played, or — if the server never got that far — the
  // first one that has not finished. A BO3 forced during map two must not award
  // map one all over again.
  const target =
    match.Maps.find((m) => m.State === "live") ?? match.Maps.find((m) => m.State !== "finished");

  if (target) {
    const line = forcedMapScore({ a: target.ScoreA, b: target.ScoreB }, winner);

    await prisma.tournamentMatchMap.update({
      where: { Id: target.Id },
      data: { ScoreA: line.a, ScoreB: line.b, WinnerTeamId: winnerTeamId, State: "finished" },
    });
  }

  // Recount from what the maps now say, then let the award override it if the
  // admin has given the series to somebody who was behind.
  const wonA =
    match.Maps.filter((m) => m.Id !== target?.Id && m.WinnerTeamId === match.TeamAId).length +
    (target && winnerTeamId === match.TeamAId ? 1 : 0);
  const wonB =
    match.Maps.filter((m) => m.Id !== target?.Id && m.WinnerTeamId === match.TeamBId).length +
    (target && winnerTeamId === match.TeamBId ? 1 : 0);

  const series = forcedSeriesScore({ a: wonA, b: wonB }, winner, match.BestOf);

  await prisma.tournamentMatch.update({
    where: { Id: match.Id },
    data: {
      ScoreA: series.a,
      ScoreB: series.b,
      State: "finished",
      WinnerTeamId: winnerTeamId,
      EndedAt: new Date(),
    },
  });

  // The bracket, which is the part an admin is actually forcing. Without this
  // the next match never receives a team and the round stalls on a result
  // everybody can already see.
  await advance(match.Id);

  // The game is stopped BEFORE the server goes back in the pool.
  //
  // It used to be the other way round, and the order was the bug: releasing
  // first marks the box idle while a live round is still being played on it, so
  // the next match to look could claim a server with a game in progress — and
  // if the command then failed, nothing stopped the old one at all. That is the
  // "I awarded the match and they kept playing" report.
  //
  // Still tolerant of a server that has gone away, which is a normal reason to
  // be awarding a match by hand in the first place. The difference is that the
  // failure is now reported rather than swallowed: the match is over either
  // way, and an admin who needs to go and stop it themselves has to be told.
  let reply: string | undefined;
  let stopped = true;

  if (match.ServerId) {
    try {
      reply = await execOnServer(match.ServerId, `css_endmatch ${winner}`);

      // The plugin answers with a line rather than a status, so a refusal
      // arrives looking exactly like success unless it is read.
      stopped = !/unknown command|no match|not live/i.test(reply ?? "");
    } catch (err) {
      reply = err instanceof Error ? err.message : String(err);
      stopped = false;
    }
  }

  // The server goes back in the pool, but the match KEEPS naming it: "which
  // server did that run on" is asked after the fact, and the match route gates
  // the spectate button on State being ready or live, so a finished match
  // cannot offer a way into somebody else's game.
  await releaseServer(match.ServerId);

  background("match:promoteNext", () => promoteNext());

  void loserTeamId;
  return {
    ok: true,
    reply: stopped ? reply : `Ended, but the server did not confirm it stopped: ${reply ?? "no answer"}`,
  };
}

/**
 * Puts a match back to the start.
 *
 * Keeps the veto and the roles, because those were agreed between the two
 * teams and re-running them is a negotiation, not a restart — a match that
 * crashed on map one should come back on the same map with the same sides and
 * the same role picks. What is thrown away is everything that was PLAYED:
 * scores, stat rows, winners, and the ended-ness of the match itself.
 *
 * The server is left claimed if it was claimed, so a restart lands on the same
 * box rather than fighting the queue for a new one.
 */
export async function restartMatch(matchId: number): Promise<{ ok: boolean; error?: string }> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    include: { Maps: { orderBy: { Ordinal: "asc" } } },
  });

  if (!match) return { ok: false, error: "No such match." };

  // Stat rows are per map, and a replayed map that keeps its old rows shows
  // every player's kills twice. Deleted rather than superseded because there is
  // no version of "the first attempt" anybody wants to read.
  await prisma.tournamentPlayerStat.deleteMany({ where: { MatchId: match.Id } });

  await prisma.tournamentMatchMap.updateMany({
    where: { MatchId: match.Id },
    data: {
      ScoreA: 0,
      ScoreB: 0,
      WinnerTeamId: null,
      State: "pending",
      // The knife is replayed with the map, so its result goes too — keeping it
      // would show a knife winner for a round that is about to happen again.
      KnifeWinnerTeamId: null,
      KnifeChoice: null,
    },
  });

  await prisma.tournamentMatch.update({
    where: { Id: match.Id },
    data: {
      ScoreA: 0,
      ScoreB: 0,
      WinnerTeamId: null,
      EndedAt: null,
      // "ready" rather than "live": the match has a server and a map plan but
      // nothing has been started on it yet, which is exactly what ready means
      // and is the state startMatch expects to be handed.
      State: match.ServerId ? "ready" : "pending",
    },
  });

  // A restarted match that had already advanced somebody has to take them back
  // out again, or the next round holds a team that has not won yet.
  await retract(match.Id);

  return { ok: true };
}

/**
 * Undoes an advance.
 *
 * The mirror of {@link advance}, and it exists only for restarts. Clears the
 * slot rather than blanking the whole next match, so the OTHER semi-final's
 * winner stays where they are.
 */
async function retract(matchId: number): Promise<void> {
  const match = await prisma.tournamentMatch.findUnique({ where: { Id: matchId } });
  if (!match) return;

  if (match.NextMatchId) {
    await prisma.tournamentMatch.update({
      where: { Id: match.NextMatchId },
      data: match.NextSlot === 0 ? { TeamAId: null } : { TeamBId: null },
    });
  }

  if (match.LoserNextMatchId) {
    await prisma.tournamentMatch.update({
      where: { Id: match.LoserNextMatchId },
      data: match.LoserNextSlot === 0 ? { TeamAId: null } : { TeamBId: null },
    });
  }
}

/**
 * Moves a match to another server, keeping everything it had.
 *
 * Built out of the recovery path rather than beside it. The work is identical
 * to what `startMatch` already does for a match whose server restarted under
 * it: put the live map back to pending, remember the score, take the target
 * server, run the start, put the score back. Writing a second version of that
 * would be a second set of bugs about the same six steps.
 *
 * The Blitz Tier is carried too, and this is the only place the site can get
 * it: the ladder lives in the plugin's memory and dies with the match on the
 * old box. What the site does have is the round feed, whose round rows carry
 * both sides' tier — so the last round played is the record, and it is replayed
 * onto the new server. A move that reset both teams to the pistol rung would
 * hand somebody a free reset by asking an admin for a server change.
 *
 * Returns the reason it could not happen rather than throwing, because every
 * caller here is an admin action that wants to say why on screen.
 */
export async function moveMatchToServer(
  matchId: number,
  targetServerId: number,
): Promise<{ ok: boolean; error?: string }> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { Id: true, ServerId: true, State: true, Maps: { select: { Id: true, State: true, ScoreA: true, ScoreB: true } } },
  });

  if (!match) return { ok: false, error: "No such match." };
  if (match.ServerId === targetServerId) return { ok: false, error: "The match is already on that server." };

  // Taken before anything is torn down. Losing the race here means the match
  // stays exactly where it is, which is the outcome worth having when two
  // admins press the button at the same moment.
  const taken = await prisma.gameServer.updateMany({
    where: { Id: targetServerId, Status: "idle", CurrentMatchId: null },
    data: { Status: "busy", CurrentMatchId: matchId },
  });

  if (taken.count !== 1) {
    return { ok: false, error: "That server is busy — pick one that is not running a match." };
  }

  // The tier the ladder had reached, from the last round the feed recorded.
  const lastRound = await prisma.tournamentKill.findFirst({
    where: { MatchId: matchId, Kind: "round", TierA: { not: null } },
    orderBy: { Id: "desc" },
    select: { TierA: true, TierB: true },
  });

  const oldServerId = match.ServerId;

  // Tell the old box to stop before the new one starts, so two servers are
  // never both holding a live roster for one match. Best effort: a server that
  // has already gone away is exactly the case a move is being used for.
  if (oldServerId) {
    try {
      await execOnServer(oldServerId, "css_t_reset");
    } catch {
      // Unreachable, which is fine — it is being abandoned either way.
    }
    await releaseServer(oldServerId);
  }

  const live = match.Maps.find((m) => m.State === "live");
  if (live) {
    await prisma.tournamentMatchMap.update({ where: { Id: live.Id }, data: { State: "pending" } });
  }

  await prisma.tournamentMatch.update({
    where: { Id: matchId },
    data: { ServerId: targetServerId, PendingServerId: null, State: "ready" },
  });

  const started = await startMatch(matchId);
  if (!started.ok) {
    return { ok: false, error: started.error ?? "The match could not be started on that server." };
  }

  // After the start, because going live is what resets both of them on the
  // plugin's side — putting them back first would be putting them back before
  // they were cleared.
  if (lastRound?.TierA && lastRound.TierB) {
    try {
      await execOnServer(targetServerId, `css_tier a ${lastRound.TierA}`);
      await execOnServer(targetServerId, `css_tier b ${lastRound.TierB}`);
    } catch {
      // The score and the roster are the load-bearing part; a tier that did not
      // land is a round played on the wrong rung, not a broken match.
    }
  }

  return { ok: true };
}

/**
 * Carries out a move that was waiting for the round to end.
 *
 * Called from the ingest when the plugin reports a round, which is the only
 * moment the site knows a round has finished. Silent when nothing is pending,
 * which is almost every round.
 */
export async function applyPendingServerMove(matchId: number): Promise<void> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { PendingServerId: true },
  });

  if (!match?.PendingServerId) return;

  const target = match.PendingServerId;
  await prisma.tournamentMatch.update({ where: { Id: matchId }, data: { PendingServerId: null } });
  await moveMatchToServer(matchId, target);
}

