import { prisma } from "@/lib/db";

/**
 * Direct messages to a tournament's organizers.
 *
 * An alert that only exists on a page nobody has open is an alert nobody
 * answers. Organizers are not sitting on the bracket at two in the morning
 * waiting for somebody to type .admin, and Discord is where they already are.
 *
 * A DM needs a bot token and two calls: open a channel with the recipient, then
 * post to it. The token is the same DISCORD_BOT_TOKEN the bot uses, and the
 * recipient's Discord id comes from GardenDiscordLinks — which is why an
 * organizer who has not linked their account gets nothing, and why the tools
 * page says so rather than leaving them wondering.
 */

const API = "https://discord.com/api/v10";

function token(): string {
  return (process.env.DISCORD_BOT_TOKEN ?? "").trim();
}

export function discordDmConfigured(): boolean {
  return token().length > 0;
}

/** Opens (or reuses) the DM channel with one user. */
async function dmChannel(discordId: string): Promise<string | null> {
  const res = await fetch(`${API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordId }),
  });

  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.id ?? null;
}

async function send(discordId: string, content: string): Promise<boolean> {
  const channel = await dmChannel(discordId);
  if (!channel) return false;

  const res = await fetch(`${API}/channels/${channel}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  return res.ok;
}

/**
 * The origin to build links against.
 *
 * Not the request's own host: this runs from a background task where there may
 * be no request, and a link in a DM has to work from a phone rather than from
 * whatever internal hostname happened to serve the write.
 */
function origin(): string {
  const site = (process.env.SITE_URL ?? "").trim().replace(/\/$/, "");
  if (site && !/\.onrender\.com$/i.test(site) && !site.includes("example.com")) return site;
  return "https://www.retakes.fr";
}

/**
 * Tells every organizer of a tournament that somebody wants them.
 *
 * The link goes through /api/tournament/alert/open rather than straight to the
 * match, so that following it from Discord acknowledges the alert for
 * everybody. Four organizers should not each walk to the same call.
 */
export async function dmOrganizers({
  alertId,
  tournamentId,
  matchId,
}: {
  alertId: number;
  tournamentId: number;
  matchId: number | null;
}): Promise<{ sent: number; unlinked: number }> {
  if (!discordDmConfigured()) return { sent: 0, unlinked: 0 };

  const alert = await prisma.tournamentAlert.findUnique({ where: { Id: alertId } });
  if (!alert || alert.AckedAt) return { sent: 0, unlinked: 0 };

  const [tournament, organizers] = await Promise.all([
    prisma.tournament.findUnique({ where: { Id: tournamentId }, select: { Name: true, Slug: true } }),
    prisma.tournamentOrganizer.findMany({ where: { TournamentId: tournamentId } }),
  ]);

  if (organizers.length === 0) return { sent: 0, unlinked: 0 };

  const links = await prisma.gardenDiscordLink.findMany({
    where: { SteamId: { in: organizers.map((o) => o.SteamId) } },
  });

  const bySteamId = new Map(links.map((l) => [l.SteamId.toString(), l.DiscordId]));

  const where = alert.Source === "game" ? "in game" : "in the match room";
  const link = matchId ? `${origin()}/api/tournament/alert/open?id=${alertId}` : origin();

  // Deliberately plain text, not an embed. A DM that renders as a wall of card
  // on a phone lock screen tells you less at a glance than one line does.
  const lines = [
    `**Admin called** — ${tournament?.Name ?? `tournament ${tournamentId}`}`,
    `${alert.Name ?? alert.SteamId.toString()}${alert.Team ? ` (${alert.Team})` : ""} asked ${where}.`,
    alert.Map || alert.Score ? `${alert.Map ?? "?"}${alert.Score ? ` · ${alert.Score}` : ""}` : null,
    alert.Reason ? `> ${alert.Reason}` : null,
    matchId ? `Match #${matchId} — ${link}` : link,
    `_Opening this marks the call as handled for every organizer._`,
  ].filter(Boolean);

  const content = lines.join("\n");

  let sent = 0;
  let unlinked = 0;

  for (const organizer of organizers) {
    const discordId = bySteamId.get(organizer.SteamId.toString());
    if (!discordId) {
      unlinked++;
      continue;
    }
    // One failure must not stop the rest — a stale Discord id for one organizer
    // is not a reason for the other three to hear nothing.
    try {
      if (await send(discordId, content)) sent++;
    } catch {
      /* keep going */
    }
  }

  return { sent, unlinked };
}
