import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/adminAuth";
import { canEditRegistry, getTournamentContext } from "@/lib/tournamentAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The global organizer registry: who may create tournaments.
//
// Reading is open to anybody who could act on it, so the page can show the list
// it is about to edit. Writing is Admin and above — see canEditOrganizerRegistry
// in lib/tournamentRoles.ts for why organizers cannot appoint each other.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getTournamentContext(url.searchParams.get("key"));

  if (!ctx.canCreate) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const rows = await prisma.gardenOrganizer.findMany({ orderBy: { AddedAt: "asc" } });

  // Names go stale — somebody added by SteamID before they ever played has none
  // at all — so the display name comes from the profile table when there is one.
  const profiles = rows.length
    ? await prisma.playerProfile.findMany({
        where: { SteamId: { in: rows.map((r) => r.SteamId) } },
        select: { SteamId: true, LastKnownName: true },
      })
    : [];
  const known = new Map(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName]));

  return NextResponse.json({
    canEdit: canEditRegistry(ctx),
    organizers: rows.map((r) => ({
      steamId: r.SteamId.toString(),
      name: known.get(r.SteamId.toString()) || r.Name || "",
      addedAt: r.AddedAt,
    })),
  });
}

export async function POST(req: Request) {
  let body: { key?: string; action?: "add" | "remove"; steamId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const ctx = await getTournamentContext(body.key);
  if (!canEditRegistry(ctx)) {
    return NextResponse.json({ error: "Only admins can change the organizer list." }, { status: 403 });
  }

  const steamId = (body.steamId ?? "").trim();
  if (!/^\d{17}$/.test(steamId)) {
    return NextResponse.json({ error: "That is not a SteamID64." }, { status: 400 });
  }

  if (body.action === "remove") {
    await prisma.gardenOrganizer.deleteMany({ where: { SteamId: BigInt(steamId) } });
    await logAdminAction(ctx, "organizer.remove", { steamId });
    return NextResponse.json({ ok: true });
  }

  await prisma.gardenOrganizer.upsert({
    where: { SteamId: BigInt(steamId) },
    create: {
      SteamId: BigInt(steamId),
      Name: body.name?.slice(0, 64) || null,
      AddedBySteamId: ctx.steamId ? BigInt(ctx.steamId) : null,
    },
    update: { Name: body.name?.slice(0, 64) || undefined },
  });

  await logAdminAction(ctx, "organizer.add", { steamId, name: body.name ?? null });
  return NextResponse.json({ ok: true });
}
