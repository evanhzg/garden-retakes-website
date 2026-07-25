// Steam Workshop metadata + preview image.
//
// GetPublishedFileDetails is a public POST endpoint — no API key, no login.
// It gives us the title, description, tags and a `preview_url`, which is what
// the web inventory needs; the actual skin bytes come from steamcmd.

const fs = require("node:fs");
const path = require("node:path");

const DETAILS_URL = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
const CS2_APP_ID = 730;

class WorkshopError extends Error {}

/**
 * Pull a workshop id out of anything a user might paste: a full URL, a `?id=`
 * query with other params after it, a `steam://` link, or a bare id.
 *
 * Lives here rather than in the web layer so the CLI and the website's
 * "add from Workshop" box accept exactly the same inputs.
 */
function parseWorkshopId(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  if (/^\d{6,20}$/.test(raw)) return raw;

  // .../filedetails/?id=123 — also matches when more query params follow.
  const fromQuery = /[?&]id=(\d{6,20})\b/.exec(raw);
  if (fromQuery) return fromQuery[1];

  // steam://url/CommunityFilePage/123 and .../filedetails/123
  const fromPath = /(?:CommunityFilePage|filedetails)\/+(\d{6,20})/i.exec(raw);
  if (fromPath) return fromPath[1];

  // A bare steamcommunity URL with the id somewhere in it.
  if (/steamcommunity\.com/i.test(raw)) {
    const any = /(\d{6,20})/.exec(raw);
    if (any) return any[1];
  }
  return null;
}

/**
 * Fetch one published file's details.
 * @param {string|number} workshopId
 */
async function fetchDetails(workshopId, { timeoutMs = 20000 } = {}) {
  const body = new URLSearchParams({ itemcount: "1", "publishedfileids[0]": String(workshopId) });

  const res = await fetch(DETAILS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new WorkshopError(`Steam API returned ${res.status} ${res.statusText}`);

  const json = await res.json();
  const detail = json?.response?.publishedfiledetails?.[0];
  if (!detail) throw new WorkshopError("Steam API returned no details for that id");

  // result 1 = OK. 9 = not found, 8 = invalid parameter, and so on.
  if (detail.result !== 1) {
    throw new WorkshopError(
      `workshop item ${workshopId} is unavailable (Steam result code ${detail.result})`
    );
  }

  const tags = (detail.tags || []).map((t) => t.tag).filter(Boolean);

  return {
    workshopId: String(detail.publishedfileid),
    title: detail.title || "",
    description: detail.description || "",
    previewUrl: detail.preview_url || "",
    appId: Number(detail.consumer_app_id) || null,
    creator: detail.creator || null,
    fileSize: Number(detail.file_size) || null,
    timeCreated: detail.time_created || null,
    timeUpdated: detail.time_updated || null,
    subscriptions: detail.subscriptions ?? null,
    favorited: detail.favorited ?? null,
    views: detail.views ?? null,
    tags,
  };
}

/** Reject early on items that clearly aren't CS2 workshop content. */
function assertCs2(details) {
  if (details.appId && details.appId !== CS2_APP_ID) {
    throw new WorkshopError(
      `workshop item ${details.workshopId} belongs to app ${details.appId}, not CS2 (730)`
    );
  }
}

// Steam serves previews without a file extension, so the format is sniffed
// from the magic bytes rather than trusted from the URL or Content-Type.
const SIGNATURES = [
  { ext: "png", test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 },
  { ext: "jpg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "gif", test: (b) => b.subarray(0, 3).toString("latin1") === "GIF" },
  {
    ext: "webp",
    test: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

function sniffImage(buf) {
  return SIGNATURES.find((s) => s.test(buf))?.ext ?? "bin";
}

/**
 * Convert to PNG, if a decoder is available.
 *
 * Steam previews are JPEG. Re-encoding a lossy JPEG as PNG makes the file
 * several times larger for no quality gain, so this is opt-in and the caller is
 * told when it silently didn't happen.
 *
 * @returns {{ buffer: Buffer, ext: string, converted: boolean, reason?: string }}
 */
async function toPng(buf, sourceExt) {
  if (sourceExt === "png") return { buffer: buf, ext: "png", converted: false };

  // sharp is fastest when it happens to be installed…
  try {
    const sharp = require("sharp");
    return { buffer: await sharp(buf).png().toBuffer(), ext: "png", converted: true };
  } catch { /* not installed — try the pure-JS path */ }

  try {
    const jpeg = require("jpeg-js");
    const { PNG } = require("pngjs");
    if (sourceExt !== "jpg") throw new Error(`no pure-JS decoder for .${sourceExt}`);
    const raw = jpeg.decode(buf, { useTArray: true });
    const png = new PNG({ width: raw.width, height: raw.height });
    // jpeg-js hands back a Uint8Array (RGBA), which has no Buffer#copy —
    // `set` is the portable way to move it into the PNG's pixel buffer.
    png.data.set(raw.data);
    return { buffer: PNG.sync.write(png), ext: "png", converted: true };
  } catch (err) {
    return {
      buffer: buf,
      ext: sourceExt,
      converted: false,
      reason:
        sourceExt === "jpg"
          ? "no PNG encoder installed (npm i -D sharp, or jpeg-js + pngjs) — kept the original JPEG"
          : `cannot convert .${sourceExt} to PNG — kept the original`,
    };
  }
}

/**
 * Download the preview image next to the other web assets.
 *
 * @param {string} previewUrl
 * @param {string} outDir
 * @param {string} basename          file name without extension
 * @param {"original"|"png"} format
 */
async function downloadPreview(previewUrl, outDir, basename, { format = "png", timeoutMs = 60000 } = {}) {
  if (!previewUrl) throw new WorkshopError("this workshop item has no preview image");

  const res = await fetch(previewUrl, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new WorkshopError(`preview download failed: ${res.status} ${res.statusText}`);

  const original = Buffer.from(await res.arrayBuffer());
  if (!original.length) throw new WorkshopError("preview download was empty");

  const sourceExt = sniffImage(original);
  if (sourceExt === "bin") throw new WorkshopError("preview download was not a recognised image");

  let buffer = original;
  let ext = sourceExt;
  let note;
  if (format === "png") {
    const converted = await toPng(original, sourceExt);
    buffer = converted.buffer;
    ext = converted.ext;
    note = converted.reason;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${basename}.${ext}`);
  fs.writeFileSync(file, buffer);

  // Re-ingesting with a different --image-format would otherwise leave the old
  // <id>.png sitting next to the new <id>.jpg, and the record only points at
  // one of them.
  for (const name of fs.readdirSync(outDir)) {
    if (name === path.basename(file)) continue;
    if (!name.startsWith(`${basename}.`)) continue;
    if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(name)) continue;
    try { fs.unlinkSync(path.join(outDir, name)); } catch { /* best effort */ }
  }

  return { file, ext, sourceExt, bytes: buffer.length, originalBytes: original.length, note };
}

module.exports = {
  fetchDetails, assertCs2, downloadPreview, sniffImage, parseWorkshopId,
  WorkshopError, CS2_APP_ID,
};
