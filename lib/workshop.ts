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

const DATA_DIR = path.join(process.cwd(), "data", "workshop");
const PUBLIC_DIR = path.join(process.cwd(), "public");
const ASSET_DIR = path.join(PUBLIC_DIR, "web_assets");

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
export async function addWorkshopSkin(input: string): Promise<{ skin: WorkshopSkin; created: boolean }> {
  const workshopId = parseWorkshopId(input);
  if (!workshopId) {
    throw new WorkshopIngestError("That doesn't look like a Workshop link or id.");
  }

  const existing = getWorkshopSkin(workshopId);

  // The CLI modules are plain CommonJS and live outside the Next build graph.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { fetchDetails, assertCs2, downloadPreview } = require("@/scripts/ws-ingest/workshop");
  const { resolveWeapon } = require("@/scripts/ws-ingest/weapons");
  const { buildRecord, writeRecord, rebuildIndex } = require("@/scripts/ws-ingest/manifest");
  /* eslint-enable @typescript-eslint/no-var-requires */

  let details;
  try {
    details = await fetchDetails(workshopId);
    assertCs2(details);
  } catch (err) {
    throw new WorkshopIngestError((err as Error).message, 404);
  }

  let preview = null;
  try {
    preview = await downloadPreview(details.previewUrl, ASSET_DIR, workshopId, { format: "original" });
  } catch (err) {
    const message = (err as Error).message || "";
    if (/EROFS|read-only|EACCES/i.test(message)) {
      throw new WorkshopIngestError(
        "Can't write the preview image — the filesystem is read-only here. "
        + "Run `node scripts/ws-ingest " + workshopId + "` locally instead.",
        500
      );
    }
    // No preview is survivable; the rest of the record is still worth having.
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
    const message = (err as Error).message || "";
    if (/EROFS|read-only|EACCES/i.test(message)) {
      throw new WorkshopIngestError(
        "Can't save the skin — the filesystem is read-only here. "
        + "Run `node scripts/ws-ingest " + workshopId + "` locally instead.",
        500
      );
    }
    throw err;
  }

  return { skin: record, created: !existing };
}

/** Workshop ids the game server should mount, for the deploy script. */
export function workshopIdsForServer(): string[] {
  return listWorkshopSkins().map((s) => s.workshopId);
}
