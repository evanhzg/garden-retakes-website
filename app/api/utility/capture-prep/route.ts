import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rconExec } from "@/lib/rcon";
import { weaponFor } from "@/lib/utilityShared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    return NextResponse.json({ error: "RCON not configured." }, { status: 503 });
  }

  try {
    const map = await currentMap();
    if (map && map !== nade.Map) {
      await rconExec(`css_gmap ${nade.Map}`);
      return NextResponse.json({
        ok: true,
        changingMap: true,
        message: `Changing map to ${nade.Map}... wait a moment then try again.`,
      });
    }

    await rconExec("css_gamemode practice");
    await rconExec("exec garden_capture_server");

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

    if (/not (found|connected|in game)/i.test(reply)) {
      return NextResponse.json({
        ok: false,
        error: "You are not connected to the server. Please join adrien.gamergod.net:26541 first.",
      }, { status: 409 });
    }

    return NextResponse.json({ ok: true, message: `Server prepared on ${nade.Map}.` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reach the server." },
      { status: 502 }
    );
  }
}
