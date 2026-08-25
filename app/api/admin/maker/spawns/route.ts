import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminContext } from "@/lib/adminAuth";
import { AdminLevel } from "@/lib/adminImmunity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// What has been authored on a map, for the Maker page.
//
// Polled while a session is open so the variant rows appear as they are placed.
// The plugin pushes to /api/tournament/maker/variants after every keypress, so
// the freshness here is a poll interval rather than a round trip through the
// game — which is why this stays a plain GET rather than growing a socket of
// its own.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));

  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const map = (url.searchParams.get("map") ?? "").trim();
  if (!map) {
    return NextResponse.json({ error: "map is required." }, { status: 400 });
  }

  const spawns = await prisma.tournamentSpawn.findMany({
    where: { Map: map },
    include: { Variants: { orderBy: { Id: "asc" } } },
    orderBy: [{ Bombsite: "asc" }, { Team: "asc" }, { Sort: "asc" }, { Name: "asc" }],
  });

  const session = await prisma.tournamentMakerSession.findFirst({
    where: { EndedAt: null },
    orderBy: { Id: "desc" },
  });

  return NextResponse.json({
    map,
    activeSpawnId: session?.SpawnId ?? null,
    spawns: spawns.map((s) => ({
      id: s.Id,
      name: s.Name,
      role: s.RoleId,
      bombsite: s.Bombsite,
      team: s.Team,
      canBePlanter: s.CanBePlanter,
      variants: s.Variants.map((v) => ({
        id: v.Id,
        x: v.X,
        y: v.Y,
        z: v.Z,
        yaw: v.Yaw,
        setpos: v.SetPos,
        viewpos: v.ViewPos,
      })),
    })),
  });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));

  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  // Variants go with it — the relation cascades, so a spawn cannot leave
  // orphaned positions behind that nothing lists.
  await prisma.tournamentSpawn.delete({ where: { Id: id } });

  return NextResponse.json({ ok: true });
}
