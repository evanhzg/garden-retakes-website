import { prisma } from "@/lib/db";
import HeatmapClient from "./HeatmapClient";

export const dynamic = "force-dynamic";

export default async function HeatmapPage() {
  const users = await prisma.playerProfile.findMany({
    select: { SteamId: true, Name: true, AvatarUrl: true },
    take: 50 // In real app, we might paginate or search
  });

  return (
    <main className="container">
      <div className="panel">
        <h2 className="text-2xl font-black mb-4 uppercase tracking-wider bg-gradient-to-r from-amber-400 to-red-400 bg-clip-text text-transparent">
          Advanced Positional Heatmaps
        </h2>
        <HeatmapClient users={users} />
      </div>
    </main>
  );
}
