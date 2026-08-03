import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isProvider, PROVIDERS, providerById, type Connection } from "@/lib/connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A player's connections.
//
// GET ?steamId=…  — what that player has chosen to publish. Your own comes back
//                   whole, published or not, because that is the editor's data.
// PUT             — replace your own set.

/** Build the public view: only what is marked public, and only what resolves. */
async function connectionsFor(steamId: bigint, includePrivate: boolean): Promise<Connection[]> {
  const [rows, discord] = await Promise.all([
    prisma.gardenProfileLink.findMany({ where: { SteamId: steamId } }),
    prisma.gardenDiscordLink.findUnique({ where: { SteamId: steamId } }),
  ]);
  const byProvider = new Map(rows.map((r) => [r.Provider, r]));

  const out: Connection[] = [];
  for (const p of PROVIDERS) {
    const row = byProvider.get(p.id);
    const isPublic = row?.Public ?? false;
    if (!includePrivate && !isPublic) continue;

    // Derived providers have no handle of their own; their link is built here.
    let handle = row?.Handle ?? "";
    let href: string | null = null;
    if (p.id === "steam") {
      href = `https://steamcommunity.com/profiles/${steamId}`;
      handle = handle || steamId.toString();
    } else if (p.id === "discord") {
      if (!discord && !includePrivate) continue;
      handle = discord?.DiscordName ?? handle;
      href = null; // Discord has no public profile URL worth linking.
    } else if (p.id === "faceit") {
      href = handle ? `https://www.faceit.com/en/players/${handle}` : null;
    } else if (handle) {
      href = p.url?.(handle) ?? null;
    }

    if (!includePrivate && !p.derived && !handle) continue;
    out.push({ provider: p.id, handle, public: isPublic, href });
  }
  return out;
}

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("steamId");
  const session = getSession();

  if (asked) {
    if (!/^\d{17}$/.test(asked)) return NextResponse.json({ error: "bad steamId" }, { status: 400 });
    const mine = session?.steamId === asked;
    return NextResponse.json({ connections: await connectionsFor(BigInt(asked), mine) });
  }

  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  return NextResponse.json({ connections: await connectionsFor(BigInt(session.steamId), true) });
}

export async function PUT(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { connections?: { provider?: string; handle?: string; public?: boolean }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const steamId = BigInt(session.steamId);
  const incoming = (body.connections ?? []).filter((c) => c.provider && isProvider(c.provider));

  for (const c of incoming) {
    const provider = providerById(c.provider!)!;
    // A derived provider has nothing to type in; storing whatever arrived would
    // let the client invent a FACEIT nickname for someone.
    const handle = provider.derived && provider.id !== "faceit" ? "" : String(c.handle ?? "").trim().slice(0, 160);
    await prisma.gardenProfileLink.upsert({
      where: { SteamId_Provider: { SteamId: steamId, Provider: provider.id } },
      create: { SteamId: steamId, Provider: provider.id, Handle: handle, Public: Boolean(c.public) },
      update: { Handle: handle, Public: Boolean(c.public) },
    });
  }

  return NextResponse.json({ ok: true, connections: await connectionsFor(steamId, true) });
}
