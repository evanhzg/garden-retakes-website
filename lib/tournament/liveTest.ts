import { prisma } from "@/lib/db";
import { execOnServer } from "@/lib/tournament/servers";
import { startMatch } from "@/lib/tournament/matchRunner";
import { autoVeto } from "@/lib/tournament/vetoRunner";

// Playing a test match on a real server, with bots for players.
//
// The simulator resolves a bracket without a server, which is the fast way to
// check the website. This is the other half: the same match, handed to an
// actual CS2 server through the same startMatch() a real match uses, and then
// populated with bots so somebody can join and walk the in-game flow.
//
// Nothing here is a special path for tests. startMatch does the map load, the
// roster lock, the roles, the sides and css_t_go exactly as it always does —
// the only addition is filling the empty slots afterwards, which is what a
// human tester cannot do for five absent team-mates.
//
// Bots are safe to add to a locked roster: the plugin excludes them from its
// real-player checks (Util/Players.cs) and does not kick anybody for being off
// a roster — it only refuses them player commands.

export type LiveTestResult = {
  ok: boolean;
  error?: string;
  matchId?: number;
  connect?: string;
  /** What was actually sent to the server, so a failure is diagnosable. */
  log: string[];
};

export async function startLiveBotMatch(tournamentId: number): Promise<LiveTestResult> {
  const log: string[] = [];

  const tournament = await prisma.tournament.findUnique({
    where: { Id: tournamentId },
    select: { Id: true, IsTest: true, TeamSize: true, StartedAt: true },
  });

  if (!tournament) return { ok: false, error: "No such tournament.", log };

  // The same guard as everything else bot-related. A real event must never
  // acquire a button that fills its server with bots.
  if (!tournament.IsTest) return { ok: false, error: "Not a test tournament.", log };
  if (tournament.StartedAt === null) return { ok: false, error: "Start the tournament first.", log };

  // The first match with two teams that has not been played.
  const match = await prisma.tournamentMatch.findFirst({
    where: {
      TournamentId: tournamentId,
      State: { notIn: ["finished", "live"] },
      TeamAId: { not: null },
      TeamBId: { not: null },
    },
    orderBy: [{ Round: "asc" }, { Slot: "asc" }],
    include: { Maps: true },
  });

  if (!match) return { ok: false, error: "No match is waiting to be played.", log };

  // A match with no maps has not been vetoed. Bots cannot veto for themselves
  // in game, so decide it here — the same autoVeto the simulator uses, through
  // the same validator a captain's veto goes through.
  if (match.Maps.length === 0) {
    const veto = await autoVeto(match.Id);
    if (!veto.ok) return { ok: false, error: "Could not decide the maps.", log };
    log.push(`veto → ${veto.maps.join(", ")}`);
  }

  const started = await startMatch(match.Id);
  if (!started.ok) return { ok: false, error: started.error, log };

  log.push(`started on server ${started.serverId}`);

  const fresh = await prisma.tournamentMatch.findUnique({
    where: { Id: match.Id },
    select: { ServerId: true },
  });

  if (fresh?.ServerId) {
    /**
     * Wait, then raise the quota, then fill. All three matter.
     *
     * cfg/r5e/tournament.cfg sets `bot_quota 0`, and the plugin applies the
     * mode cfg from a deferred tick shortly AFTER css_t_go rather than during
     * it. Filling immediately therefore adds bots that the cfg then kicks a
     * moment later — which is exactly what happened the first time this ran:
     * css_fill reported "filled to 3 bot(s) a side", and the server was empty
     * seconds afterwards with a NETWORK_DISCONNECT_KICKED in the log.
     *
     * So: give the deferred cfg time to land, then put the quota back, then
     * fill. Setting the quota without waiting would just be overwritten by it.
     */
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const slots = tournament.TeamSize * 2;
    await execOnServer(fresh.ServerId, "bot_quota_mode normal");
    await execOnServer(fresh.ServerId, `bot_quota ${slots}`);
    log.push(`bot_quota ${slots}`);

    // css_fill and css_randomroles are the plugin's own playtest commands
    // (R5eGames.Tournament/Testing/Playtest.cs) — the console names of the same
    // !fill and !randomroles a tester would type in chat. Reusing them means
    // this exercises the plugin's own filling logic rather than a second one
    // written over RCON.
    const fill = await execOnServer(fresh.ServerId, `css_fill ${tournament.TeamSize}`);
    log.push(`css_fill ${tournament.TeamSize} → ${fill.trim().slice(0, 120)}`);

    const roles = await execOnServer(fresh.ServerId, "css_randomroles");
    log.push(`css_randomroles → ${roles.trim().slice(0, 120)}`);

    // Say what actually survived, rather than what was asked for. The whole
    // failure above was a command reporting success and the result evaporating.
    const status = await execOnServer(fresh.ServerId, "status");
    const players = /players\s*:\s*(.+)/i.exec(status)?.[1]?.trim();
    if (players) log.push(`status → ${players.slice(0, 80)}`);
  }

  return {
    ok: true,
    matchId: match.Id,
    connect: started.connect,
    log,
  };
}
