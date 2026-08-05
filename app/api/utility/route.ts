import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isKnownMap, type Lineup } from "@/lib/utilityShared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/utility?map=de_mirage — every lineup on one map.
//
// A map at a time rather than the lot: the page only ever draws one radar, and
// a LAN's worth of lineups is not something to ship to the browser wholesale.

export async function GET(req: Request) {
  const map = (new URL(req.url).searchParams.get("map") ?? "").trim();
  if (!isKnownMap(map)) return NextResponse.json({ error: "unknown map", lineups: [] }, { status: 400 });

  let rows;
  try {
    rows = await prisma.gardenNade.findMany({
      where: { Map: map },
      orderBy: [{ Area: "asc" }, { Name: "asc" }],
    });
  } catch {
    return NextResponse.json({ error: "Lineup table missing — run sql/utility.sql.", lineups: [] }, { status: 503 });
  }

  const lineups: Lineup[] = rows.map((r) => ({
    id: r.Id,
    map: r.Map,
    name: r.Name,
    area: r.Area,
    utility: r.Utility,
    purpose: r.Purpose,
    team: r.Team,
    throwType: r.ThrowType,
    clickType: r.ClickType,
    stand: { x: r.StandX, y: r.StandY, z: r.StandZ },
    view: { pitch: r.Pitch, yaw: r.Yaw },
    land: r.LandX !== null && r.LandY !== null ? { x: r.LandX, y: r.LandY, z: r.LandZ ?? 0 } : null,
    notes: r.Notes,
    clipUrl: r.ClipUrl,
    thumb: r.Thumb,
    shots: { stand: r.ShotStand, aim: r.ShotAim, result: r.ShotResult },
    verified: r.Verified,
    source: r.Source,
  }));

  return NextResponse.json({ lineups });
}
