import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A failed write is not a bad request.
 *
 * These handlers used to catch everything into a flat 400, which is what a
 * missing table looked like from the browser: the caller was told its own
 * payload was wrong when the actual problem was that the schema had never been
 * applied to the database. Server-side failures get a 500 and the real reason.
 */
function writeFailure(err: unknown, action: string) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[game-maker] ${action} failed:`, message);

  const missingTable = /does(n't| not) exist|P2021|1146/i.test(message);
  return NextResponse.json(
    {
      error: missingTable
        ? "The Game Maker tables are missing from this database — apply the schema (GmSets, GmSpawns, GmUtilities, GmModeProposals) and try again."
        : `Could not ${action}.`,
      detail: message.slice(0, 300),
    },
    { status: 500 }
  );
}


// Spawns inside a set. Created either from the website (typed coordinates, or
// a named placeholder an admin positions in game later) or by the plugin's
// Maker mode posting the admin's own feet.

const SIDES = ["T", "CT"];

export async function POST(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const setId = Number(body.setId);
  if (!Number.isFinite(setId)) return NextResponse.json({ error: "bad setId" }, { status: 400 });
  if (typeof body.side !== "string" || !SIDES.includes(body.side)) {
    return NextResponse.json({ error: "side must be T or CT" }, { status: 400 });
  }

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

  try {
    const created = await prisma.gmSpawn.create({
      data: {
        SetId: setId,
        Side: body.side,
        Type: typeof body.type === "string" ? body.type.slice(0, 32) : "",
        Label: typeof body.label === "string" ? body.label.slice(0, 48) : "",
        X: num(body.x),
        Y: num(body.y),
        Z: num(body.z),
        Pitch: num(body.pitch),
        Yaw: num(body.yaw),
        Pairing: typeof body.pairing === "number" ? Math.round(body.pairing) : null,
        CanPlant: typeof body.canPlant === "boolean" ? body.canPlant : false,
        Active: typeof body.active === "boolean" ? body.active : true,
      },
    });

    await logAdminAction(ctx, "gamemaker.spawn.create", undefined, `set#${setId} ${body.side} ${created.Label}`);
    return NextResponse.json({ spawn: created });
  } catch (err) {
    return writeFailure(err, "create the spawn");
  }
}

export async function PATCH(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.side === "string" && SIDES.includes(body.side)) data.Side = body.side;
  if (typeof body.type === "string") data.Type = body.type.slice(0, 32);
  if (typeof body.label === "string") data.Label = body.label.slice(0, 48);
  for (const key of ["x", "y", "z", "pitch", "yaw"] as const) {
    if (typeof body[key] === "number") data[key[0].toUpperCase() + key.slice(1)] = body[key];
  }
  if (typeof body.pairing === "number") data.Pairing = Math.round(body.pairing);
  if (body.pairing === null) data.Pairing = null;
  if (typeof body.canPlant === "boolean") data.CanPlant = body.canPlant;
  if (typeof body.active === "boolean") data.Active = body.active;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.gmSpawn.update({ where: { Id: id }, data });
    await logAdminAction(ctx, "gamemaker.spawn.update", undefined, `#${id}`);
    return NextResponse.json({ spawn: updated });
  } catch (err) {
    return writeFailure(err, "update the spawn");
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  try {
    await prisma.gmSpawn.delete({ where: { Id: id } });
    await logAdminAction(ctx, "gamemaker.spawn.delete", undefined, `#${id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return writeFailure(err, "delete the spawn");
  }
}
