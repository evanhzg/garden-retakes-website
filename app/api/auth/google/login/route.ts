import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeUrl, googleConfigured, signState } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = process.env.SITE_URL ?? new URL(request.url).origin;
  const session = getSession();
  
  if (!googleConfigured()) return NextResponse.redirect(`${origin}/profile?google=unconfigured`);

  const returnTo = new URL(request.url).searchParams.get("returnTo") || "/";
  const statePayload = session ? session.steamId : `login|${returnTo}`;
  const state = signState(statePayload);
  return NextResponse.redirect(authorizeUrl(origin, state));
}
