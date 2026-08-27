import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Head-to-head on one map, for the plugin's !vs command.
//
// Counted from GardenHeatmaps rather than from NemesisRecords. NemesisRecords
// holds a running kill tally per pair and is the cheaper read, but it has no map
// column — it is "who kills you most, ever", which is a different question from
// the one !vs asks. Heatmap rows carry MapName and are indexed on it and on both
// SteamIds, so the per-map answer comes out of data that already exists rather
// than needing a new table kept in step with the old one.
//
// One request answers the whole server: a retakes server is ten people, and ten
// separate lookups from a game callback is ten round trips to render one chat
// message.

/** Nobody has a hundred people on a retakes server, and a caller asking for a
 *  hundred is a caller to be ignored rather than served. */
const MAX_OPPONENTS = 32;

export async function GET(req: Request) {
  const url = new URL(req.url);

  const key = process.env.INVSIM_API_KEY;
  if (!key || url.searchParams.get("apiKey") !== key) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const map = (url.searchParams.get("map") ?? "").trim().toLowerCase();
  const meRaw = (url.searchParams.get("me") ?? "").trim();

  if (!map) return NextResponse.json({ error: "map?" }, { status: 400 });
  if (!/^\d{17}$/.test(meRaw)) return NextResponse.json({ error: "me?" }, { status: 400 });

  const others = (url.searchParams.get("others") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{17}$/.test(s) && s !== meRaw)
    .slice(0, MAX_OPPONENTS);

  if (others.length === 0) return NextResponse.json({ map, me: meRaw, rows: [] });

  const me = BigInt(meRaw);
  const them = others.map((s) => BigInt(s));

  // Two grouped counts rather than one query per opponent. Both directions are
  // needed and neither can be derived from the other.
  const [killsBy, killsAgainst] = await Promise.all([
    prisma.gardenHeatmap.groupBy({
      by: ["VictimSteamId"],
      where: { MapName: map, AttackerSteamId: me, VictimSteamId: { in: them } },
      _count: { _all: true },
    }),
    prisma.gardenHeatmap.groupBy({
      by: ["AttackerSteamId"],
      where: { MapName: map, VictimSteamId: me, AttackerSteamId: { in: them } },
      _count: { _all: true },
    }),
  ]);

  const mine = new Map(killsBy.map((r) => [r.VictimSteamId.toString(), r._count._all]));
  const theirs = new Map(killsAgainst.map((r) => [r.AttackerSteamId.toString(), r._count._all]));

  // Names, so the plugin does not have to resolve them and a player who has
  // left mid-request still reads as a person.
  const profiles = await prisma.playerProfile.findMany({
    where: { SteamId: { in: them } },
    select: { SteamId: true, LastKnownName: true },
  });
  const nameOf = new Map(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName ?? ""]));

  const rows = others
    .map((steamId) => ({
      steamId,
      name: nameOf.get(steamId) || "",
      // Kills I have on them, on this map.
      kills: mine.get(steamId) ?? 0,
      // Kills they have on me, on this map.
      deaths: theirs.get(steamId) ?? 0,
    }))
    // Never met on this map is not a head-to-head, and printing "0 – 0" for
    // half a server buries the three lines that mean something.
    .filter((r) => r.kills > 0 || r.deaths > 0)
    // The lopsided ones first, worst for the asker at the top: "who is beating
    // me" is the question somebody types !vs to ask.
    .sort((a, b) => a.kills - a.deaths - (b.kills - b.deaths));

  return NextResponse.json({ map, me: meRaw, rows });
}
