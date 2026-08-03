import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveNames, nameFrom } from "@/lib/names";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Player lookup for the @-mention picker. Signed-out callers get nothing. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 1) return NextResponse.json({ players: [] });

  // Names live in several places (profile, override, web profile), so the
  // cheapest correct approach is to resolve a modest candidate set and filter
  // on the resolved name — the same name the comment will end up showing.
  const rows = await prisma.playerProfile.findMany({ select: { SteamId: true }, take: 400 });
  const ids = rows.map((r) => r.SteamId);
  const names = await resolveNames(ids);

  const players = ids
    .map((id) => ({ steamId: id.toString(), name: nameFrom(names, id) }))
    .filter((p) => p.name.toLowerCase().includes(q))
    .slice(0, 8);

  return NextResponse.json({ players });
}
