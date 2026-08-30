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

  // A name nobody has comes back null, NOT as the id itself.
  //
  // Answering with the id made every caller's fallback unreachable:
  // `displayNameFor` has a "Player 4821" for exactly this case and could never
  // reach it, because a 17-digit string satisfies `??` perfectly well. The
  // matchroom showed people their own SteamID as their nickname. The avatar is
  // kept either way — having a picture and no name is a real state.
  const players: Record<string, { name: string | null; avatar: string | null }> = {};
  for (const id of ids) {
    const name = names.get(id);

    players[id] = {
      name: name && name !== id ? name : null,
      avatar: avatars.get(id) ?? null,
    };
  }

  return NextResponse.json({ players });
}
