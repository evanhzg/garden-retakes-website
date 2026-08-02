import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Registration endpoint for the local highlight pipeline
// (~/projects/garden-highlights → scripts/publish.mjs).
//
// The pipeline uploads renditions to R2 and then tells the site what exists,
// rather than the site listing the bucket: the bucket is a CDN origin, not a
// database, and listing it on every feed request would be both slow and unable
// to carry a title or an author.
//
// Authenticated with the shared key rather than a session — this runs from a
// shell script, not a browser.

type Variant = { name: string; height: number; url: string };
type Incoming = {
  id: string;
  title: string;
  description?: string | null;
  steamId?: string | null;
  thumb?: string | null;
  durationSec?: number | null;
  variants: Variant[];
};

const isHttps = (u: string) => {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
};

export async function POST(req: Request) {
  // Accept EITHER shared secret.
  //
  // This first read `INVSIM_API_KEY || ADMIN_KEY` while lib/adminAuth reads
  // `ADMIN_KEY || INVSIM_API_KEY` — the opposite precedence. Locally ADMIN_KEY
  // is empty so both collapse to the same value and it passed every test; in
  // production both are set to different values, so the two disagreed and a
  // perfectly valid admin key was rejected here.
  //
  // Matching either is right for this endpoint regardless: it only creates feed
  // clips, so it does not need the narrower single-key semantics the admin
  // pages use.
  const given = req.headers.get("x-api-key");
  const accepted = [process.env.ADMIN_KEY, process.env.INVSIM_API_KEY].filter(Boolean);
  if (!given || !accepted.includes(given)) {
    return NextResponse.json({ error: "bad key" }, { status: 403 });
  }

  let body: { clips?: Incoming[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const clips = body.clips ?? [];
  if (!Array.isArray(clips) || clips.length === 0) {
    return NextResponse.json({ error: "no clips" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const c of clips) {
    const variants = (c.variants ?? []).filter((v) => v?.url && isHttps(v.url));
    if (!c.id || !c.title || variants.length === 0) {
      skipped.push(c.id ?? "(no id)");
      continue;
    }
    // Highest quality first, so a player with no stored preference opens on it.
    variants.sort((a, b) => b.height - a.height);

    const steamId = c.steamId && /^\d{17}$/.test(c.steamId) ? BigInt(c.steamId) : BigInt(0);
    const data = {
      SteamId: steamId,
      Title: c.title.slice(0, 140),
      Description: c.description?.slice(0, 500) ?? null,
      Kind: "r2",
      // Source is the primary URL, so anything that only understands one URL
      // still has a playable file.
      Source: variants[0].url.slice(0, 255),
      Thumb: c.thumb && isHttps(c.thumb) ? c.thumb.slice(0, 255) : null,
      DurationSec: c.durationSec ?? null,
      Variants: JSON.stringify(variants),
    };

    const existing = await prisma.feedClip.findUnique({ where: { ExternalId: c.id } });
    if (existing) {
      await prisma.feedClip.update({ where: { ExternalId: c.id }, data });
      updated += 1;
    } else {
      await prisma.feedClip.create({ data: { ...data, ExternalId: c.id } });
      created += 1;
    }
  }

  return NextResponse.json({ ok: true, created, updated, skipped });
}
