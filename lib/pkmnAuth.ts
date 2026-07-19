import "server-only";
import { createHmac, randomBytes, timingSafeEqual, createHash } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Bearer-token auth for the standalone (Unity) Garden PKMN client. Deliberately
// separate from the website's cookie session (lib/auth.ts) — a web session
// token must never double as an API bearer token or vice versa, so every
// signature is computed over a domain-tagged string ("pkmn_access:" /
// "pkmn_ticket:"), not the raw payload.
//
// Pairing flow (device-authorization, RFC 8628-style — the same shape
// Steam/consoles use for TV & headless apps): the client asks for a short
// human code (POST /api/pkmn/auth/device/start), the player confirms it's
// them at pkmn.retakes.fr/link while already Steam-logged-in on the website,
// and the client polls (POST /api/pkmn/auth/device/poll) until it receives a
// long-lived bearer token. No password and no Steam credentials ever touch
// the game client.

const ACCESS_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days — refresh before this via /auth/refresh
const TICKET_TTL_MS = 60 * 1000; // realtime (Socket.IO) handshake ticket

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error("AUTH_SECRET is not set — required to sign PKMN API tokens.");
  }
  return value;
}

function sign(domain: string, body: string): string {
  return createHmac("sha256", secret()).update(`${domain}:${body}`).digest("base64url");
}

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(input: string): string {
  return Buffer.from(input, "base64url").toString();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function randomOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Human-facing pairing code, e.g. "TRNR-4821". Avoids ambiguous glyphs (0/O, 1/I). */
export function generateLinkCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
  return `${pick(letters, 4)}-${pick(digits, 4)}`;
}

/** Resolves the pkmn.* subdomain origin from SITE_URL (falls back to the request's origin). */
export function pkmnSiteOrigin(fallbackOrigin: string): string {
  try {
    const u = new URL(process.env.SITE_URL || fallbackOrigin);
    if (!u.hostname.startsWith("pkmn.")) u.hostname = `pkmn.${u.hostname}`;
    return u.origin;
  } catch {
    return fallbackOrigin;
  }
}

type AccessPayload = { steamId: string; jti: string; iat: number; exp: number };

function signAccessToken(payload: AccessPayload): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign("pkmn_access", body)}`;
}

function verifyAccessTokenSignature(token: string): AccessPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign("pkmn_access", body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body)) as AccessPayload;
    if (typeof payload.steamId !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Issues a new bearer token and persists it (hash only) as a revocable device session. */
export async function issueAccessToken(steamId: string, deviceName?: string) {
  const iat = Date.now();
  const exp = iat + ACCESS_TOKEN_TTL_MS;
  const jti = randomOpaqueToken(16);
  const token = signAccessToken({ steamId, jti, iat, exp });

  const row = await prisma.pkmnApiToken.create({
    data: {
      SteamId: BigInt(steamId),
      TokenHash: hashToken(token),
      DeviceName: deviceName?.trim().slice(0, 64) || null,
      ExpiresAtUtc: new Date(exp),
    },
  });

  return { token, expiresAt: exp, tokenId: row.Id };
}

export type PkmnAuthContext = { steamId: string; tokenId: string };

/** Verifies signature + expiry + DB revocation state. Bumps LastUsedAtUtc (best effort, fire-and-forget). */
export async function verifyAccessToken(token: string): Promise<PkmnAuthContext | null> {
  const payload = verifyAccessTokenSignature(token);
  if (!payload) return null;

  const row = await prisma.pkmnApiToken.findUnique({ where: { TokenHash: hashToken(token) } });
  if (!row || row.RevokedAtUtc || row.ExpiresAtUtc.getTime() < Date.now()) return null;

  prisma.pkmnApiToken
    .update({ where: { Id: row.Id }, data: { LastUsedAtUtc: new Date() } })
    .catch(() => {});

  return { steamId: payload.steamId, tokenId: row.Id };
}

function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** Route-handler guard: returns the auth context, or an already-built 401 NextResponse. */
export async function requirePkmnAuth(req: Request): Promise<PkmnAuthContext | NextResponse> {
  const token = bearerFrom(req);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }
  const ctx = await verifyAccessToken(token);
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
  return ctx;
}

export function isAuthContext(x: PkmnAuthContext | NextResponse): x is PkmnAuthContext {
  return !(x instanceof NextResponse);
}

// ---------- realtime handshake ticket ----------
// Short-lived, single-purpose proof of identity handed to the Socket.IO
// server so it doesn't have to trust a raw client-asserted steamId on
// 'authenticate' the way the browser mini-games currently do. server.js
// verifies this with a matching inline HMAC check (same secret + format)
// rather than importing this file, since it runs outside the Next build.
// Kept intentionally simple (no DB round-trip, no revocation) — a stolen
// 60-second ticket is a non-issue; a stolen 90-day access token is not,
// which is why *that* one is DB-backed and revocable.

type TicketPayload = { steamId: string; exp: number };

export function issueRealtimeTicket(steamId: string): { ticket: string; expiresAt: number } {
  const exp = Date.now() + TICKET_TTL_MS;
  const body = b64url(JSON.stringify({ steamId, exp } satisfies TicketPayload));
  return { ticket: `${body}.${sign("pkmn_ticket", body)}`, expiresAt: exp };
}
