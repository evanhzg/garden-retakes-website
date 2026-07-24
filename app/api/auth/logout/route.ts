import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

function clear(request: Request) {
  const origin = process.env.SITE_URL ?? new URL(request.url).origin;
  const response = NextResponse.redirect(`${origin}/inventory`, { status: 303 });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

export const GET = clear;
export const POST = clear;
