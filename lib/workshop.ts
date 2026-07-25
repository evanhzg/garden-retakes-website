import "server-only";
import fs from "node:fs";
import path from "node:path";

// The workshop-skin catalogue.
//
// Records are written by `scripts/ws-ingest` (the CLI) and by the inventory
// page's "add from Workshop" box, and read by the inventory picker and the
// deploy script. Storage is the same JSON directory in both cases, so a skin
// added through the website is picked up by the next deploy without any
// database round-trip.
//
// Note: this writes to disk, which works locally and on a self-hosted node but
// not on a read-only serverless filesystem — `addWorkshopSkin` surfaces that
// clearly rather than failing obscurely.

// Overridable so a deployment can point them at a mounted disk. Relative
// values resolve against the app directory, which is what a bare `data/` or
// `public/web_assets` means on a normal host.
const resolveDir = (value: string | undefined, fallback: string) =>
  value ? (path.isAbsolute(value) ? value : path.join(process.cwd(), value)) : fallback;

const DATA_DIR = resolveDir(process.env.WORKSHOP_DATA_DIR, path.join(process.cwd(), "data", "workshop"));
const ASSET_DIR = resolveDir(process.env.WORKSHOP_ASSET_DIR, path.join(process.cwd(), "public", "web_assets"));

/** Create the write targets up front so a missing directory is never an error. */
function ensureDirs() {
  for (const dir of [DATA_DIR, ASSET_DIR]) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* reported properly at write time */ }
  }
}

/**
 * Turn a filesystem failure into something actionable.
 *
 * The previous version asserted "the filesystem is read-only" for anything
 * matching EROFS/EACCES, which sent me chasing a read-only disk that didn't
 * exist. Report what actually happened, and where.
 */
function writeFailure(err: unknown, what: string, dir: string): WorkshopIngestError {
  const e = err as NodeJS.ErrnoException;
  const code = e?.code ? `${e.code}: ` : "";
  const hint =
    e?.code === "EROFS" ? " The filesystem is read-only."
    : e?.code === "EACCES" ? " The app user can't write there — check ownership."
    : e?.code === "ENOSPC" ? " The disk is full."
    : "";
  return new WorkshopIngestError(`Couldn't write ${what} to ${dir} — ${code}${e?.message ?? String(err)}.${hint}`, 500);
}

export type WorkshopSkin = {
  workshopId: string;
  name: string;
  description?: string;
  def: number | null;
  weapon: string | null;
  weaponModel?: string | null;
  weaponResolvedVia?: string | null;
  tags: string[];
  primaryMaterial: string | null;
  materials: string[];
  vpk: { file: string; bytes: number; version: number; entryCount: number } | null;
  preview: {
    file?: string;
    webPath: string | null;
    format: string;
    sourceFormat?: string;
    bytes: number;
    sourceUrl?: string;
  } | null;
  steam?: Record<string, unknown>;
  ingestedAt: string;
  /** Set once the id has been pushed to the game server's addon list. */
  deployedAt?: string | null;
};

/**
 * Pull a workshop id out of anything a user might paste — a full URL, a `?id=`
 * query, a `steam://` link, or a bare id.
 *
 * Delegates to the CLI module so the website and `node scripts/ws-ingest`
 * accept identical input; there is only one implementation to keep correct.
 */
export function parseWorkshopId(input: string): string | null {
  /* eslint-disable-next-line @typescript-eslint/no-var-requires */
  const { parseWorkshopId: parse } = require("@/scripts/ws-ingest/workshop");
  return parse(input);
}

function readRecord(file: string): WorkshopSkin | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as WorkshopSkin;
  } catch {
    return null;
  }
}

/** Every ingested skin, newest first. */
export function listWorkshopSkins(): WorkshopSkin[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  const out: WorkshopSkin[] = [];
  for (const name of fs.readdirSync(DATA_DIR)) {
    if (!/^\d+\.json$/.test(name)) continue;
    const record = readRecord(path.join(DATA_DIR, name));
    if (record) out.push(record);
  }
  out.sort((a, b) => (b.ingestedAt || "").localeCompare(a.ingestedAt || ""));
  return out;
}

export function getWorkshopSkin(workshopId: string): WorkshopSkin | null {
  const file = path.join(DATA_DIR, `${workshopId}.json`);
  return fs.existsSync(file) ? readRecord(file) : null;
}

export class WorkshopIngestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Fetch a workshop item's metadata + preview and record it.
 *
 * Deliberately does *not* run steamcmd: that takes minutes, needs a logged-in
 * Steam account, and has no place inside an HTTP request. The material paths
 * are filled in later by `node scripts/ws-ingest <id> --steam-login <user>`,
 * and the record is useful to the website without them.
 */
export async function addWorkshopSkin(
  input: string
): Promise<{ skin: WorkshopSkin; created: boolean; warning?: string | null }> {
  const workshopId = parseWorkshopId(input);
  if (!workshopId) {
    throw new WorkshopIngestError("That doesn't look like a Workshop link or id.");
  }

  ensureDirs();
  const existing = getWorkshopSkin(workshopId);

  // The CLI modules are plain CommonJS and live outside the Next build graph.
  // We use eval('require') to completely bypass Webpack bundling, since Next.js
  // has issues with dynamic await import() of ESM modules in CJS API routes.
  const req = eval("require");
  const { fetchDetails, assertCs2, downloadPreview } = req(path.join(process.cwd(), "scripts/ws-ingest/workshop.js"));
  const { resolveWeapon } = req(path.join(process.cwd(), "scripts/ws-ingest/weapons.js"));
  const { buildRecord, writeRecord, rebuildIndex } = req(path.join(process.cwd(), "scripts/ws-ingest/manifest.js"));

  let details;
  try {
    details = await fetchDetails(workshopId);
    assertCs2(details);
  } catch (err) {
    throw new WorkshopIngestError((err as Error).message, 404);
  }

  let preview = null;
  let previewWarning: string | null = null;
  try {
    preview = await downloadPreview(details.previewUrl, ASSET_DIR, workshopId, { format: "original" });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // Only a genuine filesystem refusal is fatal; a bad or missing image is not
    // worth losing the rest of the record over.
    if (e?.code && ["EROFS", "EACCES", "ENOSPC", "EPERM"].includes(e.code)) {
      throw writeFailure(err, "the preview image", ASSET_DIR);
    }
    previewWarning = e?.message ?? String(err);
  }

  const weapon = await resolveWeapon(details);
  const record: WorkshopSkin = buildRecord({
    details,
    weapon,
    preview,
    // Keep whatever a previous CLI run already discovered.
    vpk: existing?.vpk ?? null,
    materials: existing?.materials ?? [],
    webPath: preview ? `/web_assets/${path.basename(preview.file)}` : existing?.preview?.webPath ?? null,
  });
  record.deployedAt = existing?.deployedAt ?? null;

  try {
    writeRecord(DATA_DIR, record);
    rebuildIndex(DATA_DIR);
  } catch (err) {
    throw writeFailure(err, "the skin record", DATA_DIR);
  }

  return { skin: record, created: !existing, warning: previewWarning };
}

/** Workshop ids the game server should mount, for the deploy script. */
export function workshopIdsForServer(): string[] {
  return listWorkshopSkins().map((s) => s.workshopId);
}
