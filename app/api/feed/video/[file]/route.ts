import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { CLIP_DIR, CLIP_TYPES } from "@/lib/feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Serves an uploaded clip, with Range support so the browser can seek without
// pulling the whole file — a <video> scrub bar is unusable otherwise.
//
// Under data/ rather than public/ because Next serves public/ from a build-time
// manifest and a file written at runtime 404s until the next deploy.

const MIME = Object.fromEntries(Object.entries(CLIP_TYPES).map(([mime, ext]) => [ext, mime]));

export async function GET(req: Request, { params }: { params: { file: string } }) {
  // Only names this app generated: <steamid64>-<timestamp>.<ext>.
  const name = decodeURIComponent(params.file);
  const m = /^(\d{17})-(\d+)\.(mp4|webm|mov)$/.exec(name);
  if (!m) return new Response("Not found", { status: 404 });

  const file = path.join(CLIP_DIR, name);
  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const type = MIME[m[3]] ?? "application/octet-stream";
  const range = req.headers.get("range");

  if (range) {
    const hit = /bytes=(\d*)-(\d*)/.exec(range);
    const start = hit && hit[1] ? Number(hit[1]) : 0;
    const end = hit && hit[2] ? Math.min(Number(hit[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        "content-type": type,
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "content-type": type,
      "content-length": String(size),
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
