import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getAdminContext } from "@/lib/adminAuth";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  const ctx = await getAdminContext(key);
  if (ctx.level < 1) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const maps = await prisma.gardenMap.findMany({
    orderBy: { MapName: "asc" },
  });

  return NextResponse.json({ maps });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { key, mode, mapName, workshopId } = body;
  const ctx = await getAdminContext(key);
  if (ctx.level < 1) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!mode || !mapName) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // Fetch workshop info if available
  let imageUrl = null;
  if (workshopId) {
    try {
      const form = new URLSearchParams();
      form.append("itemcount", "1");
      form.append("publishedfileids[0]", workshopId);
      const res = await fetch("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.response?.publishedfiledetails?.[0]?.preview_url) {
        imageUrl = data.response.publishedfiledetails[0].preview_url;
      }
    } catch (err) {
      console.error(err);
    }
  }

  const map = await prisma.gardenMap.create({
    data: {
      Mode: mode,
      MapName: mapName,
      WorkshopId: workshopId || null,
      ImageUrl: imageUrl,
    },
  });

  return NextResponse.json({ map });
}
