import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveNames } from "@/lib/names";

export const dynamic = "force-dynamic";

// Batch display-name + avatar lookup for the games hub / lobbies.
// POST { ids: string[] } -> { players: { [steamId]: { name, avatar } } }
// Non-numeric ids (guests, bots) are ignored — clients label those themselves.
export async function POST(req: Request) {
  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = Array.isArray(body.ids) ? body.ids : [];
  const ids = Array.from(
    new Set(
      raw
        .filter((id): id is string => typeof id === "string" && /^\d{5,20}$/.test(id))
        .slice(0, 64)
    )
  );

  if (ids.length === 0) {
    return NextResponse.json({ players: {} });
  }

  const bigIds = ids.map((id) => BigInt(id));
  const [names, webProfiles] = await Promise.all([
    resolveNames(bigIds),
    prisma.gardenWebProfile.findMany({
      where: { SteamId: { in: bigIds } },
      select: { SteamId: true, AvatarUrl: true },
    }),
  ]);

  const avatars = new Map(webProfiles.map((p) => [p.SteamId.toString(), p.AvatarUrl]));

  const players: Record<string, { name: string; avatar: string | null }> = {};
  for (const id of ids) {
    players[id] = {
      name: names.get(id) ?? id,
      avatar: avatars.get(id) ?? null,
    };
  }

  return NextResponse.json({ players });
}
