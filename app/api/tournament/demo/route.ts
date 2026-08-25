import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The plugin reporting that a match's demo has finished recording.
//
// This records that the file EXISTS, not that it is downloadable — the file is
// still on the game server at this point, and moving it is the collector's job.
// Keeping those two facts separate is deliberate: a match page that links a demo
// nobody can fetch yet is worse than one that says a demo is coming.

type Incoming = {
  apiKey?: string;
  matchKey?: string;
  map?: string;
  file?: string;
  scoreA?: number;
  scoreB?: number;
};

export async function POST(req: Request) {
  let body: Incoming;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const key = process.env.INVSIM_API_KEY;
  if (!key || body.apiKey !== key) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const matchKey = (body.matchKey ?? "").trim();
  const file = (body.file ?? "").trim();

  if (!matchKey || !file) {
    return NextResponse.json({ error: "matchKey and file are required." }, { status: 400 });
  }

  // A filename becomes a path somewhere downstream. Anything with a separator or
  // a traversal in it is refused rather than sanitised, because a demo name that
  // needed sanitising is a demo name the plugin did not generate.
  if (file.includes("/") || file.includes("\\") || file.includes("..")) {
    return NextResponse.json({ error: "Bad filename." }, { status: 400 });
  }

  const match = await prisma.tournamentMatch.findUnique({ where: { MatchKey: matchKey } });

  if (!match) {
    // Worth recording anyway rather than dropping: a demo whose match row is
    // missing is exactly the case somebody will want the file for.
    return NextResponse.json({ ok: true, attached: false, reason: "no match with that key" });
  }

  const mapName = (body.map ?? "").trim();

  // Attach it to the map it was recorded on when that is unambiguous, and to the
  // last unfinished one otherwise.
  const target =
    (mapName
      ? await prisma.tournamentMatchMap.findFirst({
          where: { MatchId: match.Id, Map: mapName, DemoFile: null },
          orderBy: { Ordinal: "asc" },
        })
      : null) ??
    (await prisma.tournamentMatchMap.findFirst({
      where: { MatchId: match.Id, DemoFile: null },
      orderBy: { Ordinal: "asc" },
    }));

  if (!target) {
    return NextResponse.json({ ok: true, attached: false, reason: "no map slot free" });
  }

  await prisma.tournamentMatchMap.update({
    where: { Id: target.Id },
    data: { DemoFile: file.slice(0, 160) },
  });

  return NextResponse.json({ ok: true, attached: true, mapId: target.Id });
}
