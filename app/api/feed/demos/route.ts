import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { demoKey, presign, r2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Demo submissions.
//
// GET  — the caller's own submissions, for the "pending" list.
// POST — create a row and hand back a presigned PUT so the browser can upload
//        straight to R2. Nothing large ever passes through this app: Vercel
//        caps a function's request body at 4.5 MB and a demo is 100-300 MB.

/** Demos above this are almost certainly not a single CS2 match. */
const MAX_BYTES = 500 * 1024 * 1024;

/** "5, 7,12" -> "5,7,12", rejecting anything that is not a round number. */
function cleanRounds(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const rounds = raw
    .split(",")
    .map((r) => Number(r.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 60);
  return rounds.length ? Array.from(new Set(rounds)).sort((a, b) => a - b).join(",") : null;
}

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const rows = await prisma.feedDemo.findMany({
    where: { SteamId: BigInt(session.steamId) },
    orderBy: { CreatedAt: "desc" },
    take: 25,
  });

  return NextResponse.json({
    demos: rows.map((d) => ({
      id: d.Id,
      fileName: d.FileName,
      rounds: d.Rounds,
      focusSteamId: d.FocusSteamId?.toString() ?? null,
      status: d.Status,
      note: d.Note,
      clipCount: d.ClipCount,
      bytes: d.Bytes ? Number(d.Bytes) : null,
      createdAt: d.CreatedAt.toISOString(),
      processedAt: d.ProcessedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in to upload a demo." }, { status: 401 });
  if (!r2Configured()) {
    return NextResponse.json({ error: "Demo uploads are not configured on this server." }, { status: 503 });
  }

  let body: { fileName?: string; bytes?: number; rounds?: string; focusSteamId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const fileName = String(body.fileName ?? "").trim();
  if (!/\.dem$/i.test(fileName)) {
    return NextResponse.json({ error: "That is not a .dem file." }, { status: 400 });
  }
  const bytes = Number(body.bytes ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return NextResponse.json({ error: "Unknown file size." }, { status: 400 });
  }
  if (bytes > MAX_BYTES) {
    return NextResponse.json(
      { error: `${(bytes / 1024 / 1024).toFixed(0)} MB is over the ${MAX_BYTES / 1024 / 1024} MB limit.` },
      { status: 413 }
    );
  }

  // Whose plays to cut: an explicit SteamID64, else the uploader's own. The
  // pipeline falls back again if that player does not appear in the demo.
  const focus =
    typeof body.focusSteamId === "string" && /^\d{17}$/.test(body.focusSteamId.trim())
      ? BigInt(body.focusSteamId.trim())
      : BigInt(session.steamId);

  const row = await prisma.feedDemo.create({
    data: {
      SteamId: BigInt(session.steamId),
      FileName: fileName.slice(0, 255),
      Bytes: BigInt(Math.round(bytes)),
      Rounds: cleanRounds(body.rounds),
      FocusSteamId: focus,
      Status: "uploading",
    },
  });

  const key = demoKey(row.Id, fileName);
  await prisma.feedDemo.update({ where: { Id: row.Id }, data: { ObjectKey: key } });

  // Generous window: a 250 MB upload on a domestic connection is not quick.
  const uploadUrl = presign("PUT", key, 6 * 3600);
  if (!uploadUrl) {
    await prisma.feedDemo.update({ where: { Id: row.Id }, data: { Status: "failed", Note: "could not sign upload" } });
    return NextResponse.json({ error: "Could not prepare the upload." }, { status: 500 });
  }

  return NextResponse.json({ id: row.Id, uploadUrl });
}
