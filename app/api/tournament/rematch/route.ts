import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rematchStatus, voteRematch } from "@/lib/tournament/rematchRunner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * "Run it back."
 *
 * GET is the poll everybody in the lobby runs while the vote is open: who has
 * agreed, who has not, and the link once it exists. POST is one answer.
 *
 * Deliberately no admin path. A rematch is a claim on everybody's next twenty
 * minutes and there is nobody it would be right for an organizer to make it
 * on behalf of — the bracket's own controls are for putting a match on, and
 * this is for the ten people who just finished one.
 */
export async function GET(req: Request) {
  const matchId = Number(new URL(req.url).searchParams.get("matchId"));
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return NextResponse.json({ error: "matchId?" }, { status: 400 });
  }

  return NextResponse.json(await rematchStatus(matchId));
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session?.steamId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { matchId?: number; accepted?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const matchId = Number(body.matchId);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return NextResponse.json({ error: "matchId?" }, { status: 400 });
  }

  // Defaulting to yes: the button that sends this says "Rematch", and a
  // missing flag from an older client means the thing the button says.
  const accepted = body.accepted !== false;

  const result = await voteRematch(matchId, String(session.steamId), accepted);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, ...result.status });
}
