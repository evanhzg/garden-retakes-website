import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Game Maker sets — a Duels arena, a Retakes site setup, an Executes strat or
// a Fast Strat play. One endpoint for all four because they are one table; the
// mode is a filter, not a different resource.

const MODES = ["duels", "retakes", "executes", "faststrat"] as const;
type Mode = (typeof MODES)[number];

const isMode = (v: unknown): v is Mode => MODES.includes(v as Mode);

/** Sets carry their spawns and utility, so one GET fills a whole tab. */
const withChildren = {
  Spawns: { orderBy: { Id: "asc" } },
  Utilities: { orderBy: { Id: "asc" } },
} as const;

function serialise(set: {
  AddedBy: bigint | null;
  Roles: string | null;
  RoundTypes: string | null;
  [k: string]: unknown;
}) {
  return {
    ...set,
    AddedBy: set.AddedBy?.toString() ?? null,
    Roles: set.Roles ? safeParse(set.Roles) : [],
    RoundTypes: set.RoundTypes ? safeParse(set.RoundTypes) : [],
  };
}

function safeParse(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const mode = url.searchParams.get("mode");
  const map = url.searchParams.get("map");

  const sets = await prisma.gmSet.findMany({
    where: {
      ...(isMode(mode) ? { Mode: mode } : {}),
      ...(map ? { Map: map } : {}),
    },
    include: withChildren,
    orderBy: [{ Map: "asc" }, { Name: "asc" }],
  });

  return NextResponse.json({ sets: sets.map(serialise) });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  // Creating a set changes what the game server will actually run, so this is
  // Admin, not Moderator — the same bar the in-game !gexec/!garena commands use.
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!isMode(body.mode)) return NextResponse.json({ error: "unknown mode" }, { status: 400 });
  const map = typeof body.map === "string" ? body.map.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!map || !name) return NextResponse.json({ error: "map and name are required" }, { status: 400 });

  // Executes needs a site to know which bombsite it is executing onto.
  // Fast Strat deliberately does not — the two sides' picks need not concern
  // the same site, so forcing one here would be a lie.
  const site = body.site === "A" || body.site === "B" ? body.site : null;
  if (body.mode === "executes" && !site) {
    return NextResponse.json({ error: "executes strats need a site" }, { status: 400 });
  }

  const phase =
    body.mode === "faststrat" && ["early", "mid", "end"].includes(String(body.phase))
      ? String(body.phase)
      : null;

  try {
    const created = await prisma.gmSet.create({
      data: {
        Mode: body.mode,
        Map: map,
        Name: name,
        Site: site,
        Phase: phase,
        PhaseSeconds: typeof body.phaseSeconds === "number" ? Math.round(body.phaseSeconds) : null,
        Roles: JSON.stringify(Array.isArray(body.roles) ? body.roles : []),
        RoundTypes: JSON.stringify(Array.isArray(body.roundTypes) ? body.roundTypes : []),
        Votable: typeof body.votable === "boolean" ? body.votable : body.mode === "faststrat",
        Weight: typeof body.weight === "number" ? Math.max(0, Math.round(body.weight)) : 1,
        Active: typeof body.active === "boolean" ? body.active : true,
        AddedBy: ctx.steamId ? BigInt(ctx.steamId) : null,
      },
      include: withChildren,
    });

    await logAdminAction(ctx, "gamemaker.set.create", undefined, `${body.mode} ${map} "${name}"`);
    return NextResponse.json({ set: serialise(created) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // The unique index is (Mode, Map, Name) — a duplicate name inside one mode
    // and map really is the caller's problem, so that one stays a 400.
    if (/Unique|P2002/i.test(message)) {
      return NextResponse.json(
        { error: "A set with that name already exists on this map." },
        { status: 400 }
      );
    }

    // Everything else is ours, not theirs. This used to collapse into the same
    // 400, which is how a missing table came back looking like a bad payload.
    console.error("[game-maker] create the set failed:", message);
    const missingTable = /does(n't| not) exist|P2021|1146/i.test(message);
    return NextResponse.json(
      {
        error: missingTable
          ? "The Game Maker tables are missing from this database — apply the schema (GmSets, GmSpawns, GmUtilities, GmModeProposals) and try again."
          : "Could not create the set.",
        detail: message.slice(0, 300),
      },
      { status: 500 }
    );
  }
}
