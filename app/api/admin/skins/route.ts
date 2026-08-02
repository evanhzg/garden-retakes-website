import { NextResponse } from "next/server";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";
import {
  MAX_BYTES,
  REMOTE_DIR,
  analyzeVpk,
  gameServerConfigured,
  listSkins,
  pushToGameServer,
  safeVpkName,
  sha256,
  storeSkin,
  writeSkin,
  type SkinRecord,
} from "@/lib/customSkins";

// Writing a file to the game server is an Admin-level action, same as a ban.
// The route this replaces (/api/upload-skin) had no authorization at all: any
// visitor could POST a file straight into the server's content directory.
const REQUIRED = AdminLevel.Admin;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** ?key= is the superuser fallback the rest of the admin pages already accept. */
const keyOf = (req: Request) => new URL(req.url).searchParams.get("key");

export async function GET(req: Request) {
  const ctx = await getAdminContext(keyOf(req));
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  return NextResponse.json({
    skins: await listSkins(),
    remoteDir: REMOTE_DIR,
    gameServerConfigured: gameServerConfigured(),
    canUpload: ctx.level >= REQUIRED,
  });
}

export async function POST(req: Request) {
  const ctx = await getAdminContext(keyOf(req));
  if (ctx.level < REQUIRED) {
    return NextResponse.json({ error: "Not authorized to upload skins." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });
  }

  const upload = form.get("file");
  if (!(upload instanceof File) || upload.size === 0) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const file = safeVpkName(upload.name);
  if (!file) {
    return NextResponse.json(
      {
        error:
          "The file must be a .vpk whose name is letters, digits, dots, dashes or underscores — " +
          `got "${upload.name}".`,
      },
      { status: 400 }
    );
  }

  if (upload.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `${file} is ${(upload.size / 1024 / 1024).toFixed(0)} MB; the limit is ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await upload.arrayBuffer());

  // Validate before anything is written. A renamed zip or a truncated VPK
  // fails silently on the game server, so it is caught here instead.
  let analysis;
  try {
    analysis = analyzeVpk(buffer);
  } catch (e) {
    return NextResponse.json(
      { error: `${file} is not a readable VPK: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 }
    );
  }

  const label = (form.get("label") as string | null)?.trim() || file.replace(/\.vpk$/i, "");

  await storeSkin(file, buffer);

  // A failed push still leaves a stored, downloadable VPK — report it rather
  // than throwing the upload away.
  const push = await pushToGameServer(file);

  const record: SkinRecord = {
    file,
    label,
    bytes: buffer.length,
    sha256: sha256(buffer),
    uploadedAt: new Date().toISOString(),
    uploadedBy: { steamId: ctx.steamId, name: ctx.viaKey ? "Web Key" : ctx.name || "Web" },
    analysis,
    server: { path: push.path, deployedAt: push.ok ? new Date().toISOString() : null, error: push.error },
    downloadUrl: `/fastdl/${file}`,
  };

  await writeSkin(record);

  await logAdminAction(
    ctx,
    "skin.upload",
    undefined,
    `${file} (${buffer.length} bytes) → ${push.ok ? push.path : `local only: ${push.error}`}`
  );

  return NextResponse.json({
    ok: true,
    skin: record,
    message: push.ok
      ? `${file} is on the game server at ${push.path}.`
      : `${file} was stored and is hosted for download, but the game server push failed: ${push.error}`,
  });
}
