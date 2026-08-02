import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// The admin log as data, so it can be a tab in the panel rather than a separate
// key-protected page you had to know the URL of. /admin-log still works.

export async function GET(req: Request) {
  const ctx = await getAdminContext(new URL(req.url).searchParams.get("key"));
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const entries = await prisma.gardenAdminLogEntry.findMany({
    orderBy: { Id: "desc" },
    take: 200,
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.Id.toString(),
      at: e.AtUtc.toISOString(),
      actor: e.ActorName || e.ActorSteamId.toString(),
      action: e.Action,
      target: e.TargetName || (e.TargetSteamId ? e.TargetSteamId.toString() : null),
      detail: e.Detail || null,
    })),
  });
}
