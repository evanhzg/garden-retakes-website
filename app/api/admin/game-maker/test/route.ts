import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rconExec } from "@/lib/rcon";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/admin/game-maker/test { mode, id | name, fill }
//
// Play what is on screen, on the real server, without typing anything in game.
//
// The gap this closes: authoring a set and trying it were unrelated acts, so
// nobody tried anything until they had authored six of them and then found out
// all six shared the same mistake.
//
// The plugin does the whole thing in one command (`css_maker_test`) rather than
// this route issuing a mode change, a bot quota and a restart as three RCON
// round trips — a set half-loaded between two of those is a round nobody asked
// for.

const MODES = ["duels", "retakes", "executes", "faststrat", "defender"] as const;
type Mode = (typeof MODES)[number];

const FILLS = ["bots", "wait"] as const;

/** The map has to be the set's map, or Test teleports people into nothing. */
async function currentMap(): Promise<string | null> {
  try {
    const out = await rconExec("status");
    return /^\s*(?:map|Map)\s*[:=]\s*(\S+)/m.exec(out)?.[1]?.split("/").pop()?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: { mode?: string; id?: number; name?: string; map?: string; fill?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const mode = MODES.includes(body.mode as Mode) ? (body.mode as Mode) : null;
  if (!mode) return NextResponse.json({ error: "Unknown mode." }, { status: 400 });

  const fill = FILLS.includes(body.fill as (typeof FILLS)[number]) ? body.fill! : "wait";

  if (!process.env.RCON_HOST || !process.env.RCON_PASSWORD) {
    return NextResponse.json({ error: "The server is not reachable from here." }, { status: 503 });
  }

  // Defender scenarios are named and live in a file on the server; the other
  // four are rows here, so their map and name can be checked before the server
  // is touched at all.
  let which = (body.name ?? "").trim();
  let wantMap = (body.map ?? "").trim();

  if (mode !== "defender") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

    const set = await prisma.gmSet.findUnique({
      where: { Id: id },
      include: { Spawns: true },
    });
    if (!set) return NextResponse.json({ error: "No such set." }, { status: 404 });
    if (set.Spawns.filter((s) => s.Active).length === 0) {
      return NextResponse.json(
        { error: `"${set.Name}" has no active spawns to start with.` },
        { status: 409 }
      );
    }

    which = String(set.Id);
    wantMap = set.Map;
  } else if (!which) {
    return NextResponse.json({ error: "A scenario name is required." }, { status: 400 });
  }

  try {
    const live = await currentMap();
    if (wantMap && live && live !== wantMap) {
      await rconExec(`css_gmap ${wantMap}`);
      return NextResponse.json({
        ok: true,
        changingMap: true,
        message: `Changing to ${wantMap} — press Test again once it has loaded.`,
      });
    }

    const reply = await rconExec(`css_maker_test ${mode} "${which}" ${fill}`);
    await logAdminAction(ctx, "gamemaker.test", undefined, `${mode} ${which} fill=${fill}`);

    // The plugin answers with the reason rather than failing silently, and the
    // reasons are the ones an admin can act on ("no placed spawns", "no bots").
    if (/not ready|no .*set|has no/i.test(reply)) {
      return NextResponse.json({ ok: false, error: reply.trim() }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      message: fill === "bots"
        ? "Running with bots — join the server to watch."
        : "Warmup is open — join, bring who you need, and it starts.",
      reply: reply.trim(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reach the server." },
      { status: 502 }
    );
  }
}
