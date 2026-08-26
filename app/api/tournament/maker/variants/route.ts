import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Where the plugin reports what an admin just placed or shot.
//
// Called after every keypress in a Maker session, so it has to be cheap and it
// has to be safe to call twice: the plugin sends the whole variant list rather
// than a diff, which means this replaces rather than appends. A dropped message
// then costs nothing — the next placement repairs the view — and no ordering or
// retry logic is needed to make that true.
//
// Authenticated with the shared key, like every other server-to-server route
// here. Not the bearer-steamid convention, which is client-asserted.

type IncomingVariant = {
  setpos: string;
  viewpos: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
};

type Incoming = {
  apiKey?: string;
  webId?: string;
  map?: string;
  name?: string;
  role?: string;
  bombsite?: number;
  team?: number;
  variants?: IncomingVariant[];
};

const isFinitePoint = (v: IncomingVariant) =>
  [v.x, v.y, v.z, v.yaw].every((n) => typeof n === "number" && Number.isFinite(n));

export async function POST(req: Request) {
  let body: Incoming;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const key = process.env.INVSIM_API_KEY;
  if (!key || body.apiKey !== key) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const map = (body.map ?? "").trim();
  const name = (body.name ?? "").trim();
  const role = (body.role ?? "").trim();

  if (!map || !name || !role) {
    return NextResponse.json({ error: "map, name and role are required." }, { status: 400 });
  }

  const bombsite = body.bombsite === 1 ? 1 : 0;
  const team = body.team === 2 ? 2 : 3;

  // Anything non-finite would render as NaN on the page and paste into a console
  // as a command that silently does nothing.
  const variants = (body.variants ?? []).filter(isFinitePoint);

  const spawn = await prisma.tournamentSpawn.upsert({
    where: { Map_Bombsite_Team_Name_RoleId: { Map: map, Bombsite: bombsite, Team: team, Name: name, RoleId: role } },
    create: { Map: map, Name: name, RoleId: role, Bombsite: bombsite, Team: team },
    update: { RoleId: role },
  });

  // Replace wholesale, inside a transaction, so a page reading mid-write never
  // sees a spawn with no variants at all.
  await prisma.$transaction([
    prisma.tournamentSpawnVariant.deleteMany({ where: { SpawnId: spawn.Id } }),
    prisma.tournamentSpawnVariant.createMany({
      data: variants.map((v) => ({
        SpawnId: spawn.Id,
        X: v.x,
        Y: v.y,
        Z: v.z,
        Yaw: v.yaw,
        SetPos: (v.setpos ?? "").slice(0, 96),
        ViewPos: (v.viewpos ?? "").slice(0, 96),
      })),
    }),
  ]);

  return NextResponse.json({ ok: true, spawnId: spawn.Id, variants: variants.length });
}
