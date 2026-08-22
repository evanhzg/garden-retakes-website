import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Safe scores for a set of players.
//
// /api/safe-queue/status answers for the signed-in account only, which is the
// right shape for the application form it backs and the wrong one for a party
// panel that draws a shield beside every member. The lobby was calling a
// /api/users/safe-scores that has never existed, so the shield never appeared;
// this is the endpoint it was reaching for.
//
// Public, deliberately: the shield is drawn to everyone in the lobby already,
// and the whole point of a safety score is that the people you are about to be
// matched with can see it. The application itself — the Discord handle, the
// motivation, the gender field — stays behind /status and is not returned here.

/** One Steam party is at most three, a match at most six. This is generous. */
const MAX_IDS = 100;

export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{5,20}$/.test(s));

  if (ids.length === 0) return NextResponse.json({});
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `too many ids (max ${MAX_IDS})` }, { status: 400 });
  }

  try {
    const rows = await prisma.gardenSafeStatus.findMany({
      where: { SteamId: { in: ids.map((id) => BigInt(id)) } },
      select: { SteamId: true, Status: true, SafeScore: true },
    });

    return NextResponse.json(
      Object.fromEntries(
        rows.map((r) => [
          r.SteamId.toString(),
          { score: Math.round(r.SafeScore), probation: r.Status === "PROBING" },
        ])
      ),
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read safe scores." },
      { status: 500 }
    );
  }
}
