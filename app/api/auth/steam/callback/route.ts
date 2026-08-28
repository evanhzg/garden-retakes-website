import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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

/**
 * Where we are willing to send someone after login.
 *
 * This was `incoming.get("returnTo") || "/"`, concatenated straight onto the
 * origin — so `?returnTo=//evil.com` produced `https://retakes.fr//evil.com`,
 * which is protocol-relative and takes the browser off the site entirely. That
 * is an open redirect through a genuine Steam login: the URL is ours, the login
 * is real, and the page you land on is somebody else's. Exactly the shape a
 * phishing link wants.
 *
 * A single leading slash, and no backslash — browsers normalise `/\` to `//`,
 * so allowing it would reopen the same hole one character along.
 */
function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

/**
 * Writes down who just signed in.
 *
 * Steam hands us a name and an avatar on every login and this route used to put
 * both in the session cookie and nowhere else. The cookie is readable by
 * exactly one browser, so to the rest of the site that player had no name: a
 * friend who signed in on the website but had never played on the game server
 * had no PlayerProfile row either, and /api/players/resolve — which reads that
 * table — fell through to its last resort and called them "Player 3631".
 *
 * The Discord and Google callbacks already write PlayerProfile for the same
 * reason. This is the one that did not.
 *
 * Best effort on purpose. A player who has signed in should be let in even if
 * the write fails; the cost of failing is a name, and the cost of throwing here
 * is a login that appears broken.
 */
async function rememberPlayer(steamId: string, profile: { name?: string; avatar?: string }) {
  const id = BigInt(steamId);
  const now = new Date();

  try {
    if (profile.name) {
      // LastKnownName is also written by the plugin, with the same value — it is
      // the Steam persona either way. A GardenNameOverride still wins over both,
      // which is what resolveNames() is for.
      await prisma.playerProfile.upsert({
        where: { SteamId: id },
        update: { LastKnownName: profile.name, LastSeenAtUtc: now },
        create: {
          SteamId: id,
          LastKnownName: profile.name,
          FirstSeenAtUtc: now,
          LastSeenAtUtc: now,
        },
      });
    }

    if (profile.avatar) {
      await prisma.gardenWebProfile.upsert({
        where: { SteamId: id },
        update: { AvatarUrl: profile.avatar },
        create: { SteamId: id, AvatarUrl: profile.avatar },
      });
    }
  } catch {
    // See above: a login is not worth failing over a display name.
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

  const returnTo = safeReturnTo(incoming.get("returnTo"));

  if (!verifyText.includes("is_valid:true") || !match) {
    return NextResponse.redirect(`${origin}${returnTo === "/" ? "/inventory" : returnTo}?auth=failed`);
  }

  const steamId = match[1];
  const profile = await fetchProfile(steamId);

  await rememberPlayer(steamId, profile);

  const token = createSessionToken({ steamId, ...profile });

  const response = NextResponse.redirect(`${origin}${returnTo}`);
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
