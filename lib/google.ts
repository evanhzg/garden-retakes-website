import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const USER = "https://www.googleapis.com/oauth2/v2/userinfo";

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(origin: string): string {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;
}

function secret(): string {
  const v = process.env.AUTH_SECRET;
  if (!v) throw new Error("AUTH_SECRET is not set.");
  return v;
}

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
    if (Date.now() - Number(payload.iat) > 10 * 60 * 1000) return null;
    return { steamId: payload.steamId };
  } catch {
    return null;
  }
}

export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
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
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
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

export type GoogleUser = { id: string; name: string; email: string | null; avatar: string | null };

export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser | null> {
  try {
    const res = await fetch(USER, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u || typeof u.id !== "string") return null;
    return { id: u.id, name: u.name || "Google User", email: u.email || null, avatar: u.picture || null };
  } catch {
    return null;
  }
}
