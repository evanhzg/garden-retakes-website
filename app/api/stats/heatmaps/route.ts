import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const steamId = searchParams.get('steamId');
  const mapName = searchParams.get('mapName');

  if (!steamId || !mapName) {
    return NextResponse.json({ error: 'Missing steamId or mapName' }, { status: 400 });
  }

  try {
    const heatmaps = await prisma.gardenHeatmap.findMany({
      where: {
        MapName: mapName,
        OR: [
          { VictimSteamId: BigInt(steamId) },
          { AttackerSteamId: BigInt(steamId) },
        ],
      },
      orderBy: { CreatedAtUtc: 'desc' },
      take: 1000, // Limit to recent 1000 events to prevent massive payload
    });

    // Serialize BigInt for JSON
    const serialized = heatmaps.map(h => ({
      ...h,
      Id: h.Id.toString(),
      VictimSteamId: h.VictimSteamId.toString(),
      AttackerSteamId: h.AttackerSteamId.toString(),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching heatmaps:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
