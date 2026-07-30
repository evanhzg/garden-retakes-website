import { NextResponse } from "next/server";
import { resolveAvatars } from "@/lib/avatars";

export const dynamic = "force-dynamic";

/**
 * GET /api/avatars?ids=7656...,7656...
 *
 * Client-side avatar resolution for components that render a player list they
 * did not fetch server-side. Server components should call resolveAvatars()
 * directly instead of round-tripping through here.
 */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // One Steam call covers 100 ids; cap the request so a crafted query cannot
  // fan out into an unbounded number of upstream calls.
  if (ids.length === 0) return NextResponse.json({});
  if (ids.length > 200) {
    return NextResponse.json({ error: "too many ids (max 200)" }, { status: 400 });
  }

  const map = await resolveAvatars(ids);
  return NextResponse.json(map, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
