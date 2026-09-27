import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_MAP } from "@/lib/siteMap";

// Rebuilt at most hourly: players and tournaments change, but a crawler does
// not need them to the minute, and every build of this reads three tables.
export const revalidate = 3600;

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.retakes.fr").replace(/\/$/, "");

/**
 * /sitemap.xml — the public pages from lib/siteMap.ts, plus every player seen
 * in the last six months, every non-draft tournament and every team.
 *
 * A database failure degrades to the static pages rather than a 500: a broken
 * sitemap makes a crawler back off the whole site.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    ...SITE_MAP.filter((e) => e.index && !e.auth).map((e) => ({
      url: `${BASE}${e.href}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: e.group === "compete" || e.group === "play" ? 0.8 : 0.6,
    })),
  ];

  try {
    const since = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 180);
    const [players, tournaments, teams] = await Promise.all([
      prisma.playerProfile.findMany({
        where: { LastSeenAtUtc: { gte: since } },
        select: { SteamId: true, LastSeenAtUtc: true },
        orderBy: { LastSeenAtUtc: "desc" },
        take: 2000,
      }),
      prisma.tournament.findMany({
        where: { State: { not: "draft" } },
        select: { Slug: true, UpdatedAt: true },
        take: 500,
      }),
      prisma.gardenTeam.findMany({ select: { Slug: true, UpdatedAt: true }, take: 500 }),
    ]);

    pages.push(
      ...players.map((p) => ({
        url: `${BASE}/players/${p.SteamId.toString()}`,
        lastModified: p.LastSeenAtUtc,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
      ...tournaments.map((t) => ({
        url: `${BASE}/tournaments/${t.Slug}`,
        lastModified: t.UpdatedAt,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
      ...teams.map((t) => ({
        url: `${BASE}/teams/${t.Slug}`,
        lastModified: t.UpdatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.4,
      })),
    );
  } catch {
    // Static pages only; see above.
  }

  return pages;
}
