import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";
import { presign } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The queue the local highlight pipeline drains.
 *
 * Two callers, two ways in:
 *   - the pipeline, with the shared key in x-api-key, which also gets a
 *     presigned download URL per demo;
 *   - an admin in a browser (?key= or an admin session), which does not, so a
 *     download link never lands in a page that could be shoulder-surfed.
 */
function keyMatches(req: Request): boolean {
  const given = req.headers.get("x-api-key");
  const accepted = [process.env.ADMIN_KEY, process.env.INVSIM_API_KEY].filter(Boolean);
  return Boolean(given && accepted.includes(given));
}

export async function GET(req: Request) {
  const viaKey = keyMatches(req);
  const ctx = viaKey ? null : await getAdminContext(new URL(req.url).searchParams.get("key"));
  if (!viaKey && (!ctx || ctx.level < AdminLevel.Admin)) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const rows = await prisma.feedDemo.findMany({
    where: { Status: { in: ["pending", "processing"] } },
    orderBy: { CreatedAt: "asc" },
    take: 25,
  });

  // A claim only ends when publish reports back, so anything that kills the run
  // in between — a crash, a Ctrl-C, a reboot mid-record — leaves the demo
  // claimed by a process that no longer exists. Past this long, assume nobody
  // is working on it and offer it again; the pipeline is idempotent, so the
  // worst case of being wrong is one demo recorded twice.
  //
  // Generous, because recording genuinely is slow: CS2 has to launch, seek and
  // render every highlight in real time.
  const STALE_MS = 90 * 60_000;
  const now = Date.now();
  const stalledSince = (d: (typeof rows)[number]) =>
    (d.ProcessingAt ?? d.ProcessedAt ?? d.CreatedAt).getTime();

  // Resolve uploader names so the admin list is readable rather than a column
  // of 17-digit numbers.
  const { resolveNames, nameFrom } = await import("@/lib/names");
  const names = await resolveNames(rows.map((r) => r.SteamId));

  return NextResponse.json({
    demos: rows.map((d) => {
      const stalled = d.Status === "processing" && now - stalledSince(d) > STALE_MS;
      return {
        id: d.Id,
        fileName: d.FileName,
        uploader: nameFrom(names, d.SteamId),
        uploaderSteamId: d.SteamId.toString(),
        focusSteamId: d.FocusSteamId?.toString() ?? null,
        rounds: d.Rounds,
        bytes: d.Bytes ? Number(d.Bytes) : null,
        status: d.Status,
        /** Claimed, but by a run that is not coming back. Free to pick up. */
        stalled,
        processingAt: d.ProcessingAt?.toISOString() ?? null,
        createdAt: d.CreatedAt.toISOString(),
        // Only the pipeline gets a way to actually fetch the file. A stalled
        // demo needs one too, or re-offering it would be an empty gesture — its
        // local copy went with whatever run died.
        downloadUrl: viaKey && d.ObjectKey ? presign("GET", d.ObjectKey, 6 * 3600) : undefined,
      };
    }),
  });
}
