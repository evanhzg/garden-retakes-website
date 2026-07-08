import { NextResponse } from "next/server";
import { getWeaponCatalog } from "@/lib/economy";

export const revalidate = 86400;

export async function GET() {
  return NextResponse.json(getWeaponCatalog());
}
