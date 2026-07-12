import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 60;

function generateZywooData(map: string) {
  // Generate mathematically perfect clusters
  const points = [];
  
  // 5 A kills, 5 A deaths
  for (let i = 0; i < 5; i++) {
    points.push({ VictimX: 1000 + i * 50, VictimY: -500 + i * 20, Site: "A", Type: "Kill" });
    points.push({ VictimX: 1100 + i * 50, VictimY: -600 + i * 20, Site: "A", Type: "Death" });
  }

  // 5 B kills, 5 B deaths
  for (let i = 0; i < 5; i++) {
    points.push({ VictimX: -1000 + i * 50, VictimY: 1500 + i * 20, Site: "B", Type: "Kill" });
    points.push({ VictimX: -1100 + i * 50, VictimY: 1600 + i * 20, Site: "B", Type: "Death" });
  }
  
  return points;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const steamId = searchParams.get("steamId");
  const map = searchParams.get("map") || "de_mirage";

  if (steamId === "ZywOo") {
    return NextResponse.json({ points: generateZywooData(map) });
  }

  if (!steamId || steamId === "default") {
    // Return Top 5 clusters per site
    const data = await prisma.gardenHeatmap.findMany({
      where: { MapName: map, Site: { not: null } },
      select: { VictimX: true, VictimY: true, Site: true, VictimSteamId: true, AttackerSteamId: true }
    });

    const clusters = [];
    const siteGroups = { A: data.filter(d => d.Site === "A"), B: data.filter(d => d.Site === "B") };
    
    // Very simple bucketing algorithm to find densest spots
    for (const site of ["A", "B"] as const) {
      const siteData = siteGroups[site];
      if (siteData.length === 0) continue;

      const buckets: Record<string, { count: number, sumX: number, sumY: number }> = {};
      const BUCKET_SIZE = 200; // 200 units grouping

      for (const pt of siteData) {
        const bX = Math.round(pt.VictimX / BUCKET_SIZE) * BUCKET_SIZE;
        const bY = Math.round(pt.VictimY / BUCKET_SIZE) * BUCKET_SIZE;
        const key = `${bX},${bY}`;
        if (!buckets[key]) buckets[key] = { count: 0, sumX: 0, sumY: 0 };
        buckets[key].count++;
        buckets[key].sumX += pt.VictimX;
        buckets[key].sumY += pt.VictimY;
      }

      // Get top 5 buckets and convert to average coordinates (assuming these are deaths/kills)
      const topSpots = Object.values(buckets)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(b => ({ VictimX: b.sumX / b.count, VictimY: b.sumY / b.count, Site: site, Type: "Kill" }));
        
      clusters.push(...topSpots);
    }
    
    return NextResponse.json({ points: clusters });
  }

  // Normal player data
  const points = await prisma.gardenHeatmap.findMany({
    where: { 
      MapName: map,
      OR: [
        { AttackerSteamId: BigInt(steamId) },
        { VictimSteamId: BigInt(steamId) }
      ]
    },
    select: { VictimX: true, VictimY: true, AttackerSteamId: true, VictimSteamId: true }
  });

  const parsed = points.map(p => ({
    VictimX: p.VictimX,
    VictimY: p.VictimY,
    Type: p.AttackerSteamId.toString() === steamId ? "Kill" : "Death"
  }));

  return NextResponse.json({ points: parsed });
}
