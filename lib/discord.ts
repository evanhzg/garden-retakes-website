import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";

// Discord OAuth2 (identify scope) for linking a Discord account to the signed-in
// Steam session. Credentials come from the environment — the flow is inert (and
// the login route says so) until these are set:
//
//   DISCORD_CLIENT_ID       your app's client id
//   DISCORD_CLIENT_SECRET   your app's client secret
//   DISCORD_REDIRECT_URI    optional; defaults to <origin>/api/auth/discord/callback
//                           (must match a redirect registered on the Discord app)
//
// Reuses AUTH_SECRET to sign the CSRF `state` so no session store is needed.

const AUTHORIZE = "https://discord.com/api/oauth2/authorize";
const TOKEN = "https://discord.com/api/oauth2/token";
const USER = "https://discord.com/api/users/@me";

export function discordConfigured(): boolean {
  return !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

export function redirectUri(origin: string): string {
  return process.env.DISCORD_REDIRECT_URI || `${origin}/api/auth/discord/callback`;
}

function secret(): string {
  const v = process.env.AUTH_SECRET;
  if (!v) throw new Error("AUTH_SECRET is not set — required to sign Discord OAuth state.");
  return v;
}

// state = base64url(json).sig — carries the steamId we are linking to, plus a
// nonce and issue time, all signed so the callback can trust it.
export function signState(steamId: string): string {
  const body = Buffer.from(JSON.stringify({ steamId, n: randomBytes(8).toString("hex"), iat: Date.now() })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string | undefined): { steamId: string } | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  try {
    const expected = createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof payload.steamId !== "string") return null;
    if (Date.now() - Number(payload.iat) > 10 * 60 * 1000) return null; // 10 min
    return { steamId: payload.steamId };
  } catch {
    return null;
  }
}

export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID || "",
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "identify",
    state,
    prompt: "consent",
  });
  return `${AUTHORIZE}?${params.toString()}`;
}

export async function exchangeCode(origin: string, code: string): Promise<{ access_token: string } | null> {
  try {
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || "",
        client_secret: process.env.DISCORD_CLIENT_SECRET || "",
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(origin),
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export type DiscordUser = { id: string; name: string; avatar: string | null };

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser | null> {
  try {
    const res = await fetch(USER, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u || typeof u.id !== "string") return null;
    // global_name is the new display name; username is the @handle fallback.
    const name = u.global_name || u.username || "Discord user";
    const avatar = u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`
      : null;
    return { id: u.id, name: String(name).slice(0, 64), avatar };
  } catch {
    return null;
  }
}
