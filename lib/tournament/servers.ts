import { prisma } from "@/lib/db";
import { envTarget, rconExecOn, type RconTarget } from "@/lib/rcon";

// Which server a match runs on.
//
// This replaces reading RCON_HOST/PORT/PASSWORD from the environment at the
// point of use. Six parallel matches need six targets, and a row per server is
// the difference between adding a server and editing code.
//
// Nothing existing breaks: with no rows in the table, everything falls back to
// the environment triple exactly as before.

export type ServerRow = {
  id: number;
  name: string;
  host: string;
  port: number;
  connectAddress: string | null;
  gotvAddress: string | null;
  status: string;
  currentMatchId: number | null;
};

/** Reads a server's connection details. Falls back to the environment for id 1. */
export async function targetFor(serverId: number | null | undefined): Promise<RconTarget> {
  if (!serverId) {
    return envTarget();
  }

  const server = await prisma.gameServer.findUnique({ where: { Id: serverId } });

  if (!server) {
    throw new Error(`No server ${serverId}.`);
  }

  return { host: server.Host, port: server.Port, password: server.RconPassword };
}

/** Sends a command to whichever server a match is on. */
export async function execOnServer(serverId: number | null | undefined, command: string) {
  return rconExecOn(await targetFor(serverId), command);
}

/**
 * A server that can take a match now.
 *
 * Claimed in a single conditional update rather than read-then-write: two
 * matches starting at the same moment is exactly what happens when a bracket
 * round is released, and a check followed by a separate write would hand both
 * of them the same server.
 */
export async function claimServer(matchId: number): Promise<ServerRow | null> {
  const candidates = await prisma.gameServer.findMany({
    where: { Status: "idle", IsTournament: true, CurrentMatchId: null },
    orderBy: { Id: "asc" },
  });

  for (const candidate of candidates) {
    const claimed = await prisma.gameServer.updateMany({
      where: { Id: candidate.Id, Status: "idle", CurrentMatchId: null },
      data: { Status: "busy", CurrentMatchId: matchId },
    });

    if (claimed.count === 1) {
      return {
        id: candidate.Id,
        name: candidate.Name,
        host: candidate.Host,
        port: candidate.Port,
        connectAddress: candidate.ConnectAddress,
        gotvAddress: candidate.GotvAddress,
        status: "busy",
        currentMatchId: matchId,
      };
    }
    // Somebody else took it between the read and the write. Try the next.
  }

  return null;
}

export async function releaseServer(serverId: number | null | undefined) {
  if (!serverId) return;

  await prisma.gameServer.updateMany({
    where: { Id: serverId },
    data: { Status: "idle", CurrentMatchId: null },
  });
}

/**
 * What a player is told to type. Falls back to the host and port, which is a
 * worse thing to read out on a stream but is never wrong.
 */
export function connectString(server: ServerRow): string {
  return server.connectAddress ?? `${server.host}:${server.port}`;
}
