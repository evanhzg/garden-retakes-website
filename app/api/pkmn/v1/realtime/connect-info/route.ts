import { NextResponse } from "next/server";
import { requirePkmnAuth, isAuthContext, issueRealtimeTicket } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

// GET /api/pkmn/v1/realtime/connect-info
//
// Everything the game client needs to open the live multiplayer connection:
// the Socket.IO URL and a short-lived (60s) signed ticket proving who it is.
// Hand the ticket to 'authenticate' as { ticket } instead of a raw steamId —
// the socket server verifies the signature rather than trusting the
// client's claim (see the 'authenticate' handler in server.js). Fetch a
// fresh ticket right before each connection attempt; it is not reusable
// across reconnects once expired.
export async function GET(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const { ticket, expiresAt } = issueRealtimeTicket(auth.steamId);
  const socketUrl = process.env.PKMN_SOCKET_URL || process.env.NEXT_PUBLIC_SOCKET_URL || "https://play.retakes.fr";

  return NextResponse.json({ socketUrl, ticket, expiresAt });
}
