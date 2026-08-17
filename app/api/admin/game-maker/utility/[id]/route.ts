import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Editing an already-validated lineup. Everything stays editable — a lineup
// whose throw type was guessed by the migration is corrected here, and doing so
// is what clears its review flag.

function writeFailure(err: unknown, action: string) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[game-maker/utility] ${action} failed:`, message);
  const missingTable = /does(n't| not) exist|P2021|1146/i.test(message);
  return NextResponse.json(
    {
      error: missingTable
        ? "The utility tables are missing from this database."
        : `Could not ${action}.`,
      detail: message.slice(0, 300),
    },
    { status: 500 }
  );
}

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

  const data: Record<string, unknown> = {};
  const str = (key: string, column: string, max: number) => {
    if (typeof body[key] === "string") data[column] = (body[key] as string).slice(0, max);
  };

  str("name", "Name", 120);
  str("area", "Area", 64);
  str("utility", "Utility", 16);
  str("purpose", "Purpose", 16);
  str("team", "Team", 2);
  str("clickType", "ClickType", 8);
  str("notes", "Notes", 500);

  if (typeof body.throwType === "string") {
    data.ThrowType = body.throwType.slice(0, 16);
    // Setting the throw type by hand is precisely the act of reviewing it, so
    // the flag clears itself rather than needing a second click.
    data.NeedsReview = false;
  }
  if (typeof body.needsReview === "boolean") data.NeedsReview = body.needsReview;
  if (typeof body.needsShots === "boolean") data.NeedsShots = body.needsShots;

  for (const [key, column] of [["landX", "LandX"], ["landY", "LandY"], ["landZ", "LandZ"]] as const) {
    if (typeof body[key] === "number" && Number.isFinite(body[key] as number)) data[column] = body[key];
    if (body[key] === null) data[column] = null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.gardenNade.update({ where: { Id: id }, data });
    await logAdminAction(ctx, "utility.update", undefined, `#${id} ${Object.keys(data).join(",")}`);
    return NextResponse.json({
      lineup: { ...updated, AddedBySteamId: updated.AddedBySteamId?.toString() ?? null },
    });
  } catch (err) {
    return writeFailure(err, "update the lineup");
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
    const removed = await prisma.gardenNade.delete({ where: { Id: id } });
    await logAdminAction(ctx, "utility.delete", undefined, `${removed.Map} "${removed.Name}"`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return writeFailure(err, "delete the lineup");
  }
}
