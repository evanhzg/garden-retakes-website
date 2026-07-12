import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const liveMatch = await prisma.webLiveMatch.findUnique({
      where: { ServerId: 1 }
    });

    if (!liveMatch) {
      return NextResponse.json({ live: false });
    }

    // Check if the match is stale (no updates for > 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (liveMatch.UpdatedAtUtc < fiveMinutesAgo) {
      return NextResponse.json({ live: false, stale: true });
    }

    const data = JSON.parse(liveMatch.Data);
    return NextResponse.json({ live: true, data });
  } catch (error) {
    console.error('Failed to fetch live match:', error);
    return NextResponse.json({ live: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
