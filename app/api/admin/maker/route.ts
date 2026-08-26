import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminContext, logAdminAction } from "@/lib/adminAuth";
import { AdminLevel } from "@/lib/adminImmunity";
import { makerExec, NoMakerServerError } from "@/lib/tournament/makerServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The website half of SELECT IN-GAME and GENERATE.
//
// The plugin never decides what is being authored — the name, the role and the
// side belong here — so these routes are a handoff. They also cannot be driven
// from in game, deliberately: an admin standing in a map should not be able to
// invent a spawn that the page knows nothing about.

/** Roles the plugin will accept, per side. Kept here so a bad pick is refused
 *  before it becomes an RCON command that fails silently on the server. */
const CT_ROLES = ["roamer", "frontrunner", "awper", "backup"] as const;
const T_ROLES = ["planter", "sniper", "rifler"] as const;

type Body = {
  key?: string;
  action?: "start" | "generate" | "end";
  spawnId?: number;
  /** Creating and starting in one step, which is how the page uses it. */
  map?: string;
  name?: string;
  role?: string;
  bombsite?: number;
  team?: number;
  canBePlanter?: boolean;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const ctx = await getAdminContext(body.key);
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  // Every branch below talks to the game server, and the one failure that is
  // not the plugin's fault is having no server to talk to. Answered as a
  // sentence the admin can act on rather than a 500 that sends them to the
  // plugin logs — which is where this exact fault sent somebody already.
  try {
    return await handle(body, ctx);
  } catch (err) {
    if (err instanceof NoMakerServerError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}

async function handle(
  body: Body,
  ctx: Awaited<ReturnType<typeof getAdminContext>>,
): Promise<NextResponse> {
  if (body.action === "end") {
    await makerExec("css_t_maker_end");
    await prisma.tournamentMakerSession.updateMany({
      where: { EndedAt: null },
      data: { EndedAt: new Date() },
    });
    await logAdminAction(ctx, "maker.end");
    return NextResponse.json({ ok: true });
  }

  if (body.action === "generate") {
    const reply = await makerExec("css_t_maker_generate");

    // The plugin answers with a line rather than an error code, so a refusal
    // arrives looking like a success unless it is read. The ladder learned this
    // the hard way with css_cr_go.
    const ok = /generated/i.test(reply);

    if (ok) {
      await prisma.tournamentMakerSession.updateMany({
        where: { EndedAt: null },
        data: { EndedAt: new Date() },
      });
    }

    await logAdminAction(ctx, "maker.generate", undefined, reply.slice(0, 250));
    return NextResponse.json({ ok, reply });
  }

  // Anything else is a start.
  const map = (body.map ?? "").trim();
  const name = (body.name ?? "").trim();
  const role = (body.role ?? "").trim();
  const bombsite = body.bombsite === 1 ? 1 : 0;
  const team = body.team === 2 ? 2 : 3;

  if (!map || !name) {
    return NextResponse.json({ error: "A map and a name are required." }, { status: 400 });
  }

  const legal: readonly string[] = team === 2 ? T_ROLES : CT_ROLES;
  if (!legal.includes(role)) {
    return NextResponse.json(
      { error: `'${role}' is not a ${team === 2 ? "T" : "CT"} role. Try: ${legal.join(", ")}` },
      { status: 400 },
    );
  }

  if (!ctx.steamId) {
    // The key-only path has no player behind it, and Maker mode needs somebody
    // standing in the map.
    return NextResponse.json(
      { error: "Sign in with Steam to author spawns — the server needs to know who is placing them." },
      { status: 400 },
    );
  }

  const spawn = await prisma.tournamentSpawn.upsert({
    where: { Map_Bombsite_Team_Name_RoleId: { Map: map, Bombsite: bombsite, Team: team, Name: name, RoleId: role } },
    create: {
      Map: map,
      Name: name,
      RoleId: role,
      Bombsite: bombsite,
      Team: team,
      CanBePlanter: Boolean(body.canBePlanter),
      CreatedBy: BigInt(ctx.steamId),
    },
    // RoleId is part of the key now, so it is never the thing being changed:
    // a different role under the same name is a different spawn, which is the
    // whole point of the key including it.
    update: { CanBePlanter: Boolean(body.canBePlanter) },
  });

  // The name goes last because it is the only argument that can contain spaces.
  const command = [
    "css_t_maker",
    ctx.steamId,
    bombsite === 0 ? "A" : "B",
    team === 2 ? "T" : "CT",
    role,
    body.canBePlanter ? "planter" : "-",
    String(spawn.Id),
    name,
  ].join(" ");

  const reply = await makerExec(command);
  const started = /maker started/i.test(reply);

  if (started) {
    await prisma.tournamentMakerSession.updateMany({
      where: { EndedAt: null },
      data: { EndedAt: new Date() },
    });

    await prisma.tournamentMakerSession.create({
      data: { SpawnId: spawn.Id, SteamId: BigInt(ctx.steamId), Map: map },
    });
  }

  await logAdminAction(ctx, "maker.start", undefined, `${map} ${name}`.slice(0, 250));

  return NextResponse.json({ ok: started, reply, spawnId: spawn.Id });
}
