import { NextResponse } from "next/server";
import { catalogFor } from "@/lib/re5wsServer";

export const runtime = "nodejs";
export const revalidate = 86400;

// GET /api/re5ws/catalog?slot=7|knife|gloves|agent|music&side=t|ct&type=<knife/glove def>
// What the in-game RE5WS Manager offers under "All skins" for a slot. Public, like
// /api/skins: it is the game's catalog, nobody's inventory.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slot = url.searchParams.get("slot") ?? "";
  const side = url.searchParams.get("side");
  const type = Number(url.searchParams.get("type") ?? 0) || 0;
  const answer = catalogFor(slot, side === "t" || side === "ct" ? side : "", type);
  if (!answer) return NextResponse.json({ error: "unknown slot" }, { status: 400 });
  return NextResponse.json(answer);
}
