import { NextRequest, NextResponse } from "next/server";

// Subdomain routing: docs./games./pkmn. retakes.fr all serve route groups of
// this SAME deployment — no extra Vercel projects. For each subdomain:
// CNAME it to the Vercel project and add the domain in Vercel → Settings →
// Domains. Works locally with e.g. http://docs.localhost:3131.
const SUBDOMAIN_ROUTES: Record<string, string> = {
  docs: "/docs",
  games: "/games",
  pkmn: "/pkmn",
};

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  const base = SUBDOMAIN_ROUTES[host.split(".")[0]];

  if (base) {
    const url = req.nextUrl.clone();
    if (!url.pathname.startsWith(base)) {
      url.pathname = url.pathname === "/" ? base : `${base}${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and API routes; everything else may need the host rewrite.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|models|.*\\..*).*)"],
};
