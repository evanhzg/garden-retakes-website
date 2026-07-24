import { NextResponse } from "next/server";
import { rconExec } from "@/lib/rcon";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// W2: run a raw RCON command against the game server. Admin+ (or web key).
export async function POST(req: Request) {
  let body: { command?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const ctx = await getAdminContext(body.key);
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const command = (body.command ?? "").trim();
  if (!command) return NextResponse.json({ error: "Empty command." }, { status: 400 });

  try {
    const output = await rconExec(command);
    await logAdminAction(ctx, "rcon", undefined, command.slice(0, 250));
    return NextResponse.json({ output });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "RCON failed." },
      { status: 502 }
    );
  }
}
