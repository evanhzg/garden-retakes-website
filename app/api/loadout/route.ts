import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  DEFAULT_UTILITY,
  decodeWeaponPrefs,
  encodeWeaponPrefs,
  isRole,
  sanitiseUtilityPrefs,
  sanitiseWeaponPrefs,
} from "@/lib/retakeLoadout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET/PUT the signed-in player's competitive retakes loadout.
//
// Two stores behind one endpoint: weapons go to UserSettings, which the
// allocator plugin reads every buy round, and role/utility go to a table only
// the website reads. Splitting that across two requests would let a save
// half-apply, and the page would have no honest way to report it.

async function read(steamId: bigint) {
  const [settings, loadout] = await Promise.all([
    prisma.userSettings.findUnique({ where: { UserId: steamId } }),
    prisma.gardenRetakeLoadout.findUnique({ where: { SteamId: steamId } }),
  ]);

  return {
    weapons: decodeWeaponPrefs(settings?.WeaponPreferences),
    roleT: loadout?.RoleT ?? "",
    roleCt: loadout?.RoleCt ?? "",
    utility: loadout?.UtilityPrefs ? sanitiseUtilityPrefs(JSON.parse(loadout.UtilityPrefs)) : DEFAULT_UTILITY,
    notes: loadout?.Notes ?? "",
    updatedAt: loadout?.UpdatedAt ?? null,
  };
}

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("steamId");

  // Someone else's loadout is readable — the point of declaring a role is that
  // your team can see it — but only your own is writable.
  const target = /^\d{5,20}$/.test(asked ?? "") ? asked! : getSession()?.steamId;
  if (!target) return NextResponse.json({ error: "Sign in to see your loadout." }, { status: 401 });

  try {
    return NextResponse.json({ steamId: target, ...(await read(BigInt(target))) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the loadout." },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in to save your loadout." }, { status: 401 });
  const steamId = BigInt(session.steamId);

  let body: { weapons?: unknown; roleT?: unknown; roleCt?: unknown; utility?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const weapons = sanitiseWeaponPrefs(body.weapons);
  const utility = sanitiseUtilityPrefs(body.utility);
  const roleT = typeof body.roleT === "string" && (body.roleT === "" || isRole(body.roleT)) ? body.roleT : "";
  const roleCt = typeof body.roleCt === "string" && (body.roleCt === "" || isRole(body.roleCt)) ? body.roleCt : "";
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 300) : "";

  try {
    // Read-modify-write on the plugin's blob rather than replacing it: it also
    // holds the AWP `Preferred` slot, which this page does not offer and must
    // not erase.
    const existing = await prisma.userSettings.findUnique({ where: { UserId: steamId } });
    const encoded = encodeWeaponPrefs(weapons, existing?.WeaponPreferences);

    await prisma.$transaction([
      prisma.userSettings.upsert({
        where: { UserId: steamId },
        create: { UserId: steamId, WeaponPreferences: encoded },
        update: { WeaponPreferences: encoded },
      }),
      prisma.gardenRetakeLoadout.upsert({
        where: { SteamId: steamId },
        create: {
          SteamId: steamId,
          RoleT: roleT,
          RoleCt: roleCt,
          UtilityPrefs: JSON.stringify(utility),
          Notes: notes,
        },
        update: {
          RoleT: roleT,
          RoleCt: roleCt,
          UtilityPrefs: JSON.stringify(utility),
          Notes: notes,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, ...(await read(steamId)) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the loadout." },
      { status: 500 }
    );
  }
}
