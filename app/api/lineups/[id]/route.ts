import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid lineup ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { shotType, url } = body;

    if (!url || !shotType || !["aim", "stand", "result"].includes(shotType)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const data: any = {};
    if (shotType === "aim") data.ShotAim = url;
    else if (shotType === "stand") data.ShotStand = url;
    else if (shotType === "result") data.ShotResult = url;

    const updated = await prisma.gardenNade.update({
      where: { Id: id },
      data
    });

    return NextResponse.json({ success: true, lineup: updated });
  } catch (error) {
    console.error("Lineup update error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
