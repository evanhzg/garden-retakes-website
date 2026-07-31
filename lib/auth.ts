import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Minimal, dependency-free session: an HMAC-signed cookie carrying the player's
// SteamID64 (+ optional display name/avatar). No DB session table, no next-auth.

export const SESSION_COOKIE = "garden_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type Session = {
  steamId: string;
  name?: string;
  avatar?: string;
  iat: number;
};

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error("AUTH_SECRET is not set — required to sign login sessions.");
  }
  return value;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function createSessionToken(payload: Omit<Session, "iat">): string {
  const body = b64url(JSON.stringify({ ...payload, iat: Date.now() }));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const expected = createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
  } catch {
    return null;
  }
}

/**
 * Local development auto-login.
 *
 * Steam OpenID cannot round-trip to http://localhost, so signing in on a dev
 * machine is impossible. When DEV_AUTH_STEAMID is set, that SteamID is treated
 * as the signed-in user.
 *
 * Two independent guards, because this must be impossible to reach in
 * production and one of them alone is not enough:
 *
 *  1. NODE_ENV must not be "production". `npm start` sets it, so any real
 *     deployment fails this check even if the variable below leaked into its
 *     environment.
 *  2. DEV_AUTH_STEAMID must be explicitly present. It lives only in the local
 *     .env, which is gitignored.
 *
 * Losing either guard leaves the other standing.
 */
function devSession(): Session | null {
  if (process.env.NODE_ENV === "production") return null;
  const id = process.env.DEV_AUTH_STEAMID;
  if (!id || !/^\d{17}$/.test(id)) return null;
  return {
    steamId: id,
    name: process.env.DEV_AUTH_NAME || undefined,
    iat: Date.now(),
  };
}

/** Read the current session (safe to call in RSC and route handlers). */
export function getSession(): Session | null {
  try {
    const real = verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
    // A real cookie always wins, so logging in properly still works locally.
    return real ?? devSession();
  } catch {
    return devSession();
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};
