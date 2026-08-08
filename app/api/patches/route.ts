import { NextResponse } from "next/server";
import { searchPatches } from "@/lib/economy";

export const revalidate = 86400;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const limitStr = url.searchParams.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : 80;
  return NextResponse.json(searchPatches(query, limit));
}
