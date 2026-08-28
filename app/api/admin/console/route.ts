import { NextResponse } from "next/server";
import { execOnServer } from "@/lib/tournament/servers";
import { logAdminAction } from "@/lib/adminAuth";
import {
  actorName,
  append,
  commandRefusal,
  resolveTarget,
  since,
} from "@/lib/tournament/console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The live console, for one server.
//
// Deliberately not an extension of /api/admin/rcon. That route talks to the
// single server in RCON_HOST and gates on the GardenAdmins ladder, which is
// exactly the pair of assumptions that made an organizer unable to change a map
// on a server their own tournament was running. This one takes a server (or a
// match, and finds the server) and asks lib/tournament/serverAccess.ts, where
// the rule is tested.
//
// Every command and its output goes into a scrollback shared by everybody
// watching that server, so two organizers on one match see the same thing.

type Body = { key?: string; serverId?: number; matchId?: number; command?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const command = (body.command ?? "").trim();
  if (!command) return NextResponse.json({ error: "Empty command." }, { status: 400 });

  const target = await resolveTarget(body.key, { serverId: body.serverId, matchId: body.matchId });
  if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status });

  const refusal = commandRefusal(command, target.isFullAdmin);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  const who = actorName(target.ctx);

  let output: string;
  let ok = true;

  try {
    output = (await execOnServer(target.serverId, command)).trim() || "(no output)";
  } catch (err) {
    output = err instanceof Error ? err.message : String(err);
    ok = false;
  }

  // Recorded whether it worked or not. A command that failed is the most
  // interesting line in the scrollback, and hiding it would leave the next
  // person to try the same thing.
  const line = append(target.serverId, { who, command, output, ok });

  // The audit log is the durable half. The scrollback is in memory and for the
  // people in the room; this is what survives to answer "who did that".
  await logAdminAction(
    target.ctx,
    "console",
    undefined,
    `${target.serverName}: ${command.slice(0, 200)}`,
  );

  return NextResponse.json({ ok, line });
}

/**
 * The scrollback, for polling.
 *
 * `since` rather than a full dump every time: a console left open for a match is
 * a request every couple of seconds, and re-sending two hundred lines each time
 * to append one is the kind of thing that is invisible locally and obvious on a
 * phone tethered at an event.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const serverId = Number(url.searchParams.get("serverId")) || undefined;
  const matchId = Number(url.searchParams.get("matchId")) || undefined;
  const after = Number(url.searchParams.get("since")) || 0;

  const target = await resolveTarget(url.searchParams.get("key"), { serverId, matchId });
  if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status });

  return NextResponse.json({
    serverId: target.serverId,
    serverName: target.serverName,
    isFullAdmin: target.isFullAdmin,
    lines: since(target.serverId, after),
  });
}
