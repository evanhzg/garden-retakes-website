import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mode Maker proposals: pitches for entirely new game modes, with a config
// blob and a node graph. Both are stored as JSON text rather than columns —
// the whole point of the tab is that the shape of an idea is not known ahead
// of time, and a schema that constrained it would defeat it.

const STATUSES = ["draft", "review", "accepted", "shelved"];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "untitled";

function serialise(p: { AuthorSteamId: bigint | null; [k: string]: unknown }) {
  return { ...p, AuthorSteamId: p.AuthorSteamId?.toString() ?? null };
}

export async function GET(req: Request) {
  const ctx = await getAdminContext(new URL(req.url).searchParams.get("key"));
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const proposals = await prisma.gmModeProposal.findMany({ orderBy: { UpdatedAt: "desc" } });
  return NextResponse.json({ proposals: proposals.map(serialise) });
}

export async function POST(req: Request) {
  const ctx = await getAdminContext(new URL(req.url).searchParams.get("key"));
  // Anyone who can reach the admin panel can pitch a mode — the point is to
  // collect ideas, and gating that at Admin would collect fewer of them.
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 96) : "";
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  try {
    const created = await prisma.gmModeProposal.create({
      data: {
        Slug: `${slugify(title)}-${Date.now().toString(36).slice(-4)}`,
        Title: title,
        Summary: typeof body.summary === "string" ? body.summary.slice(0, 500) : "",
        Status: "draft",
        Config: JSON.stringify(body.config ?? {}),
        Graph: JSON.stringify(body.graph ?? { nodes: [], edges: [] }),
        AuthorSteamId: ctx.steamId ? BigInt(ctx.steamId) : null,
      },
    });

    await logAdminAction(ctx, "gamemaker.proposal.create", undefined, title);
    return NextResponse.json({ proposal: serialise(created) });
  } catch {
    return NextResponse.json({ error: "Could not create the proposal." }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const ctx = await getAdminContext(new URL(req.url).searchParams.get("key"));
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.Title = body.title.trim().slice(0, 96);
  if (typeof body.summary === "string") data.Summary = body.summary.slice(0, 500);
  if (typeof body.status === "string" && STATUSES.includes(body.status)) {
    // Moving a pitch past draft is a curation call, not an idea — that one
    // needs Admin even though writing the pitch itself does not.
    if (ctx.level < AdminLevel.Admin) {
      return NextResponse.json({ error: "Only admins can change a proposal's status." }, { status: 403 });
    }
    data.Status = body.status;
  }
  if (body.config !== undefined) data.Config = JSON.stringify(body.config);
  if (body.graph !== undefined) data.Graph = JSON.stringify(body.graph);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.gmModeProposal.update({ where: { Id: id }, data });
    return NextResponse.json({ proposal: serialise(updated) });
  } catch {
    return NextResponse.json({ error: "Could not update the proposal." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  try {
    const removed = await prisma.gmModeProposal.delete({ where: { Id: id } });
    await logAdminAction(ctx, "gamemaker.proposal.delete", undefined, removed.Title);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete the proposal." }, { status: 400 });
  }
}
