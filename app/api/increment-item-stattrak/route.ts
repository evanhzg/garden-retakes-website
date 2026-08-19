import { NextResponse } from "next/server";
import { incrementItemKill } from "@/lib/stattrak";

export const dynamic = "force-dynamic";

// Called by the plugin on every kill made with a StatTrak item, and on every
// MVP for a StatTrak music kit:
//
//   POST { apiKey, userId, targetUid }
//
// The plugin has already incremented the number it paints on the weapon by the
// time this arrives — it does that locally so the counter moves the instant the
// kill lands, rather than after a round trip to Vercel. This call is what makes
// that stick: without it the count was rebuilt as zero on the next inventory
// fetch, which is what "StatTrak never counts anything" was.
//
// It answered 404 until now, on every kill, from a plugin that fed the response
// straight to a JSON deserializer. That combination used to take the game server
// down; both halves are fixed, and this is the half that makes the feature real.
export async function POST(request: Request) {
  const secret = (process.env.INVSIM_API_KEY ?? "").trim();
  if (!secret) {
    return NextResponse.json({ error: "INVSIM_API_KEY not configured" }, { status: 500 });
  }

  let body: { apiKey?: string; userId?: string; targetUid?: number | string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if ((body.apiKey ?? "").trim() !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!body.userId || !/^\d{17}$/.test(body.userId)) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // The plugin sends targetUid as a number; accept the string form too, because
  // a uid that arrives as "12" and is silently rejected looks exactly like a
  // counter that does not work.
  const uid = typeof body.targetUid === "string" ? Number(body.targetUid) : body.targetUid;
  if (!Number.isInteger(uid) || (uid as number) < 0) {
    return NextResponse.json({ error: "targetUid required" }, { status: 400 });
  }

  const result = await incrementItemKill(BigInt(body.userId), uid as number);
  if (!result) {
    // No season running. Not an error the plugin should retry or shout about:
    // the kill happened, there is just nothing for it to count towards yet.
    return NextResponse.json({ ok: false, error: "no active season" });
  }

  return NextResponse.json({
    ok: true,
    season: result.seasonName,
    seasonId: result.seasonId,
    // Kills with this one item this season — what the gun shows.
    kills: result.kills,
    // Kills with anything this season — what the player is actually measured by.
    seasonKills: result.seasonKills,
  });
}
