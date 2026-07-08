import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

async function fetchProfile(steamId: string): Promise<{ name?: string; avatar?: string }> {
  const key = process.env.STEAM_API_KEY;
  if (!key) return {};
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`,
      { cache: "no-store" }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const player = data?.response?.players?.[0];
    return { name: player?.personaname, avatar: player?.avatarfull };
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const origin = process.env.SITE_URL ?? new URL(request.url).origin;
  const incoming = new URL(request.url).searchParams;

  // Verify the assertion with Steam (check_authentication).
  const verify = new URLSearchParams(incoming);
  verify.set("openid.mode", "check_authentication");
  const verifyRes = await fetch(STEAM_OPENID, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verify.toString(),
    cache: "no-store",
  });
  const verifyText = await verifyRes.text();

  const claimedId = incoming.get("openid.claimed_id") ?? "";
  const match = claimedId.match(CLAIMED_ID_RE);

  if (!verifyText.includes("is_valid:true") || !match) {
    return NextResponse.redirect(`${origin}/inventory?auth=failed`);
  }

  const steamId = match[1];
  const profile = await fetchProfile(steamId);
  const token = createSessionToken({ steamId, ...profile });

  const response = NextResponse.redirect(`${origin}/inventory`);
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
