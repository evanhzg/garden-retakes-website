import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAdminContext, AdminLevel } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { MatchId, TargetSteamId, Toxicity, Safeness, Comm, Teamplay } = body;

  if (typeof MatchId !== "string" || typeof TargetSteamId !== "string") {
    return NextResponse.json({ error: "Invalid MatchId or TargetSteamId" }, { status: 400 });
  }

  const scores = [Toxicity, Safeness, Comm, Teamplay];
  for (const s of scores) {
    if (typeof s !== "number" || s < 0 || s > 100) {
      return NextResponse.json({ error: "Scores must be numbers between 0 and 100" }, { status: 400 });
    }
  }

  const voterSteamId = BigInt(session.steamId);
  const targetId = BigInt(TargetSteamId);

  // Calculate weight
  let weight = 1.0;
  const adminCtx = await getAdminContext();
  if (adminCtx.level >= AdminLevel.Moderator) {
    weight = 2.0;
  } else {
    const voterStatus = await prisma.gardenSafeStatus.findUnique({
      where: { SteamId: voterSteamId },
    });
    if (voterStatus) {
      weight = Math.max(0.1, voterStatus.SafeScore / 50.0);
    }
  }

  const vote = await prisma.gardenMatchVote.create({
    data: {
      MatchId,
      VoterSteamId: voterSteamId,
      TargetSteamId: targetId,
      Toxicity,
      Safeness,
      Comm,
      Teamplay,
      Weight: weight,
    },
  });

  return NextResponse.json({
    success: true,
    vote: {
      ...vote,
      VoterSteamId: vote.VoterSteamId.toString(),
      TargetSteamId: vote.TargetSteamId.toString(),
    },
  });
}
