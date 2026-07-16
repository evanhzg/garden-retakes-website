import { NextResponse } from "next/server";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not allowed in production" }, { status: 403 });
  }

  const url = new URL(req.url);
  // Default to a fake Steam ID if none is provided via ?steamId=
  const steamId = url.searchParams.get("steamId") || "76561198012345678";
  const name = url.searchParams.get("name") || "DevPlayer";

  const token = createSessionToken({ steamId, name, avatar: "" });

  const response = NextResponse.redirect(new URL("/profile", req.url));
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);

  return response;
}
