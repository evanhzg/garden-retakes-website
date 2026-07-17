import { NextRequest, NextResponse } from "next/server";

// Subdomain routing: docs.retakes.fr serves the /docs route group of this same
// deployment. DNS: CNAME "docs" -> the Vercel project (add the domain there too).
// Works locally with e.g. http://docs.localhost:3131.
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();

  if (host.startsWith("docs.")) {
    const url = req.nextUrl.clone();
    if (!url.pathname.startsWith("/docs")) {
      url.pathname = url.pathname === "/" ? "/docs" : `/docs${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and API routes; everything else may need the host rewrite.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|models|.*\\..*).*)"],
};
