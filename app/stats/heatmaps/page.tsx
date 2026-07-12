import { prisma } from "@/lib/db";
import HeatmapClient from "./HeatmapClient";

export const dynamic = "force-dynamic";

export default async function HeatmapPage() {
  const profiles = await prisma.playerProfile.findMany({
    select: { SteamId: true, LastKnownName: true },
    take: 50,
    orderBy: { LastSeenAtUtc: "desc" },
  });
  const users = profiles.map(p => ({
    SteamId: p.SteamId,
    Name: p.LastKnownName,
  }));

  return (
    <main className="container">
      <div className="panel">
        <h2 className="text-2xl font-black mb-4 uppercase tracking-wider bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Advanced Positional Heatmaps
        </h2>
        <HeatmapClient users={users} />
      </div>
    </main>
  );
}
