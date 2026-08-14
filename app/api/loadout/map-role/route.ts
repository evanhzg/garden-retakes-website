import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isRole } from "@/lib/retakeLoadout";
import { isKnownMap } from "@/lib/utilityShared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET/PUT the signed-in player's per-map role overrides — layered on top of
// the global GardenRetakeLoadout.RoleT/RoleCt fallback. "Anchor" on Mirage can
// mean something different from "Anchor" on Vertigo, so a player who cares
// sets it per map; everyone else just keeps their one global pick.

type Row = { map: string; side: "T" | "CT"; roleId: string; site: "A" | "B" | null };

const isSide = (v: unknown): v is "T" | "CT" => v === "T" || v === "CT";
const isSite = (v: unknown): v is "A" | "B" | null => v === null || v === "A" || v === "B";

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in to see your map roles." }, { status: 401 });

  const rows = await prisma.gardenMapRolePreference.findMany({
    where: { SteamId: BigInt(session.steamId) },
  });

  const out: Row[] = rows.map((r) => ({
    map: r.Map,
    side: r.Side as "T" | "CT",
    roleId: r.RoleId,
    site: (r.Site as "A" | "B" | null) ?? null,
  }));

  return NextResponse.json({ rows: out });
}

export async function PUT(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in to save your map roles." }, { status: 401 });
  const steamId = BigInt(session.steamId);

  let body: { map?: unknown; side?: unknown; roleId?: unknown; site?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const map = typeof body.map === "string" ? body.map : "";
  if (!isKnownMap(map)) return NextResponse.json({ error: "unknown map" }, { status: 400 });
  if (!isSide(body.side)) return NextResponse.json({ error: "invalid side" }, { status: 400 });
  if (!isSite(body.site ?? null)) return NextResponse.json({ error: "invalid site" }, { status: 400 });

  const side = body.side;
  const site = (body.site ?? null) as "A" | "B" | null;

  // An empty roleId clears the override back to the global fallback rather
  // than storing a meaningless row.
  if (body.roleId === "" || body.roleId === null || body.roleId === undefined) {
    await prisma.gardenMapRolePreference.deleteMany({
      where: { SteamId: steamId, Map: map, Side: side },
    });
    return NextResponse.json({ ok: true });
  }

  if (typeof body.roleId !== "string" || !isRole(body.roleId)) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }

  await prisma.gardenMapRolePreference.upsert({
    where: { SteamId_Map_Side: { SteamId: steamId, Map: map, Side: side } },
    create: { SteamId: steamId, Map: map, Side: side, RoleId: body.roleId, Site: site },
    update: { RoleId: body.roleId, Site: site },
  });

  return NextResponse.json({ ok: true });
}
