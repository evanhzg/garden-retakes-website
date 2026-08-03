import { NextResponse } from "next/server";
import { medalsFor } from "@/lib/medals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/medals?steamId=… — what one player holds. */
export async function GET(req: Request) {
  const steamId = (new URL(req.url).searchParams.get("steamId") ?? "").trim();
  if (!/^\d{17}$/.test(steamId)) return NextResponse.json({ medals: [] });
  const map = await medalsFor([BigInt(steamId)]);
  return NextResponse.json({ medals: map.get(steamId) ?? [] });
}
