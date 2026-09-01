import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { sessionSteamId } from "@/lib/auth";
import { isChosenStatus, type ChosenStatus } from "@/lib/presence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The status a player chose, as opposed to the two the site observes.
 *
 * Its own route rather than a field on the settings form: it is changed from a
 * bubble in the rail, several times an evening, and a form POST that reloads
 * the page to record "away" would be worse than not offering it.
 */
export async function GET() {
  const steamId = sessionSteamId();
  if (!steamId) return NextResponse.json({ presence: null });

  const row = await prisma.gardenWebProfile.findUnique({
    where: { SteamId: steamId },
    select: { Presence: true },
  });

  return NextResponse.json({ presence: (row?.Presence as ChosenStatus) ?? null });
}

export async function POST(req: Request) {
  const steamId = sessionSteamId();
  if (!steamId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { presence?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  /**
   * Null clears it back to the default rather than writing "online".
   *
   * The two mean the same thing to every reader, and null is what every row
   * written before this column existed says — so choosing Online should leave
   * the row looking like it never chose anything, not like it chose the
   * default. That keeps "has this player ever set a status" answerable.
   */
  const wanted = body.presence;
  if (wanted !== null && !isChosenStatus(wanted)) {
    return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  }

  const value = wanted === "online" ? null : (wanted as string | null);

  // Upsert: a player who has never opened their profile has no row, and
  // choosing a status should not be the thing that fails for them.
  await prisma.gardenWebProfile.upsert({
    where: { SteamId: steamId },
    create: { SteamId: steamId, Presence: value },
    update: { Presence: value },
  });

  return NextResponse.json({ ok: true, presence: value });
}
