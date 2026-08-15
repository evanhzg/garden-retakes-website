import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Utility attached to a set.
//
// Delivery is the interesting field: "thrown" replays a recorded lineup at
// round start (Executes), "grounded" starts the round with the smoke already
// down (Fast Strat, where the round opens mid-execute). Velocity only means
// anything for a thrown one.

const TYPES = ["smoke", "flash", "he", "molotov"];
const DELIVERY = ["thrown", "grounded"];

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
  if (typeof body.type !== "string" || !TYPES.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of ${TYPES.join(", ")}` }, { status: 400 });
  }

  const delivery = typeof body.delivery === "string" && DELIVERY.includes(body.delivery)
    ? body.delivery
    : "thrown";
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

  try {
    const created = await prisma.gmUtility.create({
      data: {
        SetId: setId,
        Type: body.type,
        Team: body.team === "CT" ? "CT" : "T",
        Delivery: delivery,
        X: num(body.x),
        Y: num(body.y),
        Z: num(body.z),
        // A grounded nade has no flight, so its velocity stays zero no matter
        // what the caller sent — storing one would imply a throw that never
        // happens and would confuse the plugin's replay.
        VelX: delivery === "thrown" ? num(body.velX) : 0,
        VelY: delivery === "thrown" ? num(body.velY) : 0,
        VelZ: delivery === "thrown" ? num(body.velZ) : 0,
        DelaySeconds: num(body.delaySeconds),
        Active: typeof body.active === "boolean" ? body.active : true,
      },
    });

    await logAdminAction(ctx, "gamemaker.utility.create", undefined, `set#${setId} ${body.type} ${delivery}`);
    return NextResponse.json({ utility: created });
  } catch {
    return NextResponse.json({ error: "Could not create the utility (does the set exist?)." }, { status: 400 });
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
  if (typeof body.type === "string" && TYPES.includes(body.type)) data.Type = body.type;
  if (body.team === "T" || body.team === "CT") data.Team = body.team;
  if (typeof body.delivery === "string" && DELIVERY.includes(body.delivery)) {
    data.Delivery = body.delivery;
    // Switching to grounded drops the stale lineup velocity with it.
    if (body.delivery === "grounded") {
      data.VelX = 0;
      data.VelY = 0;
      data.VelZ = 0;
    }
  }
  for (const key of ["x", "y", "z", "velX", "velY", "velZ", "delaySeconds"] as const) {
    if (typeof body[key] === "number") {
      data[key[0].toUpperCase() + key.slice(1)] = body[key];
    }
  }
  if (typeof body.active === "boolean") data.Active = body.active;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.gmUtility.update({ where: { Id: id }, data });
    await logAdminAction(ctx, "gamemaker.utility.update", undefined, `#${id}`);
    return NextResponse.json({ utility: updated });
  } catch {
    return NextResponse.json({ error: "Could not update the utility." }, { status: 400 });
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
    await prisma.gmUtility.delete({ where: { Id: id } });
    await logAdminAction(ctx, "gamemaker.utility.delete", undefined, `#${id}`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete the utility." }, { status: 400 });
  }
}
