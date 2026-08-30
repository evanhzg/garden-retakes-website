import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * An org's presentation image.
 *
 * Its own route rather than a field on the JSON, because it is bytes: putting a
 * base64 image in the org payload means every list of orgs carries every image
 * whether or not it is drawn, and the filter dropdown on the tournaments page
 * would pull a megabyte to render twelve names.
 *
 * Bytes in the database rather than a file, because there is no object storage
 * in this deployment — tournament banners already work this way.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return new NextResponse(null, { status: 400 });

  const org = await prisma.gardenOrg.findUnique({
    where: { Slug: slug },
    select: { ImageBytes: true, ImageMime: true },
  });

  if (!org?.ImageBytes || !org.ImageMime) return new NextResponse(null, { status: 404 });

  return new NextResponse(Buffer.from(org.ImageBytes), {
    headers: {
      "Content-Type": org.ImageMime,
      // Long, because the bytes at a slug only change when somebody uploads new
      // ones — and when they do the org page is not the kind of thing anybody
      // is watching for an instant update.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/** Upload. Admin-only, like everything else that edits an org. */
export async function POST(req: NextRequest) {
  const ctx = await getAdminContext(null);
  if (!(Boolean(ctx.viaKey) || ctx.level >= 2)) {
    return NextResponse.json({ error: "admins only" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  const orgId = Number(form?.get("orgId"));

  if (!(file instanceof File) || !Number.isFinite(orgId)) {
    return NextResponse.json({ error: "image and orgId required" }, { status: 400 });
  }

  // A cap, because this goes in a row and comes back out on a page. Two
  // megabytes is a generous banner and a poor way to store a video.
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "2 MB maximum" }, { status: 413 });
  }

  const mime = file.type;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(mime)) {
    return NextResponse.json({ error: "png, jpeg, webp or gif" }, { status: 415 });
  }

  await prisma.gardenOrg.update({
    where: { Id: orgId },
    data: {
      ImageBytes: Buffer.from(await file.arrayBuffer()),
      ImageMime: mime,
    },
  });

  return NextResponse.json({ ok: true });
}
