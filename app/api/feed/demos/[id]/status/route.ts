import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The pipeline reports progress here: processing -> done | failed.
 *
 * On "done" the demo object is deleted from the bucket. That is the whole point
 * of the flow — a match demo is 100-300 MB and keeping them after the clips
 * exist would grow storage without bound. The row survives so the uploader can
 * still see what became of their submission.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const given = req.headers.get("x-api-key");
  const accepted = [process.env.ADMIN_KEY, process.env.INVSIM_API_KEY].filter(Boolean);
  if (!given || !accepted.includes(given)) {
    return NextResponse.json({ error: "bad key" }, { status: 403 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let body: { status?: string; note?: string; clipCount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const status = String(body.status ?? "");
  if (!["processing", "done", "failed"].includes(status)) {
    return NextResponse.json({ error: "status must be processing, done or failed" }, { status: 400 });
  }

  const row = await prisma.feedDemo.findUnique({ where: { Id: id } });
  if (!row) return NextResponse.json({ error: "no such demo" }, { status: 404 });

  let wiped = false;
  if (status === "done" && row.ObjectKey) {
    wiped = await deleteObject(row.ObjectKey);
  }

  await prisma.feedDemo.update({
    where: { Id: id },
    data: {
      Status: status,
      Note: typeof body.note === "string" ? body.note.slice(0, 500) : row.Note,
      ClipCount: Number.isInteger(body.clipCount) ? (body.clipCount as number) : row.ClipCount,
      // Re-stamped on every claim, including a re-claim of a stalled demo, so
      // "how long has this been running" is always measured from the attempt
      // that is actually running.
      ProcessingAt: status === "processing" ? new Date() : row.ProcessingAt,
      ProcessedAt: status === "processing" ? row.ProcessedAt : new Date(),
      // Clearing the key marks it wiped; a failed delete keeps it so the object
      // can be cleaned up later rather than being silently orphaned.
      ObjectKey: wiped ? null : row.ObjectKey,
    },
  });

  return NextResponse.json({ ok: true, status, demoWiped: wiped });
}
