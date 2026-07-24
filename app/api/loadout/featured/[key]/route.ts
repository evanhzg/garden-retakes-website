import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminContext, AdminLevel } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/loadout/featured/[key]
 * Admin-only: remove a featured loadout by its share key.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { key: string } }
) {
  const ctx = await getAdminContext();
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await prisma.sharedLoadout.findUnique({
    where: { ShareKey: params.key },
  });

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.sharedLoadout.update({
    where: { ShareKey: params.key },
    data: { Featured: false },
  });

  return NextResponse.json({ ok: true });
}
