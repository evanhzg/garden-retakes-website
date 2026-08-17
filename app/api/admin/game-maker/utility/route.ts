import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The Utility tab's data: the pending capture, the lineups already on a map,
// and the queue of lineups still waiting for their screenshots.
//
// The draft is keyed by SteamId in the database, so "what is pending" is a
// per-admin question — an admin polling this sees their own capture, not
// whoever threw last.

/** Server-side failures are 500s with their real cause; see the sibling routes. */
function writeFailure(err: unknown, action: string) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[game-maker/utility] ${action} failed:`, message);
  const missingTable = /does(n't| not) exist|P2021|1146/i.test(message);
  return NextResponse.json(
    {
      error: missingTable
        ? "The utility tables are missing from this database — apply the schema (GardenNades, GardenNadeDrafts) and try again."
        : `Could not ${action}.`,
      detail: message.slice(0, 300),
    },
    { status: 500 }
  );
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const map = url.searchParams.get("map") ?? "";

  try {
    // The draft belongs to whoever is asking. A key-authorised caller has no
    // SteamId, so it sees the most recent capture instead of nothing — that is
    // the only sensible answer when there is no "own" to scope to.
    const draft = ctx.steamId
      ? await prisma.gardenNadeDraft.findUnique({ where: { SteamId: BigInt(ctx.steamId) } })
      : await prisma.gardenNadeDraft.findFirst({ orderBy: { CapturedAt: "desc" } });

    const [lineups, pendingShots] = await Promise.all([
      map
        ? prisma.gardenNade.findMany({
            where: { Map: map },
            orderBy: [{ Area: "asc" }, { Name: "asc" }],
          })
        : Promise.resolve([]),
      prisma.gardenNade.groupBy({
        by: ["Map"],
        where: { NeedsShots: true },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      draft: draft
        ? { ...draft, SteamId: draft.SteamId.toString() }
        : null,
      lineups: lineups.map((l) => ({
        ...l,
        AddedBySteamId: l.AddedBySteamId?.toString() ?? null,
      })),
      queue: pendingShots
        .map((row) => ({ map: row.Map, pending: row._count._all }))
        .sort((a, b) => b.pending - a.pending),
    });
  } catch (err) {
    return writeFailure(err, "read the utility data");
  }
}

/**
 * Validate: promote the pending draft into a real lineup.
 *
 * The draft is deleted in the same transaction it is promoted in — leaving it
 * behind would mean the next poll shows a capture that has already been
 * committed, and the admin would validate it twice.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "A lineup needs a name." }, { status: 400 });

  const steamId = typeof body.steamId === "string" && /^\d+$/.test(body.steamId)
    ? BigInt(body.steamId)
    : ctx.steamId
      ? BigInt(ctx.steamId)
      : null;
  if (steamId === null) {
    return NextResponse.json({ error: "No draft owner to validate for." }, { status: 400 });
  }

  try {
    const draft = await prisma.gardenNadeDraft.findUnique({ where: { SteamId: steamId } });
    if (!draft) {
      return NextResponse.json({ error: "There is no pending capture to validate." }, { status: 404 });
    }

    // The website's edits win over what the plugin guessed — the detection is a
    // starting value, and this is where a human corrects it.
    const created = await prisma.$transaction(async (tx) => {
      const nade = await tx.gardenNade.create({
        data: {
          Map: draft.Map,
          Name: name,
          Area: typeof body.area === "string" ? body.area.slice(0, 64) : "",
          Utility: typeof body.utility === "string" ? body.utility : draft.Utility,
          Purpose: typeof body.purpose === "string" ? body.purpose : "default",
          Team: typeof body.team === "string" ? body.team.slice(0, 2) : draft.Team,
          ThrowType: typeof body.throwType === "string" ? body.throwType : draft.ThrowType,
          ClickType: typeof body.clickType === "string" ? body.clickType : draft.ClickType,
          StandX: draft.StandX,
          StandY: draft.StandY,
          StandZ: draft.StandZ,
          Pitch: draft.Pitch,
          Yaw: draft.Yaw,
          LandX: num(body.landX) ?? draft.LandX,
          LandY: num(body.landY) ?? draft.LandY,
          LandZ: num(body.landZ) ?? draft.LandZ,
          Notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : null,
          Verified: true,
          Source: "ingame",
          MarkedStand: draft.MarkedStand,
          NeedsReview: false,
          // Screenshots need a rendering client, so a fresh lineup always joins
          // the capture queue rather than arriving complete.
          NeedsShots: true,
          AddedBySteamId: steamId,
        },
      });

      await tx.gardenNadeDraft.delete({ where: { SteamId: steamId } });
      return nade;
    });

    await logAdminAction(ctx, "utility.validate", undefined, `${created.Map} "${created.Name}"`);
    return NextResponse.json({
      lineup: { ...created, AddedBySteamId: created.AddedBySteamId?.toString() ?? null },
    });
  } catch (err) {
    return writeFailure(err, "validate the lineup");
  }
}

/** Discard the pending capture without committing it. */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const asked = url.searchParams.get("steamId");
  const steamId = asked && /^\d+$/.test(asked)
    ? BigInt(asked)
    : ctx.steamId
      ? BigInt(ctx.steamId)
      : null;
  if (steamId === null) {
    return NextResponse.json({ error: "No draft owner." }, { status: 400 });
  }

  try {
    await prisma.gardenNadeDraft.deleteMany({ where: { SteamId: steamId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return writeFailure(err, "discard the capture");
  }
}
