import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The browser calls this once its PUT to R2 finished, flipping the row from
 * "uploading" to "pending" so the pipeline will pick it up.
 *
 * A row that never reaches this stays "uploading" and is simply never
 * collected — an abandoned upload costs a database row, not a pipeline run.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const row = await prisma.feedDemo.findUnique({ where: { Id: id } });
  if (!row) return NextResponse.json({ error: "no such upload" }, { status: 404 });
  if (row.SteamId.toString() !== session.steamId) {
    return NextResponse.json({ error: "not yours" }, { status: 403 });
  }
  if (row.Status !== "uploading") {
    return NextResponse.json({ ok: true, status: row.Status });
  }

  await prisma.feedDemo.update({ where: { Id: id }, data: { Status: "pending" } });
  return NextResponse.json({ ok: true, status: "pending" });
}
