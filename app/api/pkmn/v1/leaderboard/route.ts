import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";
import { resolveNames, nameFrom } from "@/lib/names";

export const dynamic = "force-dynamic";

// GET /api/pkmn/v1/leaderboard?type=species|badges
//
// Top 20 trainers. "species" ranks by distinct species ever owned (a simple
// Pokédex-completion proxy until a dedicated seen/caught dex table exists);
// "badges" ranks by badge count.
export async function GET(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const type = new URL(req.url).searchParams.get("type") === "badges" ? "badges" : "species";

  if (type === "badges") {
    const trainers = await prisma.pkmnTrainer.findMany({ select: { SteamId: true, Badges: true } });
    const ranked = trainers
      .map((t) => ({ steamId: t.SteamId, count: (JSON.parse(t.Badges || "[]") as string[]).length }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    const names = await resolveNames(ranked.map((r) => r.steamId));

    return NextResponse.json({
      type,
      leaderboard: ranked.map((r, i) => ({
        rank: i + 1,
        steamId: r.steamId.toString(),
        name: nameFrom(names, r.steamId),
        badges: r.count,
      })),
    });
  }

  const mons = await prisma.pkmnMon.findMany({ select: { OwnerId: true, Species: true } });
  const bySpecies = new Map<string, Set<string>>();
  for (const m of mons) {
    const key = m.OwnerId.toString();
    if (!bySpecies.has(key)) bySpecies.set(key, new Set());
    bySpecies.get(key)!.add(m.Species);
  }
  const ranked = Array.from(bySpecies.entries())
    .map(([steamId, set]) => ({ steamId, count: set.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  const names = await resolveNames(ranked.map((r) => r.steamId));

  return NextResponse.json({
    type,
    leaderboard: ranked.map((r, i) => ({
      rank: i + 1,
      steamId: r.steamId,
      name: nameFrom(names, r.steamId),
      speciesCaught: r.count,
    })),
  });
}
