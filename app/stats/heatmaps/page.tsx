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
    <div className="panel">
      <HeatmapClient users={users} />
    </div>
  );
}
