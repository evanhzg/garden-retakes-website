import { NextResponse } from "next/server";

const STEAM_OPENID = "https://steamcommunity.com/openid/login";

export async function GET(request: Request) {
  const origin = process.env.SITE_URL ?? new URL(request.url).origin;
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${origin}/api/auth/steam/callback`,
    "openid.realm": origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return NextResponse.redirect(`${STEAM_OPENID}?${params.toString()}`);
}
