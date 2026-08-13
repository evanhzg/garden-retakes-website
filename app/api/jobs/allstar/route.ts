import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && !req.headers.get("x-api-key")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all players with AllstarSync enabled and a username
  const profiles = await prisma.gardenWebProfile.findMany({
    where: {
      AllstarSync: true,
      AllstarUsername: { not: null }
    }
  });

  let imported = 0;

  for (const profile of profiles) {
    if (!profile.AllstarUsername) continue;

    try {
      // In a real implementation, we would call the Allstar Partner API here.
      // Since it requires a partner key, we will simulate fetching their clips.
      // E.g. const res = await fetch(`https://api.allstar.gg/v1/clips?username=${profile.AllstarUsername}`);
      
      // For now, this is a stub that represents the sync logic.
      // If we had the clips:
      // for (const clip of fetchedClips) {
      //   await prisma.feedClip.upsert({ ... })
      // }
      
      console.log(`Synced Allstar clips for ${profile.AllstarUsername}`);
    } catch (err) {
      console.error(`Failed to sync Allstar for ${profile.AllstarUsername}:`, err);
    }
  }

  return NextResponse.json({ ok: true, imported });
}
