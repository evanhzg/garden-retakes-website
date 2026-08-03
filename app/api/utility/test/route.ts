import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rconExec } from "@/lib/rcon";
import { weaponFor } from "@/lib/utilityShared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/utility/test { id } — set the server up to try this lineup.
//
// Three things have to be true before it is worth teleporting anyone: the right
// map is loaded, practice mode is on, and the player is in the game. The plugin
// does the last mile in one command (css_gnade_test), because teleporting,
// switching team and putting the grenade in hand have to happen together —
// doing them as separate RCON round trips lands the player mid-switch.
//
// Signed in only, and only for yourself: this moves a real player on a live
// server, so it is not something an anonymous request gets to do.

/** A map change takes the server away for a while; say so instead of teleporting into nothing. */
async function currentMap(): Promise<string | null> {
  try {
    const out = await rconExec("status");
    return /^\s*(?:map|Map)\s*[:=]\s*(\S+)/m.exec(out)?.[1]?.split("/").pop()?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in to test a lineup." }, { status: 401 });

  let body: { id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const nade = await prisma.gardenNade.findUnique({ where: { Id: id } });
  if (!nade) return NextResponse.json({ error: "No such lineup." }, { status: 404 });

  if (!process.env.RCON_HOST || !process.env.RCON_PASSWORD) {
    return NextResponse.json({ error: "The server is not reachable from here." }, { status: 503 });
  }

  const steps: string[] = [];
  try {
    const map = await currentMap();

    if (map && map !== nade.Map) {
      await rconExec(`css_gmap ${nade.Map}`);
      return NextResponse.json({
        ok: true,
        changingMap: true,
        message: `Changing to ${nade.Map} — join the server, then press Test again.`,
      });
    }
    steps.push(map ? `already on ${map}` : "map unknown, continuing");

    await rconExec("css_gamemode practice");
    steps.push("practice mode");

    // One command: teleport, side, and the grenade in hand.
    const cmd = [
      "css_gnade_test",
      session.steamId,
      nade.StandX.toFixed(3),
      nade.StandY.toFixed(3),
      nade.StandZ.toFixed(3),
      nade.Pitch.toFixed(3),
      nade.Yaw.toFixed(3),
      weaponFor(nade.Utility),
      nade.Team || "any",
    ].join(" ");
    const reply = await rconExec(cmd);
    steps.push("placed");

    // The plugin answers when it could not find the player, which is the common
    // case: testing from a phone while not actually connected.
    if (/not (found|connected|in game)/i.test(reply)) {
      return NextResponse.json({
        ok: false,
        error: "You are not on the server — connect first, then press Test.",
      }, { status: 409 });
    }

    return NextResponse.json({ ok: true, message: `Ready on ${nade.Map}. ${nade.Name} is set up.`, steps });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reach the server.", steps },
      { status: 502 }
    );
  }
}
