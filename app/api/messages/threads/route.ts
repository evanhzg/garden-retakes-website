import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Who has messaged you, and who you have messaged.
//
// This did not exist. /api/messages answers "?targetId=" — one conversation, if
// you already know whose — so the panel had no way to discover a conversation
// it was not already looking at. It papered over that by treating the friends
// list AS the thread list, which meant every friend appeared as a thread
// whether or not a word had ever passed between you, and a message from
// somebody who is not a friend had nowhere to appear at all. It still
// incremented the unread badge, so the count went up and no row explained why.
//
// The friends tab owns friends now. This owns everybody else.

/** Enough to fill the panel; nobody scrolls a DM list past this. */
const MAX_THREADS = 50;
/** How far back to look. A conversation older than this is not "recent". */
const MAX_SCAN = 600;

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  let me: bigint;
  try {
    me = BigInt(session.steamId);
  } catch {
    return NextResponse.json({ threads: [] });
  }

  // Direct messages only — a row with a LobbyId is lobby chat, which belongs to
  // the lobby and would otherwise show up here as a conversation with whoever
  // last spoke in it.
  const rows = await prisma.webMessage.findMany({
    where: {
      LobbyId: null,
      OR: [{ SenderSteamId: me }, { RecipientSteamId: me }],
    },
    orderBy: { CreatedAtUtc: "desc" },
    take: MAX_SCAN,
    select: {
      SenderSteamId: true,
      RecipientSteamId: true,
      Content: true,
      CreatedAtUtc: true,
    },
  });

  // Newest first already, so the first row seen for a counterparty is their
  // latest message and every later one can be skipped.
  const byCounterparty = new Map<
    string,
    { steamId: string; lastMessage: string; lastAt: string; fromMe: boolean }
  >();

  for (const row of rows) {
    const otherId = row.SenderSteamId === me ? row.RecipientSteamId : row.SenderSteamId;
    if (otherId === null) continue;

    const key = otherId.toString();
    if (key === session.steamId) continue; // a note to self is not a thread
    if (byCounterparty.has(key)) continue;

    byCounterparty.set(key, {
      steamId: key,
      lastMessage: row.Content.slice(0, 140),
      lastAt: row.CreatedAtUtc.toISOString(),
      fromMe: row.SenderSteamId === me,
    });

    if (byCounterparty.size >= MAX_THREADS) break;
  }

  const ids = Array.from(byCounterparty.keys());
  if (ids.length === 0) return NextResponse.json({ threads: [] });

  // Names and avatars, so a thread with a stranger is a person rather than a
  // 17-digit number.
  const profiles = await prisma.playerProfile.findMany({
    where: { SteamId: { in: ids.map((id) => BigInt(id)) } },
    select: { SteamId: true, LastKnownName: true },
  });
  const nameOf = new Map(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName ?? ""]));

  const threads = Array.from(byCounterparty.values()).map((thread) => ({
    ...thread,
    name: nameOf.get(thread.steamId) || thread.steamId,
  }));

  return NextResponse.json({ threads });
}
