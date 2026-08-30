import { prisma } from "@/lib/db";
import { background } from "@/lib/background";
import { dmOrganizers } from "@/lib/discordDm";

/**
 * Raising and reading admin alerts.
 *
 * One module because an alert has three entry points — a player typing .admin
 * in the server, somebody pressing the button in the match room, and an
 * organizer acknowledging one — and they have to agree about what an alert IS.
 * When the plugin's route was the only writer that agreement was implicit;
 * with a second writer it has to be somewhere.
 */

export type AlertSource = "game" | "chat";

export type RaiseInput = {
  source: AlertSource;
  /** The plugin knows the match by its key; the website knows it by id. */
  matchKey?: string | null;
  matchId?: number | null;
  map?: string | null;
  steamId: string;
  name?: string | null;
  team?: string | null;
  score?: string | null;
  reason?: string | null;
};

/**
 * The link an organizer needs, and the only thing they will actually click.
 *
 * Built from the slug and the id rather than stored, so a tournament renamed
 * after an alert was raised does not leave a dead link in somebody's Discord.
 */
export function alertUrl(origin: string, slug: string | null, matchId: number | null): string | null {
  if (!slug || !matchId) return null;
  return `${origin.replace(/\/$/, "")}/tournaments/${slug}/match/${matchId}`;
}

/**
 * Writes the alert, then tells people.
 *
 * That order matters and is the same one the original route chose: a failed
 * notification leaves an alert somebody still finds on the page, where a failed
 * write loses the call entirely. Nothing about notifying is allowed to throw
 * into the caller — a Discord outage must not turn "an admin was called" into
 * an error the player sees.
 */
export async function raiseAlert(input: RaiseInput) {
  // Resolve the match once, here, so every reader afterwards has the ids.
  let matchId = input.matchId ?? null;
  let tournamentId: number | null = null;
  let slug: string | null = null;

  const match = matchId
    ? await prisma.tournamentMatch.findUnique({ where: { Id: matchId } })
    : input.matchKey
      ? await prisma.tournamentMatch.findUnique({ where: { MatchKey: input.matchKey } })
      : null;

  if (match) {
    matchId = match.Id;
    tournamentId = match.TournamentId;
    const tournament = await prisma.tournament.findUnique({
      where: { Id: match.TournamentId },
      select: { Slug: true },
    });
    slug = tournament?.Slug ?? null;
  }

  const alert = await prisma.tournamentAlert.create({
    data: {
      Source: input.source,
      MatchKey: (input.matchKey ?? match?.MatchKey ?? "").slice(0, 64),
      MatchId: matchId,
      TournamentId: tournamentId,
      Map: (input.map ?? "").slice(0, 64) || null,
      SteamId: BigInt(input.steamId),
      Name: (input.name ?? "").slice(0, 64) || null,
      Team: (input.team ?? "").slice(0, 64) || null,
      Score: (input.score ?? "").slice(0, 16) || null,
      Reason: (input.reason ?? "").slice(0, 240) || null,
    },
  });

  // The socket is the fast path, the row is the durable one.
  try {
    const io = (globalThis as { __gardenIo?: { emit: (e: string, p: unknown) => void } }).__gardenIo;
    io?.emit("t:alert", {
      id: alert.Id,
      source: alert.Source,
      tournamentId,
      matchId,
      slug,
      matchKey: alert.MatchKey,
      map: alert.Map,
      steamId: input.steamId,
      name: alert.Name,
      team: alert.Team,
      score: alert.Score,
      reason: alert.Reason,
      at: alert.CreatedAt.toISOString(),
    });
  } catch {
    // Nothing to do about it here; the row is written.
  }

  if (tournamentId) {
    background("alert:discord", () => dmOrganizers({ alertId: alert.Id, tournamentId, matchId }));
  }

  return alert;
}

/**
 * Acknowledged by one, acknowledged for all.
 *
 * Deliberately not per-organizer. An alert is a job, not a message: once
 * somebody has picked it up the others do not need to see it any more, and a
 * per-person read state would leave four organizers each clearing the same
 * call and none of them knowing whether anybody had actually gone.
 *
 * Which is also why a click from Discord counts here — the person who followed
 * the link is on their way, whatever they clicked it in.
 */
export async function ackAlert(alertId: number, bySteamId: string | null) {
  const updated = await prisma.tournamentAlert.updateMany({
    where: { Id: alertId, AckedAt: null },
    data: {
      AckedAt: new Date(),
      AckedBy: bySteamId ? BigInt(bySteamId) : null,
    },
  });

  if (updated.count > 0) {
    try {
      const io = (globalThis as { __gardenIo?: { emit: (e: string, p: unknown) => void } }).__gardenIo;
      io?.emit("t:alert:acked", { id: alertId });
    } catch {
      /* the poll will catch up */
    }
  }

  return updated.count > 0;
}
