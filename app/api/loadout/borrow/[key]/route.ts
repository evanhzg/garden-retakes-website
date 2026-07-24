import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { LoadoutSnapshot } from "@/lib/share";

export const dynamic = "force-dynamic";

// Resolve a share key → its snapshot (for the website to preview/import).
export async function GET(_req: Request, { params }: { params: { key: string } }) {
  const key = params.key.trim().toLowerCase();
  if (!/^[a-z0-9]{4,16}$/.test(key)) {
    return NextResponse.json({ error: "invalid key" }, { status: 400 });
  }

  const row = await prisma.sharedLoadout.findUnique({ where: { ShareKey: key } });
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let snapshot: LoadoutSnapshot;
  try {
    snapshot = JSON.parse(row.Data) as LoadoutSnapshot;
  } catch {
    return NextResponse.json({ error: "corrupt snapshot" }, { status: 500 });
  }

  return NextResponse.json({
    key: row.ShareKey,
    name: row.Name,
    ownerName: row.OwnerName,
    featured: row.Featured,
    snapshot,
  });
}
