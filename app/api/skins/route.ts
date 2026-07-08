import { NextResponse } from "next/server";
import { getSkinsForWeapon } from "@/lib/economy";

export const revalidate = 86400;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const weapon = url.searchParams.get("weapon");
  const def = weapon ? Number.parseInt(weapon, 10) : NaN;

  if (!Number.isFinite(def)) {
    return NextResponse.json(
      { error: "numeric `weapon` (def) query parameter required" },
      { status: 400 }
    );
  }

  return NextResponse.json(getSkinsForWeapon(def));
}
