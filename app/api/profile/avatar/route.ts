import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AVATAR_DIR, CUSTOM_AVATAR_PREFIX } from "@/lib/avatars";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cropped avatar upload from the profile settings modal.
//
// The cropping happens in the browser (canvas → square PNG), so what arrives
// here is already the final image: this only has to check it is a plausible
// PNG of a sane size, store it, and point GardenWebProfile.AvatarUrl at it.
//
// Stored under data/ and served back by the sibling [steamId] route rather than
// written into public/ — Next serves public/ from a build-time manifest, so a
// file written there at runtime 404s until the next deploy.

/** 1 MB of 256×256 PNG is already generous; the cropper emits far less. */
const MAX_BYTES = 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected a multipart upload" }, { status: 400 });
  }

  const file = form.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no image provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "image too large (1 MB max)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not the declared type — a content-type header is free to
  // lie and this file is served back to every visitor.
  if (!buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    return NextResponse.json({ error: "the cropper must send a PNG" }, { status: 400 });
  }

  await fs.mkdir(AVATAR_DIR, { recursive: true });
  await fs.writeFile(path.join(AVATAR_DIR, `${session.steamId}.png`), buffer);

  // The query string busts any cached copy of the previous avatar.
  const url = `${CUSTOM_AVATAR_PREFIX}${session.steamId}?v=${Date.now()}`;
  const steamId = BigInt(session.steamId);
  await prisma.gardenWebProfile.upsert({
    where: { SteamId: steamId },
    update: { AvatarUrl: url },
    create: { SteamId: steamId, AvatarUrl: url },
  });

  return NextResponse.json({ ok: true, url });
}

/** Drop the custom avatar and fall back to Steam's. */
export async function DELETE() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  await fs.rm(path.join(AVATAR_DIR, `${session.steamId}.png`), { force: true });
  const steamId = BigInt(session.steamId);
  await prisma.gardenWebProfile
    .update({ where: { SteamId: steamId }, data: { AvatarUrl: null } })
    .catch(() => {
      // No profile row means there was nothing to clear.
    });

  return NextResponse.json({ ok: true });
}
