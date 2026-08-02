import { NextResponse } from "next/server";
import { cs2Updates } from "@/lib/feed";

export const dynamic = "force-dynamic";

/** CS2 patch notes and news, straight from Steam. No API key needed. */
export async function GET() {
  return NextResponse.json(
    { updates: await cs2Updates() },
    { headers: { "cache-control": "public, max-age=300" } }
  );
}
