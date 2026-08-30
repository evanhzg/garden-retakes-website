import { NextResponse } from "next/server";
import { ingest, verifyLogToken } from "@/lib/tournament/serverLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Where a game server posts its own console output.
 *
 * The other end of `logaddress_add_http`. Everything that arrives here goes
 * into the same per-server scrollback that typed commands go into, in the order
 * it happened, which is the whole point: a command that looked like it worked
 * and the plugin exception it caused half a second later belong on one screen.
 *
 * Not behind the admin session, and it cannot be. The caller is a CS2 dedicated
 * server posting from a cvar — it has no cookie, no Steam identity, and no way
 * to be handed one. So the credential is a token in the URL, derived per server
 * from AUTH_SECRET, and the route is written on the assumption that anybody on
 * the internet can reach it:
 *
 *   - a bad or missing token is 401 before anything is read, so an unauthorised
 *     caller cannot make the process do work by posting a large body;
 *   - the server id comes from the URL and is checked against the token, so a
 *     token for one server cannot write into another's scrollback;
 *   - the body is treated as text and is never parsed, executed or trusted —
 *     it is bounded, trimmed and stored, and the UI renders it as text.
 *
 * It answers 204 rather than JSON. Nothing on the far end reads the reply, and
 * a body sent to a game server's HTTP logger is a body written to its console
 * for no reason.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);

  const serverId = Number(url.searchParams.get("server"));
  if (!Number.isInteger(serverId) || serverId <= 0) {
    return NextResponse.json({ error: "Which server?" }, { status: 400 });
  }

  if (!verifyLogToken(serverId, url.searchParams.get("token"))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ error: "Unreadable body." }, { status: 400 });
  }

  ingest(serverId, body);

  return new NextResponse(null, { status: 204 });
}
