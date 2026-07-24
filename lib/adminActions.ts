import { prisma } from "@/lib/db";
import { rconExec } from "@/lib/rcon";
import { AdminContext, AdminLevel, logAdminAction } from "@/lib/adminAuth";

// W2: admin panel actions. Design principle — the WEBSITE owns persistence
// (bans / name overrides / roles are written to the shared DB via Prisma so
// they work even when the game server is offline, and are enforced by the
// plugin on the next connect / map change). Live in-game effects (kick, slay,
// map change, immediate role update) are driven best-effort through the
// plugin's own css_g* commands over RCON, which the server console runs as root.

export type ActionResult = { ok: boolean; message: string };

const LEVEL_WORD: Record<number, string> = {
  [AdminLevel.Moderator]: "mod",
  [AdminLevel.Admin]: "admin",
  [AdminLevel.Owner]: "owner",
};

/** Fire a plugin command over RCON, swallowing "server unreachable" errors. */
async function tryRcon(command: string): Promise<string | null> {
  try {
    return await rconExec(command);
  } catch {
    return null;
  }
}

async function resolveName(steamId: bigint): Promise<string> {
  const [override, profile] = await Promise.all([
    prisma.gardenNameOverride.findUnique({ where: { SteamId: steamId } }),
    prisma.playerProfile.findUnique({ where: { SteamId: steamId } }),
  ]);
  return override?.Name ?? profile?.LastKnownName ?? steamId.toString();
}

// ---------- online-player actions (RCON only) ----------

export async function kickPlayer(ctx: AdminContext, name: string): Promise<ActionResult> {
  if (!name.trim()) return { ok: false, message: "No player name." };
  const out = await tryRcon(`css_gkick ${name}`);
  await logAdminAction(ctx, "kick", { name }, "web");
  return out === null
    ? { ok: false, message: "Server unreachable — could not kick." }
    : { ok: true, message: `Kick sent for “${name}” (only affects online players).` };
}

export async function slayPlayer(ctx: AdminContext, name: string): Promise<ActionResult> {
  if (!name.trim()) return { ok: false, message: "No player name." };
  const out = await tryRcon(`css_gslay ${name}`);
  await logAdminAction(ctx, "slay", { name }, "web");
  return out === null
    ? { ok: false, message: "Server unreachable — could not slay." }
    : { ok: true, message: `Slay sent for “${name}”.` };
}

export async function changeMap(ctx: AdminContext, map: string): Promise<ActionResult> {
  const clean = map.trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(clean)) return { ok: false, message: "Invalid map name." };
  const out = await tryRcon(`css_gmap ${clean}`);
  await logAdminAction(ctx, "map_change", undefined, clean);
  return out === null
    ? { ok: false, message: "Server unreachable — map not changed." }
    : { ok: true, message: `Changing map to ${clean}…` };
}

// ---------- persistent actions (DB authoritative + best-effort live) ----------

export async function banPlayer(
  ctx: AdminContext,
  steamId: string,
  reason: string,
  minutes: number
): Promise<ActionResult> {
  let id: bigint;
  try {
    id = BigInt(steamId);
  } catch {
    return { ok: false, message: "Invalid SteamID64." };
  }
  const name = await resolveName(id);
  const cleanReason = (reason.trim() || "Banned by an admin").slice(0, 256);
  const expires = minutes > 0 ? new Date(Date.now() + minutes * 60_000) : null;

  await prisma.gardenBan.upsert({
    where: { SteamId: id },
    create: {
      SteamId: id,
      Name: name,
      Reason: cleanReason,
      BannedBy: ctx.steamId ? BigInt(ctx.steamId) : BigInt(0),
      BannedAtUtc: new Date(),
      ExpiresAtUtc: expires,
    },
    update: {
      Name: name,
      Reason: cleanReason,
      BannedBy: ctx.steamId ? BigInt(ctx.steamId) : BigInt(0),
      BannedAtUtc: new Date(),
      ExpiresAtUtc: expires,
    },
  });

  // Remove them now if they happen to be online (enforced on reconnect regardless).
  await tryRcon(`css_gkick ${name}`);
  await logAdminAction(ctx, "ban", { steamId, name }, expires ? `${minutes}min: ${cleanReason}` : `perm: ${cleanReason}`);
  return { ok: true, message: `Banned ${name} ${expires ? `for ${minutes} min` : "permanently"}.` };
}

export async function unbanPlayer(ctx: AdminContext, steamId: string): Promise<ActionResult> {
  let id: bigint;
  try {
    id = BigInt(steamId);
  } catch {
    return { ok: false, message: "Invalid SteamID64." };
  }
  await prisma.gardenBan.deleteMany({ where: { SteamId: id } });
  await logAdminAction(ctx, "unban", { steamId, name: steamId });
  return { ok: true, message: `Unbanned ${steamId}.` };
}

export async function setName(ctx: AdminContext, steamId: string, name: string): Promise<ActionResult> {
  let id: bigint;
  try {
    id = BigInt(steamId);
  } catch {
    return { ok: false, message: "Invalid SteamID64." };
  }
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 32);
  if (clean.length < 2) return { ok: false, message: "Name too short." };
  await prisma.gardenNameOverride.upsert({
    where: { SteamId: id },
    create: { SteamId: id, Name: clean },
    update: { Name: clean },
  });
  await logAdminAction(ctx, "name_override", { steamId, name: clean });
  return { ok: true, message: `Display name set to “${clean}”.` };
}

export async function clearName(ctx: AdminContext, steamId: string): Promise<ActionResult> {
  let id: bigint;
  try {
    id = BigInt(steamId);
  } catch {
    return { ok: false, message: "Invalid SteamID64." };
  }
  await prisma.gardenNameOverride.deleteMany({ where: { SteamId: id } });
  await logAdminAction(ctx, "name_revert", { steamId, name: steamId });
  return { ok: true, message: "Reverted to Steam name." };
}

export async function setRole(
  ctx: AdminContext,
  steamId: string,
  level: number
): Promise<ActionResult> {
  let id: bigint;
  try {
    id = BigInt(steamId);
  } catch {
    return { ok: false, message: "Invalid SteamID64." };
  }
  const word = LEVEL_WORD[level];
  if (!word) return { ok: false, message: "Invalid role level." };
  const name = await resolveName(id);

  // Live effect first (updates the plugin's in-memory registry), then the
  // authoritative DB row with the correct display name.
  await tryRcon(`css_gadmin add ${id.toString()} ${word}`);
  await prisma.gardenAdmin.upsert({
    where: { SteamId: id },
    create: {
      SteamId: id,
      Name: name,
      Level: level,
      AddedBy: ctx.steamId ? BigInt(ctx.steamId) : BigInt(0),
      AddedAtUtc: new Date(),
    },
    update: { Name: name, Level: level },
  });
  await logAdminAction(ctx, "admin_add", { steamId, name }, word);
  return { ok: true, message: `${name} is now ${word}.` };
}

export async function removeRole(ctx: AdminContext, steamId: string): Promise<ActionResult> {
  let id: bigint;
  try {
    id = BigInt(steamId);
  } catch {
    return { ok: false, message: "Invalid SteamID64." };
  }
  const name = await resolveName(id);
  await tryRcon(`css_gadmin remove ${id.toString()}`);
  await prisma.gardenAdmin.deleteMany({ where: { SteamId: id } });
  await logAdminAction(ctx, "admin_remove", { steamId, name });
  return { ok: true, message: `Removed ${name}'s role.` };
}
