import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getAdminContext, AdminLevel } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const ctx = await getAdminContext(key);
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const suggestions = await prisma.gardenCaptureSuggestion.findMany({
      where: { Status: "pending" },
      orderBy: { CreatedAt: "asc" },
    });
    // BigInt serialization fix
    const serialized = suggestions.map((s) => ({
      ...s,
      SubmittedBy: s.SubmittedBy.toString(),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error("Failed to fetch suggestions:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { lineupId, suggestedSetpos, notes } = body;

    if (!lineupId) {
      return NextResponse.json({ error: "Missing lineupId" }, { status: 400 });
    }

    const suggestion = await prisma.gardenCaptureSuggestion.create({
      data: {
        LineupId: lineupId,
        SuggestedSetpos: suggestedSetpos || null,
        Notes: notes || null,
        SubmittedBy: BigInt(session.steamId),
      },
    });

    return NextResponse.json({
      ...suggestion,
      SubmittedBy: suggestion.SubmittedBy.toString(),
    });
  } catch (error) {
    console.error("Failed to create suggestion:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status, key } = body;
  const ctx = await getAdminContext(key);
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {

    if (!id || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const suggestion = await prisma.gardenCaptureSuggestion.findUnique({
      where: { Id: id },
    });

    if (!suggestion) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.gardenCaptureSuggestion.update({
        where: { Id: id },
        data: { Status: status },
      });

      if (status === "approved" && suggestion.SuggestedSetpos) {
        // Parse setpos string, e.g. "setpos -114.77 -1172.93 116.03; setang -15.54 -168.04 0.0"
        const setposMatch = suggestion.SuggestedSetpos.match(
          /setpos\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/
        );
        const setangMatch = suggestion.SuggestedSetpos.match(
          /setang\s+([-\d.]+)\s+([-\d.]+)/
        );

        if (setposMatch && setangMatch) {
          const StandX = parseFloat(setposMatch[1]);
          const StandY = parseFloat(setposMatch[2]);
          const StandZ = parseFloat(setposMatch[3]);
          const Pitch = parseFloat(setangMatch[1]);
          const Yaw = parseFloat(setangMatch[2]);

          await tx.gardenNade.update({
            where: { Id: suggestion.LineupId },
            data: {
              StandX,
              StandY,
              StandZ,
              Pitch,
              Yaw,
              Verified: true,
            },
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update suggestion:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
