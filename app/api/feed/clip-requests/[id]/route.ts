import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH /api/feed/clip-requests/<id> — the pipeline reporting progress.
//
// Key-only: this is the local run talking, not a browser.

function keyMatches(req: Request): boolean {
  const given = req.headers.get("x-api-key");
  const accepted = [process.env.ADMIN_KEY, process.env.INVSIM_API_KEY].filter(Boolean);
  return Boolean(given && accepted.includes(given));
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!keyMatches(req)) return NextResponse.json({ error: "bad key" }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let body: { status?: string; note?: string; clipId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const status = String(body.status ?? "");
  if (!["pending", "processing", "done", "failed"].includes(status)) {
    return NextResponse.json({ error: "bad status" }, { status: 400 });
  }

  await prisma.gardenClipRequest.update({
    where: { Id: id },
    data: {
      Status: status,
      Note: body.note?.slice(0, 500) ?? null,
      ClipId: Number.isInteger(body.clipId) ? body.clipId : undefined,
      ProcessedAt: status === "done" || status === "failed" ? new Date() : undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
