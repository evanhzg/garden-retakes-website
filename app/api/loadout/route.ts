import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  DEFAULT_SIDED_UTILITY,
  decodeWeaponPrefs,
  deriveFromBundles,
  encodeWeaponPrefs,
  isRole,
  sanitiseBundleSelection,
  sanitiseUtilityPrefs,
  sanitiseWeaponPrefs,
  selectionComplete,
} from "@/lib/retakeLoadout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET/PUT the signed-in player's competitive retakes loadout.
//
// Three stores behind one endpoint: weapons go to UserSettings, which the
// allocator plugin reads every buy round; the bundle choice and everything
// derived from it go to a table the website owns; and the "has been through the
// picker" flag goes to the onboarding table, because the queue is gated on it.
// Splitting that across three requests would let a save half-apply, and the
// page would have no honest way to report it.
//
// The bundle selection is the source of truth. Armour, grenades, the kit and
// the gun are all read out of it by deriveFromBundles rather than sent
// separately — one place decides what "Rifle + Kit" means, so the page and the
// server cannot come to different answers.

async function read(steamId: bigint) {
  const [settings, loadout, onboarding] = await Promise.all([
    prisma.userSettings.findUnique({ where: { UserId: steamId } }),
    prisma.gardenRetakeLoadout.findUnique({ where: { SteamId: steamId } }),
    prisma.gardenOnboardingState.findUnique({ where: { SteamId: steamId } }),
  ]);

  let bundles = {};
  if (loadout?.Bundles) {
    try {
      bundles = sanitiseBundleSelection(JSON.parse(loadout.Bundles));
    } catch {
      // An unreadable column is an unset loadout, not a broken page.
    }
  }

  return {
    bundles,
    complete: onboarding?.CompletedRetakeSetup ?? false,
    weapons: decodeWeaponPrefs(settings?.WeaponPreferences),
    roleT: loadout?.RoleT ?? "",
    roleCt: loadout?.RoleCt ?? "",
    isCaller: loadout?.IsCaller ?? false,
    utility: loadout?.UtilityPrefs
      ? sanitiseUtilityPrefs(JSON.parse(loadout.UtilityPrefs))
      : DEFAULT_SIDED_UTILITY,
    notes: loadout?.Notes ?? "",
    kevlar: {
      T: {
        pistol: loadout?.KevlarPistolT ?? false,
        half: loadout?.KevlarForceT ?? false,
        full: loadout?.KevlarFullT ?? false,
      },
      CT: {
        pistol: loadout?.KevlarPistolCt ?? false,
        half: loadout?.KevlarForceCt ?? false,
        full: loadout?.KevlarFullCt ?? false,
      },
    },
    kit: {
      pistol: false,
      half: loadout?.KitForceCt ?? false,
      full: loadout?.KitFullCt ?? false,
    },
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

  let body: {
    bundles?: unknown;
    weapons?: unknown;
    roleT?: unknown;
    roleCt?: unknown;
    isCaller?: unknown;
    notes?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const bundles = sanitiseBundleSelection(body.bundles);
  const derived = deriveFromBundles(bundles);

  // The "other weapons" drawer picks a gun outside any bundle. It layers over
  // what the bundle asked for rather than replacing the bundle: the armour and
  // grenades of "Rifle + full util" still apply when you swap the rifle for an
  // AUG, which is what swapping one gun is supposed to mean.
  const overrides = sanitiseWeaponPrefs(body.weapons);
  const weapons = { ...derived.weapons };
  for (const side of ["T", "CT"] as const) {
    if (!overrides[side]) continue;
    weapons[side] = { ...(weapons[side] ?? {}), ...overrides[side] };
  }

  const roleT = typeof body.roleT === "string" && (body.roleT === "" || isRole(body.roleT)) ? body.roleT : "";
  const roleCt = typeof body.roleCt === "string" && (body.roleCt === "" || isRole(body.roleCt)) ? body.roleCt : "";
  const isCaller = typeof body.isCaller === "boolean" ? body.isCaller : false;
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 300) : "";

  // Every round type answered on both sides is what the queue gate waits for.
  // Set here rather than by the page, so it can only become true by a save that
  // actually carried a full selection.
  const complete = selectionComplete(bundles);

  const loadoutFields = {
    RoleT: roleT,
    RoleCt: roleCt,
    IsCaller: isCaller,
    UtilityPrefs: JSON.stringify(derived.utility),
    Notes: notes,
    Bundles: JSON.stringify(bundles),
    KevlarPistolT: derived.kevlar.T.pistol,
    KevlarPistolCt: derived.kevlar.CT.pistol,
    KevlarForceT: derived.kevlar.T.half,
    KevlarForceCt: derived.kevlar.CT.half,
    KevlarFullT: derived.kevlar.T.full,
    KevlarFullCt: derived.kevlar.CT.full,
    KitForceCt: derived.kit.half,
    KitFullCt: derived.kit.full,
  };

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
        create: { SteamId: steamId, ...loadoutFields },
        update: loadoutFields,
      }),
      // Only ever set true here, never cleared: a player who has been through
      // the picker and later empties one round type has an incomplete loadout
      // and should be asked again, which is what `complete` false does.
      prisma.gardenOnboardingState.upsert({
        where: { SteamId: steamId },
        create: { SteamId: steamId, CompletedRetakeSetup: complete },
        update: { CompletedRetakeSetup: complete },
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
