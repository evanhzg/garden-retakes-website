import { prisma } from "@/lib/db";
import { getTournamentContext, type TournamentContext } from "@/lib/tournamentAuth";
import { managesEverything } from "@/lib/tournamentRoles";
import {
  canDriveServer,
  isReservedCommand,
  refusalMessage,
  type ServerActor,
  type ServerClaim,
} from "@/lib/tournament/serverAccess";

// The live console: what it is allowed to run, and what everybody watching sees.
//
// The scrollback is SHARED per server rather than private per browser tab. Two
// organizers on the same match is the normal case at an event — one in the
// server, one on the site — and a console where each of them sees only their
// own commands is two people independently discovering the same thing and then
// disagreeing about it. Everything that happens on a server appears in one
// place, attributed to whoever caused it.
//
// In memory, deliberately. This is a running conversation with a machine, not a
// record: it is useful for the length of a match and worthless the next day, and
// a table of it would be a table nobody ever reads and everybody's backup pays
// for. It survives as long as the node process, which is longer than any match.

/**
 * Where a line came from.
 *
 * "command" is somebody typing at the console and the server's reply to it.
 * "log" is the server talking on its own — a connect, a kill, a plugin error,
 * the reason a map did not load. They share one buffer because they are one
 * conversation in time order: a command whose reply looks fine and a plugin
 * exception logged half a second later are the same story, and reading them in
 * two places is how you miss that.
 */
export type ConsoleKind = "command" | "log";

export type ConsoleLine = {
  /** Monotonic per server, so a poller can ask for "everything after n". */
  seq: number;
  at: string;
  /** Who ran it, as a name rather than an id — this is read by people. */
  who: string;
  command: string;
  output: string;
  ok: boolean;
  kind: ConsoleKind;
};

type Buffer = { next: number; lines: ConsoleLine[] };

/** Per server. Bounded, because a console left open for a day is not a log. */
const BUFFERS = new Map<number, Buffer>();

/**
 * Enough to read back through a whole match's worth of intervention.
 *
 * Raised from 200 when the server's own log started landing here. Two hundred
 * was a comfortable hour of typed commands; it is about ninety seconds of a
 * live round, and a buffer that has already dropped the exception you came to
 * read is a buffer that was not worth keeping.
 */
const KEEP = 600;

function bufferFor(serverId: number): Buffer {
  let buffer = BUFFERS.get(serverId);
  if (!buffer) {
    buffer = { next: 1, lines: [] };
    BUFFERS.set(serverId, buffer);
  }
  return buffer;
}

export function append(
  serverId: number,
  entry: Omit<ConsoleLine, "seq" | "at" | "kind"> & { kind?: ConsoleKind },
): ConsoleLine {
  const buffer = bufferFor(serverId);

  const line: ConsoleLine = {
    kind: "command",
    ...entry,
    seq: buffer.next++,
    at: new Date().toISOString(),
  };
  buffer.lines.push(line);

  if (buffer.lines.length > KEEP) {
    buffer.lines.splice(0, buffer.lines.length - KEEP);
  }

  return line;
}

/**
 * One line the server said without being asked.
 *
 * No `who` worth attributing and no command that caused it — that is the whole
 * difference from an `append`, and it is why the two are not the same call. A
 * log line dressed up as a command with an empty command string reads in the UI
 * as somebody having run nothing, which is a worse lie than saying "server".
 */
export function appendLog(serverId: number, output: string): ConsoleLine {
  return append(serverId, { who: "server", command: "", output, ok: true, kind: "log" });
}

/** Everything after `since`. A fresh viewer passes 0 and gets the scrollback. */
export function since(serverId: number, after: number): ConsoleLine[] {
  return bufferFor(serverId).lines.filter((l) => l.seq > after);
}

// ------------------------------------------------------------------- access

/** The tournaments this person is named as an organizer on. */
async function organizerOf(steamId: string | null): Promise<number[]> {
  if (!steamId) return [];

  try {
    const rows = await prisma.tournamentOrganizer.findMany({
      where: { SteamId: BigInt(steamId) },
      select: { TournamentId: true },
    });
    return rows.map((r) => r.TournamentId);
  } catch {
    // Refusing is the safe direction: standing that cannot be established
    // grants nothing.
    return [];
  }
}

/**
 * Which tournament currently holds a server.
 *
 * Read from the match the server is running rather than from a column on the
 * server, because that is the fact that actually expires: the row says
 * CurrentMatchId, the match says which tournament, and when the match ends the
 * link goes with it.
 */
async function heldBy(currentMatchId: number | null): Promise<number | null> {
  if (!currentMatchId) return null;

  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: currentMatchId },
    select: { TournamentId: true },
  });

  return match?.TournamentId ?? null;
}

export type Resolved =
  | { ok: true; serverId: number; serverName: string; ctx: TournamentContext; isFullAdmin: boolean }
  | { ok: false; status: number; error: string };

/**
 * Resolves the target server and whether this caller may drive it.
 *
 * Takes a matchId OR a serverId. The match form is what the match page uses and
 * is the safer of the two: it cannot name a server the match is not on.
 */
export async function resolveTarget(
  key: string | null | undefined,
  target: { serverId?: number; matchId?: number },
): Promise<Resolved> {
  const ctx = await getTournamentContext(key);

  let serverId = target.serverId ?? null;

  if (target.matchId) {
    const match = await prisma.tournamentMatch.findUnique({
      where: { Id: target.matchId },
      select: { ServerId: true },
    });

    if (!match) return { ok: false, status: 404, error: "No such match." };
    if (!match.ServerId) return { ok: false, status: 400, error: "That match is not on a server." };

    serverId = match.ServerId;
  }

  if (!serverId) return { ok: false, status: 400, error: "Which server?" };

  const server = await prisma.gameServer.findUnique({ where: { Id: serverId } });
  if (!server) return { ok: false, status: 404, error: "No such server." };

  const actor: ServerActor = {
    adminLevel: ctx.level,
    viaKey: ctx.viaKey,
    organizerOf: await organizerOf(ctx.steamId),
  };

  const claim: ServerClaim = {
    id: server.Id,
    isTournament: server.IsTournament,
    heldByTournamentId: await heldBy(server.CurrentMatchId),
  };

  const access = canDriveServer(actor, claim);
  if (!access.allowed) {
    return { ok: false, status: 403, error: refusalMessage(access.reason) };
  }

  return {
    ok: true,
    serverId: server.Id,
    serverName: server.Name,
    ctx,
    isFullAdmin: managesEverything({
      adminLevel: ctx.level,
      steamId: ctx.steamId,
      isOrganizer: ctx.isOrganizer,
      viaKey: ctx.viaKey,
    }),
  };
}

/** Whether this caller may run this particular command on a server they hold. */
export function commandRefusal(command: string, isFullAdmin: boolean): string | null {
  if (isFullAdmin) return null;

  return isReservedCommand(command)
    ? "That command is reserved for site admins — it outlives the tournament."
    : null;
}

/** How a command should be attributed in the shared scrollback. */
export const actorName = (ctx: TournamentContext): string =>
  ctx.viaKey ? "Web Key" : ctx.name || ctx.steamId || "admin";
