import { prisma } from "@/lib/db";

// Display-name resolution for the whole site (W2). A player's shown name is,
// in priority order:
//   1. their website username override (GardenNameOverrides)
//   2. the last name the plugin saw them use (PlayerProfiles.LastKnownName)
//   3. the raw SteamID64 (fallback for never-seen ids)
// The plugin stops overwriting LastKnownName once an override exists, so the
// override is authoritative both here and in-game.

export type NameMap = Map<string, string>;

/** Resolve display names for a batch of SteamID64s (as strings or bigints). */
export async function resolveNames(steamIds: (bigint | string)[]): Promise<NameMap> {
  const ids = Array.from(new Set(steamIds.map((id) => BigInt(id))));
  if (ids.length === 0) return new Map();

  const [profiles, overrides] = await Promise.all([
    prisma.playerProfile.findMany({
      where: { SteamId: { in: ids } },
      select: { SteamId: true, LastKnownName: true },
    }),
    prisma.gardenNameOverride.findMany({
      where: { SteamId: { in: ids } },
      select: { SteamId: true, Name: true },
    }),
  ]);

  const map: NameMap = new Map();
  for (const p of profiles) map.set(p.SteamId.toString(), p.LastKnownName);
  for (const o of overrides) map.set(o.SteamId.toString(), o.Name); // override wins
  return map;
}

/** Convenience: display name for a single id (falls back to the id string). */
export async function resolveName(steamId: bigint | string): Promise<string> {
  const key = steamId.toString();
  const map = await resolveNames([steamId]);
  return map.get(key) ?? key;
}

/** Pull a display name out of a NameMap with the SteamID fallback baked in. */
export function nameFrom(map: NameMap, steamId: bigint | string): string {
  const key = steamId.toString();
  return map.get(key) ?? key;
}
