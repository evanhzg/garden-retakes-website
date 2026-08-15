import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH/DELETE one set. Everything an admin edits after creation goes through
// here — the user's requirement is that every option stays editable at any
// time, so nothing on a set is create-only.

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Only fields actually present in the body are touched, so a tab that edits
  // one toggle cannot blank the rest of the set.
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.Name = body.name.trim();
  if (body.site === "A" || body.site === "B" || body.site === null) data.Site = body.site;
  if (["early", "mid", "end"].includes(String(body.phase))) data.Phase = String(body.phase);
  if (body.phase === null) data.Phase = null;
  if (typeof body.phaseSeconds === "number") data.PhaseSeconds = Math.round(body.phaseSeconds);
  if (body.phaseSeconds === null) data.PhaseSeconds = null;
  if (Array.isArray(body.roles)) data.Roles = JSON.stringify(body.roles);
  if (Array.isArray(body.roundTypes)) data.RoundTypes = JSON.stringify(body.roundTypes);
  if (typeof body.votable === "boolean") data.Votable = body.votable;
  if (typeof body.weight === "number") data.Weight = Math.max(0, Math.round(body.weight));
  if (typeof body.active === "boolean") data.Active = body.active;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.gmSet.update({
      where: { Id: id },
      data,
      include: { Spawns: { orderBy: { Id: "asc" } }, Utilities: { orderBy: { Id: "asc" } } },
    });

    await logAdminAction(ctx, "gamemaker.set.update", undefined, `#${id} ${Object.keys(data).join(",")}`);
    return NextResponse.json({
      set: {
        ...updated,
        AddedBy: updated.AddedBy?.toString() ?? null,
        Roles: updated.Roles ? JSON.parse(updated.Roles) : [],
        RoundTypes: updated.RoundTypes ? JSON.parse(updated.RoundTypes) : [],
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not update the set." }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  try {
    // Spawns and utility cascade — see the relations in schema.prisma.
    const removed = await prisma.gmSet.delete({ where: { Id: id } });
    await logAdminAction(ctx, "gamemaker.set.delete", undefined, `${removed.Mode} ${removed.Map} "${removed.Name}"`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete the set." }, { status: 400 });
  }
}
