import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// W2: the logged-in player edits their own website profile — display-name
// override (propagates to the in-game ladder via GardenNameOverrides) plus a
// website-only avatar/bio/country card (GardenWebProfiles).

const NAME_MAX = 32; // keep in-game scoreboard-friendly (table allows 64)
const BIO_MAX = 280;

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > NAME_MAX) return null;
  return name;
}

function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const steamId = BigInt(session.steamId);
  const [override, profile] = await Promise.all([
    prisma.gardenNameOverride.findUnique({ where: { SteamId: steamId } }),
    prisma.gardenWebProfile.findUnique({ where: { SteamId: steamId } }),
  ]);

  return NextResponse.json({
    steamId: session.steamId,
    steamName: session.name ?? null,
    steamAvatar: session.avatar ?? null,
    nameOverride: override?.Name ?? null,
    avatarUrl: profile?.AvatarUrl ?? null,
    bio: profile?.Bio ?? null,
    country: profile?.Country ?? null,
    popConfig: profile?.PopConfig ?? null,
  });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const steamId = BigInt(session.steamId);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // --- Display-name override (or revert to the Steam name) ---
  if (body.revertName === true) {
    await prisma.gardenNameOverride.deleteMany({ where: { SteamId: steamId } });
  } else if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) {
      return NextResponse.json(
        { error: `Name must be 2–${NAME_MAX} characters.` },
        { status: 400 }
      );
    }
    await prisma.gardenNameOverride.upsert({
      where: { SteamId: steamId },
      create: { SteamId: steamId, Name: name },
      update: { Name: name },
    });
  }

  // --- Website profile card ---
  const bioRaw = typeof body.bio === "string" ? body.bio.trim().slice(0, BIO_MAX) : null;
  const countryRaw =
    typeof body.country === "string" && /^[A-Za-z]{2}$/.test(body.country.trim())
      ? body.country.trim().toUpperCase()
      : null;
  const avatarUrl = cleanUrl(body.avatarUrl);

  if (body.avatarUrl !== undefined && body.avatarUrl !== "" && avatarUrl === null) {
    return NextResponse.json({ error: "Avatar must be an https:// URL." }, { status: 400 });
  }

  const popConfigRaw = typeof body.popConfig === "string" ? body.popConfig.trim().slice(0, 512) : undefined;

  await prisma.gardenWebProfile.upsert({
    where: { SteamId: steamId },
    create: {
      SteamId: steamId,
      AvatarUrl: avatarUrl,
      Bio: bioRaw,
      Country: countryRaw,
      ...(popConfigRaw !== undefined && { PopConfig: popConfigRaw }),
    },
    update: {
      AvatarUrl: avatarUrl,
      Bio: bioRaw,
      Country: countryRaw,
      ...(popConfigRaw !== undefined && { PopConfig: popConfigRaw }),
    },
  });

  return NextResponse.json({ ok: true });
}
