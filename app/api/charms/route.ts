import { NextResponse } from "next/server";
import { searchCharms } from "@/lib/economy";

export const revalidate = 86400;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const limitStr = url.searchParams.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : 80;
  return NextResponse.json(searchCharms(query, limit));
}
