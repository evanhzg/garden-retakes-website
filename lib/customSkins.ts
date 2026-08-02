// Custom skin VPKs — the store behind /admin/skins.
//
// The Workshop route (scripts/ws-ingest + MultiAddonManager) can't carry a
// weapon finish any more: Valve stopped accepting finish submissions, and a
// published item hands back a preview image rather than a VPK. So a finish
// authored locally in Substance + the CS2 Workshop Tools has to be packed into
// a VPK by hand and pushed to the server directly. That's what this does.
//
// Three things happen to an uploaded VPK, and they are deliberately separate so
// a failure in one still reports the others honestly:
//
//   1. it is validated and its directory tree is read, so the admin sees what
//      is actually inside before it goes anywhere;
//   2. it is stored under data/custom_skins/ with a JSON record beside it, and
//      served at /fastdl/<file> so players have somewhere to download from;
//   3. it is pushed to the game server over the same FTP credentials the
//      workshop sync already uses.
//
// Step 3 mounts the content *on the server*. It does not put the file on any
// client — CS2 has no sv_downloadurl, and MultiAddonManager only knows how to
// hand clients Workshop ids. See the reference block in the admin UI.

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

// The workshop ingest tool already carries a tested VPK directory reader, and
// the format doesn't change per consumer — importing it beats a second copy.
import { readVpkBuffer } from "../scripts/ws-ingest/vpk";

export const LOCAL_DIR = path.join(process.cwd(), "data", "custom_skins");

/** Anything larger is almost certainly a whole addon rather than one finish. */
export const MAX_BYTES = 256 * 1024 * 1024;

/**
 * Where the VPK lands on the game server.
 *
 * The FTP account is rooted at the `csgo` directory — that's the same root
 * deploy.mjs writes /addons/counterstrikesharp/plugins under, and the one
 * serverSync reads /cfg/multiaddonmanager/multiaddonmanager.cfg from. Which
 * subdirectory a given host mounts is a per-server gameinfo.gi decision, so it
 * is configurable and the UI reports where the file actually went.
 */
export const REMOTE_DIR = process.env.GAMESERVER_SKINS_DIR || "/custom_skins";

/** Top-level directories CS2 will read out of an addon VPK. */
// Taken verbatim from AddonConfig → VpkDirectories in the shipped
// game/csgo/gameinfo.gi. A VPK whose root holds anything else is not wrong as
// such, but the engine ignores it, so it is worth telling the admin.
export const ADDON_VPK_DIRECTORIES = [
  "maps",
  "cfg/maps",
  "materials",
  "models",
  "panorama/images/overheadmaps",
  "panorama/images/map_icons",
  "particles",
  "resource/overviews",
  "scripts",
  "sounds",
  "soundevents",
  "lighting/postprocessing",
  "postprocess",
  "addoninfo.txt",
];

export type VpkAnalysis = {
  version: number;
  entryCount: number;
  /** Compiled paint materials — what the !ws plugin points a weapon at. */
  materials: string[];
  /** Best guess at the finish itself, preferring paths under paints/. */
  primaryMaterial: string | null;
  textures: string[];
  models: string[];
  /** Distinct first path segments, so the admin can see the VPK's shape. */
  roots: string[];
  hasAddonInfo: boolean;
  /** Non-fatal observations worth showing next to the result. */
  warnings: string[];
};

export type SkinRecord = {
  file: string;
  label: string;
  bytes: number;
  sha256: string;
  uploadedAt: string;
  uploadedBy: { steamId: string | null; name: string };
  analysis: VpkAnalysis;
  /** Null until a push is attempted; `error` is set when one failed. */
  server: { path: string; deployedAt: string | null; error: string | null } | null;
  downloadUrl: string;
};

// ─────────────────────────────────────────────────────────────── validation

/**
 * Reject anything that isn't a plain `<name>.vpk`.
 *
 * The uploaded name reaches both a filesystem join and an FTP path, so a
 * traversal here would be a write anywhere on the game server. Rather than
 * escaping, only a known-good shape is accepted at all.
 */
export function safeVpkName(raw: string): string | null {
  const base = path.basename(raw.trim());
  if (base !== raw.trim()) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.vpk$/i.test(base)) return null;
  if (base.includes("..")) return null;
  return base;
}

const firstSegment = (p: string) => (p.includes("/") ? p.slice(0, p.indexOf("/")) : p);

/**
 * Read the VPK's directory tree and describe what's in it.
 *
 * Throws when the buffer isn't a VPK at all — which is the single most common
 * mistake here, since a "VPK" that is really a renamed zip fails silently on
 * the server with nothing in the logs.
 */
export function analyzeVpk(buffer: Buffer): VpkAnalysis {
  const { version, entries } = readVpkBuffer(buffer);
  const paths: string[] = entries.map((e) => e.path);
  const lower = paths.map((p) => p.toLowerCase());

  const pick = (test: (p: string) => boolean) =>
    paths.filter((_, i) => test(lower[i])).sort();

  const materials = pick((p) => p.endsWith(".vmat_c") || p.endsWith(".vmat"));
  const textures = pick((p) => p.endsWith(".vtex_c") || p.endsWith(".vtex"));
  const models = pick((p) => p.endsWith(".vmdl_c") || p.endsWith(".vmdl"));
  const roots = Array.from(new Set(paths.map((p) => firstSegment(p)))).sort();
  const hasAddonInfo = lower.includes("addoninfo.txt");

  // A finish addon usually carries the stock weapon material too; the one under
  // customization/paints is the one worth pointing the plugin at.
  const primaryMaterial =
    materials.find((m) => /customization\/paints\//i.test(m)) ??
    materials.find((m) => /\/paints?\//i.test(m)) ??
    materials[0] ??
    null;

  const warnings: string[] = [];

  if (!materials.length) {
    warnings.push(
      "No .vmat_c in this VPK. A weapon finish is a compiled material — if you packed the " +
        "content/ folder (.vmat, .tga) instead of the game/ folder, the server has nothing to mount."
    );
  }
  if (materials.some((m) => m.toLowerCase().endsWith(".vmat"))) {
    warnings.push(
      "Uncompiled .vmat files are present. The engine only reads .vmat_c — compile the addon " +
        "in the Workshop Tools before packing."
    );
  }
  if (materials.length && !textures.length) {
    warnings.push(
      "Materials but no .vtex_c textures. The finish will load and render untextured unless the " +
        "textures it references are already in the base game."
    );
  }
  if (!hasAddonInfo) {
    warnings.push("No addoninfo.txt at the VPK root. CS2 tolerates this, but the Workshop Tools expect it.");
  }

  const stray = roots.filter(
    (r) => r && !ADDON_VPK_DIRECTORIES.some((d) => d === r || d.startsWith(`${r}/`))
  );
  if (stray.length) {
    warnings.push(
      `Ignored top-level entries: ${stray.join(", ")}. CS2 only reads ` +
        `${ADDON_VPK_DIRECTORIES.slice(0, 4).join(", ")}… from an addon VPK, so the VPK root has to be ` +
        "the addon's game/ folder, not the folder above it."
    );
  }

  return {
    version,
    entryCount: entries.length,
    materials,
    primaryMaterial,
    textures,
    models,
    roots,
    hasAddonInfo,
    warnings,
  };
}

// ──────────────────────────────────────────────────────────────────── store

const recordPath = (file: string) => path.join(LOCAL_DIR, `${file}.json`);

export async function listSkins(): Promise<SkinRecord[]> {
  let names: string[];
  try {
    names = await fs.readdir(LOCAL_DIR);
  } catch {
    return []; // Nothing uploaded yet.
  }

  const records = await Promise.all(
    names
      .filter((n) => n.endsWith(".vpk.json"))
      .map(async (n) => {
        try {
          return JSON.parse(await fs.readFile(path.join(LOCAL_DIR, n), "utf8")) as SkinRecord;
        } catch {
          return null; // A half-written record shouldn't blank the whole list.
        }
      })
  );

  return records
    .filter((r): r is SkinRecord => r !== null)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function readSkin(file: string): Promise<SkinRecord | null> {
  try {
    return JSON.parse(await fs.readFile(recordPath(file), "utf8")) as SkinRecord;
  } catch {
    return null;
  }
}

export async function writeSkin(record: SkinRecord): Promise<void> {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(recordPath(record.file), `${JSON.stringify(record, null, 2)}\n`);
}

/** Store the VPK. app/fastdl/[file] serves this same copy to players. */
export async function storeSkin(file: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, file), buffer);
}

export async function removeSkinFiles(file: string): Promise<void> {
  await Promise.all(
    [path.join(LOCAL_DIR, file), recordPath(file)].map((p) => fs.rm(p, { force: true }))
  );
}

export const sha256 = (buffer: Buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

// ────────────────────────────────────────────────────────────── game server

function ftpConfig() {
  return {
    host: process.env.GAMESERVER_FTP_HOST || "",
    port: Number(process.env.GAMESERVER_FTP_PORT || 21),
    user: process.env.GAMESERVER_FTP_USER || "",
    password: process.env.GAMESERVER_FTP_PASSWORD || "",
    secure: /^(1|true|yes)$/i.test(process.env.GAMESERVER_FTP_SECURE || ""),
  };
}

export const gameServerConfigured = () => Boolean(process.env.GAMESERVER_FTP_HOST);

/**
 * Put the VPK on the game server, and confirm it by listing the directory
 * afterwards — an FTP `STOR` that silently wrote nothing looks like success.
 *
 * Never throws: a failed push leaves a perfectly good local + hosted copy, so
 * the caller reports it rather than failing the whole upload.
 */
export async function pushToGameServer(
  file: string
): Promise<{ ok: boolean; path: string; error: string | null }> {
  const remote = `${REMOTE_DIR.replace(/\/+$/, "")}/${file}`;
  const cfg = ftpConfig();
  if (!cfg.host) {
    return { ok: false, path: remote, error: "No game server configured (GAMESERVER_FTP_HOST)." };
  }

  // Required lazily so a deployment without basic-ftp still serves the site.
  const { Client } = await import("basic-ftp");
  const client = new Client(30000);

  try {
    await client.access(cfg);
    await client.ensureDir(REMOTE_DIR);
    await client.uploadFrom(path.join(LOCAL_DIR, file), remote);

    const listing = await client.list(REMOTE_DIR);
    const found = listing.find((f) => f.name === file);
    if (!found) return { ok: false, path: remote, error: "Upload reported success but the file is not on the server." };

    return { ok: true, path: remote, error: null };
  } catch (e) {
    return { ok: false, path: remote, error: e instanceof Error ? e.message : String(e) };
  } finally {
    client.close();
  }
}

/** Best-effort delete of the server-side copy. */
export async function removeFromGameServer(file: string): Promise<{ ok: boolean; error: string | null }> {
  const cfg = ftpConfig();
  if (!cfg.host) return { ok: false, error: "No game server configured (GAMESERVER_FTP_HOST)." };

  const { Client } = await import("basic-ftp");
  const client = new Client(30000);

  try {
    await client.access(cfg);
    await client.remove(`${REMOTE_DIR.replace(/\/+$/, "")}/${file}`, true);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    client.close();
  }
}
