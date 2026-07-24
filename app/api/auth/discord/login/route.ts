import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeUrl, discordConfigured, signState } from "@/lib/discord";

export const dynamic = "force-dynamic";

// Kick off the Discord OAuth link. Requires a signed-in Steam session so we know
// which account to attach the Discord identity to.
export async function GET(request: Request) {
  const origin = process.env.SITE_URL ?? new URL(request.url).origin;
  const session = getSession();
  if (!session) return NextResponse.redirect(`${origin}/profile?discord=signin`);
  if (!discordConfigured()) return NextResponse.redirect(`${origin}/profile?discord=unconfigured`);

  const state = signState(session.steamId);
  return NextResponse.redirect(authorizeUrl(origin, state));
}
