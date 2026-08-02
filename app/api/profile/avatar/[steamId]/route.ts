import { promises as fs } from "node:fs";
import path from "node:path";
import { AVATAR_DIR } from "@/lib/avatars";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Serves a player's uploaded avatar. Public by design — these are rendered on
// the ladder, match pages and every profile.

export async function GET(_req: Request, { params }: { params: { steamId: string } }) {
  // Only ever a SteamID64, so there is no path to traverse.
  if (!/^\d{17}$/.test(params.steamId)) return new Response("Not found", { status: 404 });

  let body: Buffer;
  try {
    body = await fs.readFile(path.join(AVATAR_DIR, `${params.steamId}.png`));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "image/png",
      "content-length": String(body.length),
      // The stored URL carries a ?v= cache buster, so this can be cached hard.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
