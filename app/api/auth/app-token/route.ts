import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/auth';

export async function GET(request: Request) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/api/auth/steam/login?returnTo=/api/auth/app-token', request.url));
  }

  const html = `
    <html>
      <head>
        <title>Authenticated</title>
        <style>body { background: #1a1a1a; color: white; font-family: sans-serif; text-align: center; padding-top: 100px; }</style>
        <script>
          window.location.href = "re5hl://auth?token=" + encodeURIComponent("${token}");
          setTimeout(() => window.close(), 1500);
        </script>
      </head>
      <body>
        <h2>Authentication Successful!</h2>
        <p>You can safely close this window to return to RE5HL.</p>
      </body>
    </html>
  `;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
