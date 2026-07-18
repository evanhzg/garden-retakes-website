import { NextRequest, NextResponse } from "next/server";

// Subdomain routing: docs./games./pkmn. retakes.fr all serve route groups of
// this SAME deployment — no extra Vercel projects. For each subdomain:
// CNAME it to the Vercel project and add the domain in Vercel → Settings →
// Domains. Works locally with e.g. http://docs.localhost:3131.
//
// Also supports the preview environment where the base domain is
// dev.retakes.fr, giving subdomains like pkmn.dev.retakes.fr.
const SUBDOMAIN_ROUTES: Record<string, string> = {
  docs: "/docs",
  games: "/games",
  pkmn: "/pkmn",
};

/**
 * Extract the app-level subdomain from the host.
 *
 * Production:  pkmn.retakes.fr    → subdomain "pkmn",  base "retakes.fr"
 * Preview:     pkmn.dev.retakes.fr → subdomain "pkmn",  base "dev.retakes.fr"
 * Main prod:   retakes.fr          → subdomain "",      base "retakes.fr"
 * Main preview: dev.retakes.fr     → subdomain "",      base "dev.retakes.fr"
 * Localhost:   pkmn.localhost:3000  → subdomain "pkmn",  base "localhost:3000"
 */
function extractSubdomain(host: string): { subdomain: string; baseHost: string } {
  // localhost special case (e.g. pkmn.localhost:3000)
  if (host.includes("localhost")) {
    const parts = host.split(".");
    if (parts.length >= 2 && SUBDOMAIN_ROUTES[parts[0]]) {
      return { subdomain: parts[0], baseHost: parts.slice(1).join(".") };
    }
    return { subdomain: "", baseHost: host };
  }

  // Real domain: strip port if present, work with segments
  const [hostNaked, port] = host.split(":");
  const segments = hostNaked.split(".");

  // retakes.fr → 2 segments, no subdomain
  // dev.retakes.fr → 3 segments, "dev" is the env prefix, no app subdomain
  // pkmn.retakes.fr → 3 segments, "pkmn" IS an app subdomain
  // pkmn.dev.retakes.fr → 4 segments, "pkmn" is app subdomain, "dev" is env

  // Walk from the front: the first segment that matches a known subdomain wins
  if (segments.length >= 3 && SUBDOMAIN_ROUTES[segments[0]]) {
    const sub = segments[0];
    const base = segments.slice(1).join(".") + (port ? `:${port}` : "");
    return { subdomain: sub, baseHost: base };
  }

  return { subdomain: "", baseHost: host };
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  const { subdomain, baseHost } = extractSubdomain(host);
  const isKnownSubdomain = !!subdomain;

  const url = req.nextUrl.clone();

  // 1. If accessing a subdomain route from the main domain, redirect to subdomain
  for (const [sub, route] of Object.entries(SUBDOMAIN_ROUTES)) {
    if (subdomain !== sub && (url.pathname === route || url.pathname.startsWith(`${route}/`))) {
      url.host = `${sub}.${baseHost}`;
      url.pathname = url.pathname.substring(route.length) || "/";
      return NextResponse.redirect(url);
    }
  }

  // 2. Subdomain specific logic
  if (isKnownSubdomain) {
    const base = SUBDOMAIN_ROUTES[subdomain];
    
    // Check if the user went to games.retakes.fr/games/...
    if (url.pathname === base || url.pathname.startsWith(`${base}/`)) {
      url.pathname = url.pathname.substring(base.length) || "/";
      return NextResponse.redirect(url);
    }

    // If it's NOT the root path, and doesn't match the subdomain base logic
    if (url.pathname !== "/") {
      url.host = baseHost;
      return NextResponse.redirect(url);
    }

    // Otherwise, rewrite / to the base route
    if (url.pathname === "/") {
      url.pathname = base;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and API routes; everything else may need the host rewrite.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|models|.*\\..*).*)" ],
};
