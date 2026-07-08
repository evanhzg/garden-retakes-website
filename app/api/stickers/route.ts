import { NextResponse } from "next/server";
import { searchStickers } from "@/lib/economy";

export const revalidate = 86400;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  return NextResponse.json(searchStickers(query));
}
