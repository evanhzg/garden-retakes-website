import { NextResponse } from "next/server";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";
import { rconExec } from "@/lib/rcon";
import {
  CONFIG_TARGETS,
  describe,
  isConfigTarget,
  gameServerConfigured,
  getPath,
  parseJsonc,
  patchJsonc,
  readConfigText,
  setPath,
  writeConfigText,
} from "@/lib/pluginConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Read and edit the game plugin's live config.
//
// Writing a config to a running server is an Owner-level action: it is the one
// admin surface that can change how every mode behaves at once.
const READ_LEVEL = AdminLevel.Admin;
const WRITE_LEVEL = AdminLevel.Owner;

const keyOf = (req: Request) => new URL(req.url).searchParams.get("key");

/** Which config file to act on; defaults to the CSS plugin config. */
function targetOf(req: Request) {
  const raw = new URL(req.url).searchParams.get("target") ?? "plugin";
  return isConfigTarget(raw) ? raw : "plugin";
}

export async function GET(req: Request) {
  const ctx = await getAdminContext(keyOf(req));
  if (ctx.level < READ_LEVEL) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  if (!gameServerConfigured()) {
    return NextResponse.json({ error: "No game server configured (GAMESERVER_FTP_HOST)." }, { status: 503 });
  }

  const target = targetOf(req);
  try {
    const { value: config } = parseJsonc(await readConfigText(target));
    return NextResponse.json({
      target,
      path: CONFIG_TARGETS[target].path,
      targets: Object.entries(CONFIG_TARGETS).map(([id, t]) => ({ id, label: t.label, hint: t.hint })),
      sections: describe(config),
      canWrite: ctx.level >= WRITE_LEVEL,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: `Could not read ${CONFIG_TARGETS[target].path}: ${e instanceof Error ? e.message : String(e)}`,
        targets: Object.entries(CONFIG_TARGETS).map(([id, t]) => ({ id, label: t.label, hint: t.hint })),
        target,
      },
      { status: 502 }
    );
  }
}

export async function POST(req: Request) {
  const ctx = await getAdminContext(keyOf(req));
  if (ctx.level < WRITE_LEVEL) {
    return NextResponse.json({ error: "Editing the plugin config needs the Owner role." }, { status: 403 });
  }

  let body: { changes?: Record<string, unknown>; apply?: "auto" | "now" | "none" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const changes = body.changes ?? {};
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "No changes submitted." }, { status: 400 });
  }

  // Always re-read immediately before writing. Two admins editing at once, or
  // an in-game !gconfig between load and save, would otherwise have their work
  // silently reverted by whatever the browser had cached.
  let config: Record<string, unknown>;
  let sourceText: string;
  let spans: ReturnType<typeof parseJsonc>["spans"];
  const target = targetOf(req);
  try {
    sourceText = await readConfigText(target);
    ({ value: config, spans } = parseJsonc(sourceText));
  } catch (e) {
    return NextResponse.json(
      { error: `Could not read the current config: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  const applied: { path: string; before: unknown; after: unknown }[] = [];
  for (const [path, value] of Object.entries(changes)) {
    const before = getPath(config, path);
    const result = setPath(config, path, value);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    if (JSON.stringify(before) !== JSON.stringify(value)) {
      applied.push({ path, before, after: value });
    }
  }

  if (applied.length === 0) {
    return NextResponse.json({ ok: true, applied: [], message: "Nothing changed." });
  }

  // Splice into the original text rather than re-serialising the parsed object:
  // the file carries hand-written `//` comments that a round trip would delete.
  const patched = patchJsonc(sourceText, spans, Object.fromEntries(applied.map((c) => [c.path, c.after])));

  try {
    await writeConfigText(patched, target);
  } catch (e) {
    return NextResponse.json(
      { error: `Write failed, the server config is unchanged: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  await logAdminAction(
    ctx,
    `config:${target}`,
    undefined,
    applied.map((c) => `${c.path}: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`).join("; ").slice(0, 512)
  );

  // The file is on disk, but CounterStrikeSharp only reads it at plugin load.
  // ConfigSyncModule re-reads it: immediately when the server is empty, or at
  // the end of the map with a chat notice and a /restart shortcut for admins.
  let apply: { ran: boolean; detail: string };
  const mode = body.apply ?? "auto";
  if (mode === "none") {
    apply = { ran: false, detail: "Saved to the server. It takes effect the next time the plugin loads." };
  } else {
    try {
      const out = await rconExec(`css_gconfigapply${mode === "now" ? " now" : ""}`);
      apply = { ran: true, detail: out.trim() || "Applied." };
    } catch (e) {
      apply = {
        ran: false,
        detail: `Saved, but RCON is unreachable so the server has not re-read it yet (${e instanceof Error ? e.message : String(e)}).`,
      };
    }
  }

  return NextResponse.json({ ok: true, applied, apply });
}
