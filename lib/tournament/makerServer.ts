import { prisma } from "@/lib/db";
import { rconExecOn } from "@/lib/rcon";
import { targetFor } from "@/lib/tournament/servers";

/**
 * Where Maker commands go.
 *
 * They used to go through `rconExec`, which reads RCON_HOST from the
 * environment — and on this deployment that variable is empty. So "SELECT
 * IN-GAME" built a correct `css_t_maker` command and sent it nowhere, with no
 * error anywhere: the request succeeded, the row was written, and nothing
 * happened in the game. That is the worst shape a failure can have, and it is
 * why this resolves a real server instead.
 *
 * Authoring is not a match, so there is no match to take a server from. It uses
 * the first tournament server in the registry — with one Maker session at a
 * time and one authoring server, picking the lowest id is both predictable and
 * enough. When there are several, `TournamentMakerSessions.ServerId` already
 * exists to pin a session to one.
 */
export async function makerServerId(): Promise<number | null> {
  const server = await prisma.gameServer.findFirst({
    where: { IsTournament: true },
    orderBy: { Id: "asc" },
    select: { Id: true },
  });

  return server?.Id ?? null;
}

export class NoMakerServerError extends Error {
  constructor() {
    super(
      "No tournament server is registered. Add one on the tournament setup page — " +
        "the Maker needs a server to put you into Maker mode on.",
    );
    this.name = "NoMakerServerError";
  }
}

/**
 * Runs a Maker command on the authoring server.
 *
 * Throws rather than returning an empty reply when there is no server: the
 * caller checks the reply text for success, so a silent "" would read as an
 * ordinary failure and send the admin looking at the plugin.
 */
export async function makerExec(command: string): Promise<string> {
  const id = await makerServerId();
  if (id === null) throw new NoMakerServerError();

  return rconExecOn(await targetFor(id), command);
}
