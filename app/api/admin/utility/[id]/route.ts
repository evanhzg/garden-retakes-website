import { NextRequest, NextResponse } from "next/server";
import { getAdminContext, AdminLevel } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const ctx = await getAdminContext(body.key);
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const updateData: any = {};

    if (body.ShotStand !== undefined) updateData.ShotStand = body.ShotStand;
    if (body.ShotAim !== undefined) updateData.ShotAim = body.ShotAim;
    if (body.ShotResult !== undefined) updateData.ShotResult = body.ShotResult;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.gardenNade.update({
      where: { Id: id },
      data: updateData,
    });

    return NextResponse.json({
      ...updated,
      AddedBySteamId: updated.AddedBySteamId?.toString() ?? null,
    });
  } catch (error) {
    console.error("Failed to update utility:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
