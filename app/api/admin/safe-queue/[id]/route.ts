import { NextResponse } from "next/server";
import { getAdminContext, AdminLevel } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  const ctx = await getAdminContext(key);
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { status } = body;
  if (status !== "APPROVED" && status !== "REJECTED") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const request = await prisma.gardenSafeRequest.findUnique({ where: { Id: id } });
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (request.Status !== "PENDING") {
    return NextResponse.json({ error: "Request already processed" }, { status: 400 });
  }

  await prisma.gardenSafeRequest.update({
    where: { Id: id },
    data: { Status: status },
  });

  const targetStatus = status === "APPROVED" ? "PROBING" : "REJECTED";

  const safeStatus = await prisma.gardenSafeStatus.upsert({
    where: { SteamId: request.SteamId },
    create: {
      SteamId: request.SteamId,
      Status: targetStatus,
    },
    update: {
      Status: targetStatus,
    },
  });

  return NextResponse.json({
    success: true,
    safeStatus: { ...safeStatus, SteamId: safeStatus.SteamId.toString() }
  });
}
