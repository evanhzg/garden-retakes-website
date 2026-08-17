import { NextResponse } from "next/server";
import { rconExec } from "@/lib/rcon";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/game-maker/defender — the scenarios the live server has.
//
// Defender is the one Maker target that is not a table here. A scenario is a
// schedule — timed bot routes — and it lives in defender/<map>.json beside the
// plugin, written by the in-game recorder. So this asks the server rather than
// the database, which also means the list is of what is actually loaded on the
// map that is actually running, not of what someone authored on a map nobody
// is on.
//
// The reply format comes from the plugin's css_maker_list: a header line, then
// one pipe-separated line per scenario.

export type DefenderScenarioRow = {
  name: string;
  site: string;
  slots: number;
  bots: number;
  state: string;
  ready: boolean;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  if (!process.env.RCON_HOST || !process.env.RCON_PASSWORD) {
    return NextResponse.json({ error: "The server is not reachable from here." }, { status: 503 });
  }

  try {
    const reply = await rconExec("css_maker_list defender");
    const lines = reply.split("\n").map((l) => l.trim()).filter(Boolean);

    const header = lines.find((l) => l.startsWith("MAKERLIST"));
    if (!header) {
      // Usually means an older plugin build: the command does not exist, so the
      // console answered with its "unknown command" line rather than a list.
      return NextResponse.json(
        { error: "The server did not answer with a scenario list — is the plugin up to date?", reply: reply.slice(0, 300) },
        { status: 502 }
      );
    }

    const map = header.split(/\s+/)[2] ?? "";
    const scenarios: DefenderScenarioRow[] = lines
      .filter((l) => l.includes("|"))
      .map((l) => {
        const [name, site, slots, bots, ...rest] = l.split("|");
        const state = rest.join("|") || "unknown";
        return {
          name,
          site,
          slots: Number(slots) || 0,
          bots: Number(bots) || 0,
          state,
          ready: state === "ready",
        };
      });

    return NextResponse.json({ map, scenarios });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reach the server." },
      { status: 502 }
    );
  }
}
