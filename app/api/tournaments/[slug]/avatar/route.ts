import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A tournament's square avatar — the one the social rail draws.
 *
 * Its own route rather than a field on the JSON, for the reason
 * /api/orgs/image already states: bytes in a list payload means every list
 * carries every image whether or not it is drawn. The rail lists a dozen
 * tournaments and draws a dozen thirty-pixel circles; as base64 in the list
 * that is a megabyte to render twelve names.
 *
 * Public to GET. A tournament's picture is on its own page already, and an
 * avatar nobody may fetch is an avatar nobody can see.
 */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const row = await prisma.tournament.findUnique({
    where: { Slug: params.slug },
    select: { AvatarBytes: true, AvatarMime: true },
  });

  if (!row?.AvatarBytes || !row.AvatarMime) return new NextResponse(null, { status: 404 });

  return new NextResponse(Buffer.from(row.AvatarBytes), {
    headers: {
      "Content-Type": row.AvatarMime,
      // An hour. The bytes at a slug change only when somebody uploads new
      // ones, and a stale avatar for an hour is a much smaller problem than
      // re-fetching every one of them on every page.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/** Upload. Whoever may manage the tournament, which is not the same as an admin. */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const tournament = await prisma.tournament.findUnique({
    where: { Slug: params.slug },
    select: { Id: true },
  });

  if (!tournament) return NextResponse.json({ error: "No such tournament." }, { status: 404 });

  const ctx = await getTournamentContext();
  if (!(await canManage(ctx, tournament.Id))) {
    return NextResponse.json({ error: "Organizers only." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image required" }, { status: 400 });
  }

  // The same cap and whitelist as the org image, and for the same reasons: it
  // goes in a row and comes back out on a page, and "image/*" includes svg,
  // which is a script.
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "2 MB maximum" }, { status: 413 });
  }

  const mime = file.type;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(mime)) {
    return NextResponse.json({ error: "png, jpeg, webp or gif" }, { status: 415 });
  }

  await prisma.tournament.update({
    where: { Id: tournament.Id },
    data: {
      AvatarBytes: Buffer.from(await file.arrayBuffer()),
      AvatarMime: mime,
    },
  });

  return NextResponse.json({ ok: true });
}
