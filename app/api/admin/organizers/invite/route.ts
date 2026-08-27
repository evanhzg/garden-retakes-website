import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAdminAction } from "@/lib/adminAuth";
import {
  canEditRegistry,
  canManage,
  getTournamentContext,
} from "@/lib/tournamentAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Organizer invite links: minting them, listing them, revoking them.
//
// Every existing path to becoming an organizer requires somebody to type a
// 17-digit SteamID64 into a box, which means asking for it, being given the
// wrong one, and pasting a profile URL instead. A link removes all of that:
// the person who clicks it proves who they are by signing in with Steam, so
// the link itself carries no identity and needs to be given to nobody in
// particular.
//
// Same generator as the team invite, and the same reasoning: 16 random bytes
// is not guessable, and the column is sized to exactly fit its hex.
const freshToken = () => randomBytes(16).toString("hex");

type Body = {
  key?: string;
  action?: "create" | "revoke";
  kind?: "registry" | "tournament";
  tournamentId?: number;
  /** Hours until it stops working. Omitted means it does not expire. */
  expiresInHours?: number;
  id?: number;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getTournamentContext(url.searchParams.get("key"));
  if (!ctx.canCreate) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const tournamentId = Number(url.searchParams.get("tournamentId")) || null;

  // An organizer sees the invites for the events they run; only a registry
  // editor sees registry invites, which are the ones that widen the site.
  const invites = await prisma.organizerInvite.findMany({
    where: tournamentId
      ? { Kind: "tournament", TournamentId: tournamentId }
      : canEditRegistry(ctx)
        ? { Kind: "registry" }
        : { Id: -1 },
    orderBy: { Id: "desc" },
    take: 25,
  });

  return NextResponse.json({
    canEditRegistry: canEditRegistry(ctx),
    invites: invites.map((i) => ({
      id: i.Id,
      token: i.Token,
      kind: i.Kind,
      tournamentId: i.TournamentId,
      createdAt: i.CreatedAt.toISOString(),
      expiresAt: i.ExpiresAt?.toISOString() ?? null,
      usedBy: i.UsedBySteamId?.toString() ?? null,
      usedAt: i.UsedAt?.toISOString() ?? null,
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

  const ctx = await getTournamentContext(body.key);
  const session = getSession();

  // The minter has to be a real signed-in account, not just an admin key: the
  // invite records who created it, and "whoever held the key" is not a person.
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  switch (body.action) {
    case "create": {
      const kind = body.kind === "tournament" ? "tournament" : "registry";

      if (kind === "registry") {
        // Admin and above only. An organizer who could mint registry invites
        // could appoint organizers, and a registry that can expand itself is a
        // permission system with no edge — the same rule canEditOrganizerRegistry
        // already encodes for the typed-SteamID path.
        if (!canEditRegistry(ctx)) {
          return NextResponse.json({ error: "Admins only." }, { status: 403 });
        }
      } else {
        const tournamentId = Number(body.tournamentId);
        if (!Number.isInteger(tournamentId)) {
          return NextResponse.json({ error: "tournamentId?" }, { status: 400 });
        }
        // Matches the permission on add-organizer exactly: anybody who can
        // manage this tournament can bring in help for it.
        if (!(await canManage(ctx, tournamentId))) {
          return NextResponse.json({ error: "Not your tournament." }, { status: 403 });
        }
      }

      const hours = Number(body.expiresInHours);
      const expiresAt =
        Number.isFinite(hours) && hours > 0
          ? new Date(Date.now() + hours * 3_600_000)
          : null;

      const invite = await prisma.organizerInvite.create({
        data: {
          Token: freshToken(),
          Kind: kind,
          TournamentId: kind === "tournament" ? Number(body.tournamentId) : null,
          CreatedBySteamId: BigInt(session.steamId),
          ExpiresAt: expiresAt,
        },
      });

      await logAdminAction(ctx, "organizer.invite.create", undefined, `${kind}:${invite.Id}`);

      return NextResponse.json({ ok: true, token: invite.Token, id: invite.Id });
    }

    // Deleting the row is the revoke. There is nothing to keep: an unused
    // invite that has been withdrawn is not a fact anybody needs later, and a
    // used one has already done its work in GardenOrganizers.
    case "revoke": {
      const id = Number(body.id);
      if (!Number.isInteger(id)) return NextResponse.json({ error: "id?" }, { status: 400 });

      const invite = await prisma.organizerInvite.findUnique({ where: { Id: id } });
      if (!invite) return NextResponse.json({ error: "No such invite." }, { status: 404 });

      const allowed =
        invite.Kind === "registry"
          ? canEditRegistry(ctx)
          : invite.TournamentId !== null && (await canManage(ctx, invite.TournamentId));

      if (!allowed) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

      await prisma.organizerInvite.delete({ where: { Id: id } });
      await logAdminAction(ctx, "organizer.invite.revoke", undefined, String(id));

      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
