import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, canTarget, getAdminContext } from "@/lib/adminAuth";
import {
  banPlayer,
  changeGameMode,
  changeMap,
  clearName,
  kickPlayer,
  removeRole,
  setName,
  setRole,
  slayPlayer,
  unbanPlayer,
  type ActionResult,
} from "@/lib/adminActions";

export const dynamic = "force-dynamic";

// Minimum admin level required for each action (mirrors the plugin's commands).
const REQUIRED: Record<string, number> = {
  kick: AdminLevel.Moderator,
  map: AdminLevel.Moderator,
  gamemode: AdminLevel.Admin,
  slay: AdminLevel.Admin,
  ban: AdminLevel.Admin,
  unban: AdminLevel.Admin,
  setName: AdminLevel.Admin,
  clearName: AdminLevel.Admin,
  setRole: AdminLevel.Owner,
  removeRole: AdminLevel.Owner,
  toggleDemoMode: AdminLevel.Owner,
};

/**
 * Which body field names the player an action acts on.
 *
 * `kick` and `slay` are absent because they take a display name, not a
 * SteamID — `kickPlayer(ctx, name)` interpolates it straight into
 * `css_gkick <name>`. That cannot be gated by immunity without resolving the
 * name to an identity first, and it is also why those two should move to
 * SteamID targeting: a partial name match from a fuzzy player list is how you
 * kick the wrong person, and it is a command-injection surface besides.
 * Tracked rather than silently half-fixed.
 */
const TARGETS_A_PLAYER: Record<string, string | undefined> = {
  ban: "steamId",
  unban: "steamId",
  setName: "steamId",
  clearName: "steamId",
  setRole: "steamId",
  removeRole: "steamId",
};

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const type = String(body.type ?? "");
  const required = REQUIRED[type];
  if (required === undefined) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const ctx = await getAdminContext(typeof body.key === "string" ? body.key : null);
  if (ctx.level < required) {
    return NextResponse.json({ error: "Not authorized for this action." }, { status: 403 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const num = (k: string) => (Number.isFinite(Number(body[k])) ? Number(body[k]) : 0);

  // The immunity gate.
  //
  // The level check above asks whether the actor is senior enough for the
  // COMMAND. Nothing asked whether they outrank the PERSON, so a Moderator
  // could kick or slay an Owner — the same hole the plugin had until
  // AdminTargeting.CanTarget closed it, and one that cannot be caught further
  // down because RCON arrives at the game server with no identity and is
  // treated as console, which outranks everyone.
  //
  // Keyed on SteamID, so it covers the actions that carry one. `kick` and
  // `slay` take a NAME, which is a separate problem noted below.
  const targeted = TARGETS_A_PLAYER[type];
  if (targeted) {
    const allowed = await canTarget(ctx, str(targeted));
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error }, { status: 403 });
    }
  }

  let result: ActionResult;
  switch (type) {
    case "kick":
      result = await kickPlayer(ctx, str("name"));
      break;
    case "slay":
      result = await slayPlayer(ctx, str("name"));
      break;
    case "gamemode":
      result = await changeGameMode(ctx, str("mode"));
      break;
    case "map":
      result = await changeMap(ctx, str("map"));
      break;
    case "ban":
      result = await banPlayer(ctx, str("steamId"), str("reason"), num("minutes"));
      break;
    case "unban":
      result = await unbanPlayer(ctx, str("steamId"));
      break;
    case "setName":
      result = await setName(ctx, str("steamId"), str("name"));
      break;
    case "clearName":
      result = await clearName(ctx, str("steamId"));
      break;
    case "setRole":
      result = await setRole(ctx, str("steamId"), num("level"));
      break;
    case "removeRole":
      result = await removeRole(ctx, str("steamId"));
      break;
    case "toggleDemoMode": {
      const mode = str("value");
      await prisma.gardenSchedulerState.upsert({
        where: { Key: "DemoMode" },
        update: { Value: mode, UpdatedAtUtc: new Date() },
        create: { Key: "DemoMode", Value: mode, UpdatedAtUtc: new Date() },
      });
      result = { ok: true, message: `Demo Mode set to ${mode}` };
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
