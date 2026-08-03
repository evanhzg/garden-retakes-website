import { NextResponse } from "next/server";
import { rconExec } from "@/lib/rcon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// What the server is doing right now, for the homepage card.
//
// Public — it is the same thing anyone learns by connecting — and it never
// returns RCON output verbatim, only the parsed fields.

export async function GET() {
  try {
    const raw = await rconExec("css_gstatus");
    const json = /\{[^}]*\}/.exec(raw)?.[0];
    if (!json) return NextResponse.json({ online: false });
    const p = JSON.parse(json) as {
      map?: string;
      mode?: string;
      players?: number;
      ranked?: boolean;
      competitive?: boolean;
    };
    return NextResponse.json({
      online: true,
      map: p.map ?? null,
      mode: p.mode ?? null,
      players: p.players ?? 0,
      ranked: Boolean(p.ranked),
      competitive: Boolean(p.competitive),
    });
  } catch {
    return NextResponse.json({ online: false });
  }
}
