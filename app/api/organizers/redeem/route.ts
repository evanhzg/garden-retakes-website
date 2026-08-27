import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Redeeming an organizer invite.
//
// The person clicking proves who they are by signing in with Steam before this
// runs — which is why the link alone is enough, and why it carries no identity
// of its own. A link that leaks costs you an unwanted organizer at worst, never
// an impersonation, and revoking one is deleting a row.

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let token = "";
  try {
    token = String((await req.json()).token ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  if (!token) return NextResponse.json({ error: "No invite." }, { status: 400 });

  const invite = await prisma.organizerInvite.findUnique({ where: { Token: token } });

  // A wrong or revoked token is its own outcome rather than a 404: the caller
  // is a real person holding a link they were given, and "this link is no
  // longer valid" is the useful answer.
  if (!invite) return NextResponse.json({ error: "invalid" }, { status: 404 });
  if (invite.UsedBySteamId !== null) {
    // Except when they are the one who used it — clicking your own link twice
    // should land you where you already are, not on an error.
    if (invite.UsedBySteamId.toString() === session.steamId) {
      return NextResponse.json({ ok: true, alreadyYours: true, kind: invite.Kind });
    }
    return NextResponse.json({ error: "used" }, { status: 409 });
  }
  if (invite.ExpiresAt && invite.ExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const steamId = BigInt(session.steamId);

  // Look up a display name so the organizer list is readable rather than a
  // column of 17-digit numbers.
  const profile = await prisma.playerProfile.findUnique({
    where: { SteamId: steamId },
    select: { LastKnownName: true },
  });
  const name = profile?.LastKnownName ?? null;

  if (invite.Kind === "tournament") {
    if (invite.TournamentId === null) {
      return NextResponse.json({ error: "invalid" }, { status: 404 });
    }

    // Upsert rather than create: somebody who is already staff on this event
    // and clicks a link should not hit a unique-constraint error.
    await prisma.tournamentOrganizer.upsert({
      where: {
        TournamentId_SteamId: { TournamentId: invite.TournamentId, SteamId: steamId },
      },
      update: {},
      create: {
        TournamentId: invite.TournamentId,
        SteamId: steamId,
        Name: name,
        IsCreator: false,
      },
    });
  } else {
    await prisma.gardenOrganizer.upsert({
      where: { SteamId: steamId },
      update: {},
      create: {
        SteamId: steamId,
        Name: name,
        AddedBySteamId: invite.CreatedBySteamId,
      },
    });
  }

  // Burned last, and only after the grant succeeded — a token spent on a write
  // that then failed would be a link nobody can use and nobody can explain.
  await prisma.organizerInvite.update({
    where: { Id: invite.Id },
    data: { UsedBySteamId: steamId, UsedAt: new Date() },
  });

  return NextResponse.json({ ok: true, kind: invite.Kind, tournamentId: invite.TournamentId });
}
