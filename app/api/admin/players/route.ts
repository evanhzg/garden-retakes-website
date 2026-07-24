import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// W2: searchable list of everyone who ever joined, annotated with their
// website role / ban / name-override state. Moderator+ (or web key).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const q = (url.searchParams.get("q") ?? "").trim();
  const take = 60;

  const where = q
    ? /^\d{16,20}$/.test(q)
      ? { SteamId: BigInt(q) }
      : { LastKnownName: { contains: q } }
    : {};

  const profiles = await prisma.playerProfile.findMany({
    where,
    orderBy: { LastSeenAtUtc: "desc" },
    take,
    select: { SteamId: true, LastKnownName: true, LastSeenAtUtc: true },
  });

  const ids = profiles.map((p) => p.SteamId);
  const [admins, bans, overrides] = await Promise.all([
    prisma.gardenAdmin.findMany({ where: { SteamId: { in: ids } } }),
    prisma.gardenBan.findMany({ where: { SteamId: { in: ids } } }),
    prisma.gardenNameOverride.findMany({ where: { SteamId: { in: ids } } }),
  ]);
  const adminBy = new Map(admins.map((a) => [a.SteamId.toString(), a.Level]));
  const banBy = new Map(bans.map((b) => [b.SteamId.toString(), b]));
  const ovBy = new Map(overrides.map((o) => [o.SteamId.toString(), o.Name]));

  const players = profiles.map((p) => {
    const key = p.SteamId.toString();
    const ban = banBy.get(key);
    return {
      steamId: key,
      name: ovBy.get(key) ?? p.LastKnownName,
      steamName: p.LastKnownName,
      hasOverride: ovBy.has(key),
      lastSeen: p.LastSeenAtUtc,
      role: adminBy.get(key) ?? 0,
      banned: Boolean(ban),
      banReason: ban?.Reason ?? null,
      banExpires: ban?.ExpiresAtUtc ?? null,
    };
  });

  return NextResponse.json({ players, viewerLevel: ctx.level });
}
