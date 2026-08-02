import { promises as fs } from "node:fs";
import path from "node:path";
import { LOCAL_DIR, safeVpkName } from "@/lib/customSkins";

// Public download for an uploaded skin VPK, so players can install it locally.
//
// This used to be a second copy written into public/fastdl/. That silently did
// not work: Next serves public/ from a manifest taken at build time, so a file
// written there at runtime 404s until the next deploy. Serving it from the one
// stored copy is both correct and one file rather than two.
//
// Deliberately unauthenticated — the point is that any player on the server can
// fetch it. Only names that came out of safeVpkName are ever accepted.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const file = safeVpkName(decodeURIComponent(params.file));
  if (!file) return new Response("Not found", { status: 404 });

  let body: Buffer;
  try {
    body = await fs.readFile(path.join(LOCAL_DIR, file));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(body.length),
      "content-disposition": `attachment; filename="${file}"`,
      // Uploads are replaced under the same name when a finish is re-packed,
      // so this must not be cached hard.
      "cache-control": "no-cache",
    },
  });
}
