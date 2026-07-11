import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { snapshotPreview, type LoadoutSnapshot } from "@/lib/share";

export const dynamic = "force-dynamic";
export const revalidate = 60;

// The curated "Featured" preset gallery — admin-published shared loadouts.
export async function GET() {
  const rows = await prisma.sharedLoadout.findMany({
    where: { Featured: true },
    orderBy: { CreatedAt: "desc" },
    take: 24,
  });

  const presets = rows.map((row) => {
    let preview = { images: [] as string[], count: 0 };
    try {
      preview = snapshotPreview(JSON.parse(row.Data) as LoadoutSnapshot);
    } catch {
      /* skip preview on corrupt data */
    }
    return {
      key: row.ShareKey,
      name: row.Name,
      ownerName: row.OwnerName,
      images: preview.images,
      count: preview.count,
    };
  });

  return NextResponse.json({ presets });
}
