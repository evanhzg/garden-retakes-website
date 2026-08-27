import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import { logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Who may spectate a tournament's matches.
//
// The allowlist already existed and was already read by startMatch(), which
// issues a css_t_spectator per entry — there was simply no way to put anybody
// on it short of an INSERT. That made the feature real in the plugin and
// imaginary on the website.
//
// The public switch is the other half. An allowlist is right for a competitive
// match, where a GOTV slot is a seat in the server; a showmatch wants everyone
// in, and adding fifty viewers by SteamID64 is not a thing anybody will do.

type Body = {
  key?: string;
  action?: "add" | "remove" | "set-public";
  tournamentId?: number;
  steamId?: string;
  name?: string;
  isPublic?: boolean;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tournamentId = Number(url.searchParams.get("tournamentId"));
  if (!Number.isInteger(tournamentId)) {
    return NextResponse.json({ error: "tournamentId?" }, { status: 400 });
  }

  const ctx = await getTournamentContext(url.searchParams.get("key"));
  if (!(await canManage(ctx, tournamentId))) {
    return NextResponse.json({ error: "Not your tournament." }, { status: 403 });
  }

  const [tournament, spectators] = await Promise.all([
    prisma.tournament.findUnique({
      where: { Id: tournamentId },
      select: { SpectatorsPublic: true },
    }),
    prisma.tournamentSpectator.findMany({
      where: { TournamentId: tournamentId },
      orderBy: { Id: "asc" },
    }),
  ]);

  return NextResponse.json({
    isPublic: tournament?.SpectatorsPublic ?? false,
    spectators: spectators.map((s) => ({
      id: s.Id,
      steamId: s.SteamId.toString(),
      name: s.Name,
    })),
  });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const tournamentId = Number(body.tournamentId);
  if (!Number.isInteger(tournamentId)) {
    return NextResponse.json({ error: "tournamentId?" }, { status: 400 });
  }

  const ctx = await getTournamentContext(body.key);
  if (!(await canManage(ctx, tournamentId))) {
    return NextResponse.json({ error: "Not your tournament." }, { status: 403 });
  }

  switch (body.action) {
    case "add": {
      const steamId = (body.steamId ?? "").trim();
      // Same validation as the organizer registry: a SteamID64 is exactly
      // seventeen digits, and anything else is a profile URL somebody pasted.
      if (!/^\d{17}$/.test(steamId)) {
        return NextResponse.json({ error: "That is not a SteamID64." }, { status: 400 });
      }

      // A name for the list, so it is readable later. Their own profile name if
      // we have one, otherwise whatever the organizer typed.
      const profile = await prisma.playerProfile.findUnique({
        where: { SteamId: BigInt(steamId) },
        select: { LastKnownName: true },
      });

      await prisma.tournamentSpectator.upsert({
        where: {
          TournamentId_SteamId: { TournamentId: tournamentId, SteamId: BigInt(steamId) },
        },
        update: { Name: profile?.LastKnownName ?? body.name?.trim() ?? null },
        create: {
          TournamentId: tournamentId,
          SteamId: BigInt(steamId),
          Name: profile?.LastKnownName ?? body.name?.trim() ?? null,
        },
      });

      await logAdminAction(ctx, "tournament.spectator.add", { steamId }, String(tournamentId));
      return NextResponse.json({ ok: true });
    }

    case "remove": {
      const steamId = (body.steamId ?? "").trim();
      if (!/^\d{17}$/.test(steamId)) {
        return NextResponse.json({ error: "That is not a SteamID64." }, { status: 400 });
      }

      await prisma.tournamentSpectator.deleteMany({
        where: { TournamentId: tournamentId, SteamId: BigInt(steamId) },
      });

      await logAdminAction(ctx, "tournament.spectator.remove", { steamId }, String(tournamentId));
      return NextResponse.json({ ok: true });
    }

    case "set-public": {
      const wanted = body.isPublic === true;
      await prisma.tournament.update({
        where: { Id: tournamentId },
        data: { SpectatorsPublic: wanted },
      });

      await logAdminAction(ctx, "tournament.spectator.public", undefined, `${tournamentId}=${wanted}`);
      return NextResponse.json({ ok: true, isPublic: wanted });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
