import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { MAX_EXCLUDED_MAPS, RETAKES_MAPS, sanitiseExcludedMaps } from "@/lib/maps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET/PUT the maps a player never wants to be sent to.
//
// Kept out of /api/loadout on purpose. That route saves a loadout as one
// transaction across three tables, and a map preference has nothing to do with
// what you are handed when you spawn — bundling them would mean changing your
// mind about Nuke could fail because a weapon write did.
//
// A preference and not a veto: the matchmaker pairs two parties only when what
// both captains allow still leaves enough maps to run a veto on, and widens
// what counts as enough the longer they have waited. See requiredPoolSize in
// scripts/retakesMatchmaking.js.

async function read(steamId: bigint) {
  const row = await prisma.gardenMapPreference.findUnique({ where: { SteamId: steamId } });

  let excluded: unknown = [];
  if (row?.Excluded) {
    try {
      excluded = JSON.parse(row.Excluded);
    } catch {
      // An unreadable row excludes nothing, rather than being a broken page.
    }
  }

  return {
    pool: [...RETAKES_MAPS],
    excluded: sanitiseExcludedMaps(excluded),
    max: MAX_EXCLUDED_MAPS,
    updatedAt: row?.UpdatedAt ?? null,
  };
}

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("steamId");
  const target = /^\d{5,20}$/.test(asked ?? "") ? asked! : getSession()?.steamId;
  if (!target) {
    return NextResponse.json({ error: "Sign in to see your map preferences." }, { status: 401 });
  }

  try {
    return NextResponse.json({ steamId: target, ...(await read(BigInt(target))) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the map preferences." },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to save your map preferences." }, { status: 401 });
  }
  const steamId = BigInt(session.steamId);

  let body: { excluded?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Refused rather than trimmed. Silently dropping the fifth map would leave
  // the page showing a choice the server did not keep, and the next reload is
  // where you would find out.
  if (Array.isArray(body.excluded) && body.excluded.length > MAX_EXCLUDED_MAPS) {
    return NextResponse.json(
      { error: "too_many", max: MAX_EXCLUDED_MAPS },
      { status: 400 }
    );
  }

  const excluded = sanitiseExcludedMaps(body.excluded);
  const Excluded = JSON.stringify(excluded);

  try {
    await prisma.gardenMapPreference.upsert({
      where: { SteamId: steamId },
      create: { SteamId: steamId, Excluded },
      update: { Excluded },
    });
    return NextResponse.json({ ok: true, ...(await read(steamId)) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the map preferences." },
      { status: 500 }
    );
  }
}
