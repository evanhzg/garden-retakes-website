import { NextResponse } from "next/server";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";
import {
  banPlayer,
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
  slay: AdminLevel.Admin,
  ban: AdminLevel.Admin,
  unban: AdminLevel.Admin,
  setName: AdminLevel.Admin,
  clearName: AdminLevel.Admin,
  setRole: AdminLevel.Owner,
  removeRole: AdminLevel.Owner,
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

  let result: ActionResult;
  switch (type) {
    case "kick":
      result = await kickPlayer(ctx, str("name"));
      break;
    case "slay":
      result = await slayPlayer(ctx, str("name"));
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
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
