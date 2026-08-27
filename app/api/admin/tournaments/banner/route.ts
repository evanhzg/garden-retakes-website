import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The tournament card image.
//
// Stored in the database rather than on disk. There is no object storage
// configured for this project, and the one existing upload path — profile
// avatars — writes under process.cwd()/data, which on Vercel is a filesystem
// scoped to a single invocation: those files do not survive a redeploy and very
// likely do not survive the next request. A banner that silently disappears a
// week before the event is worse than no banner.
//
// The cropping happens in the browser, so what arrives here is already the
// final image. This only has to check it is a plausible picture of a sane size.

/** 600 KB. A 1200×400 JPEG lands nowhere near this; a phone photo would. */
const MAX_BYTES = 600 * 1024;

/** Magic bytes, because a Content-Type header is whatever the client says. */
const SIGNATURES: { mime: string; magic: number[] }[] = [
  { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] },
];

/** RIFF....WEBP — the format tag sits at byte 8, not at the start. */
function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

function sniff(buffer: Buffer): string | null {
  for (const { mime, magic } of SIGNATURES) {
    if (buffer.length < magic.length) continue;
    if (magic.every((byte, i) => buffer[i] === byte)) return mime;
  }
  return isWebp(buffer) ? "image/webp" : null;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const ctx = await getTournamentContext(url.searchParams.get("key"));

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a form upload." }, { status: 400 });
  }

  const tournamentId = Number(form.get("tournamentId"));
  if (!Number.isInteger(tournamentId)) {
    return NextResponse.json({ error: "tournamentId?" }, { status: 400 });
  }

  if (!(await canManage(ctx, tournamentId))) {
    return NextResponse.json({ error: "Not your tournament." }, { status: 403 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No file." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Too large — the limit is ${Math.round(MAX_BYTES / 1024)} KB.` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniff(buffer);
  if (!mime) {
    return NextResponse.json({ error: "That is not an image." }, { status: 415 });
  }

  await prisma.tournament.update({
    where: { Id: tournamentId },
    data: { BannerImage: buffer, BannerMime: mime },
  });

  return NextResponse.json({ ok: true, bytes: buffer.length, mime });
}

// Removing a banner is its own verb rather than an upload of nothing.
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const ctx = await getTournamentContext(url.searchParams.get("key"));

  const tournamentId = Number(url.searchParams.get("tournamentId"));
  if (!Number.isInteger(tournamentId)) {
    return NextResponse.json({ error: "tournamentId?" }, { status: 400 });
  }

  if (!(await canManage(ctx, tournamentId))) {
    return NextResponse.json({ error: "Not your tournament." }, { status: 403 });
  }

  await prisma.tournament.update({
    where: { Id: tournamentId },
    data: { BannerImage: null, BannerMime: null },
  });

  return NextResponse.json({ ok: true });
}
