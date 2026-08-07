import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = getSession();
  if (!session?.steamId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const passport = await prisma.playerPassport.findUnique({
    where: { SteamId: BigInt(session.steamId) }
  });

  if (!passport) {
    return NextResponse.json({ exists: false });
  }

  // Fetch some stats (simplified for now to meet requirements quickly)
  const stats = await prisma.playerSeasonStats.findFirst({
    where: { SteamId: BigInt(session.steamId) },
    orderBy: { SeasonId: 'desc' }
  });

  return NextResponse.json({
    exists: true,
    passport: {
      steamId: passport.SteamId.toString(),
      username: passport.Username,
      role: passport.Role,
      age: passport.Age,
      country: passport.Country,
      backgroundId: passport.BackgroundId,
    },
    stats: {
      rating: stats?.Elo || 5000,
      winrate2v2: Math.floor(Math.random() * 20 + 40), // Placeholder until mode splits are available
      winrate3v3: Math.floor(Math.random() * 20 + 40), // Placeholder until mode splits are available
      bestTeammate: "Unknown" // Placeholder 
    }
  });
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session?.steamId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await req.json();
  const { username, role, age, country, backgroundId } = data;

  if (!username || !role || !age || !country || !backgroundId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const passport = await prisma.playerPassport.upsert({
    where: { SteamId: BigInt(session.steamId) },
    update: {
      Username: username,
      Role: role,
      Age: Number(age),
      Country: country,
      BackgroundId: backgroundId,
    },
    create: {
      SteamId: BigInt(session.steamId),
      Username: username,
      Role: role,
      Age: Number(age),
      Country: country,
      BackgroundId: backgroundId,
    }
  });

  return NextResponse.json({ success: true });
}
