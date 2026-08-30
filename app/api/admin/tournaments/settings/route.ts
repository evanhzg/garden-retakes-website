import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { background } from "@/lib/background";
import { notifyFollowers } from "@/lib/tournament/orgNotify";
import { logAdminAction } from "@/lib/adminAuth";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import { canEditFormat, TEAM_SIZES, type EditionState } from "@/lib/tournament/edition";
import { startTournament } from "@/lib/tournament/startTournament";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Everything about a tournament that an organizer sets before it runs.
//
// One route rather than one per field, because they are edited together on one
// panel and every one of them needs the same gate: you may change a tournament
// you run, and an admin may change any.

type Body = {
  key?: string;
  tournamentId?: number;
  action?: "save" | "publish" | "unpublish" | "start" | "rotate-invite";

  name?: string;
  description?: string;
  visibility?: string;
  maxTeams?: number;
  teamSize?: number;
  format?: string;
  seeding?: string;
  roleMode?: string;
  bestOf?: number;
  finalBestOf?: number | null;
  startsAt?: string | null;
  maps?: string[];

  rulesText?: string;
  prizeText?: string;
  sponsorsText?: string;
  discordUrl?: string;
  teamSpeakUrl?: string;
  twitchChannels?: string;
};

const FORMATS = ["single", "double", "group", "swiss"];
const SEEDINGS = ["random", "faceit", "manual"];
const ROLE_MODES = ["tournament", "match"];
const VISIBILITIES = ["public", "invite"];

/** Short, unguessable, and safe in a URL without escaping. */
const token = () => randomBytes(16).toString("hex");

/**
 * Only http(s), and only when there is something there.
 *
 * These end up as hrefs on a public page, so a `javascript:` URL pasted into
 * the Discord field would be stored and rendered — the classic way a settings
 * form becomes an XSS vector.
 */
function safeUrl(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString().slice(0, 255);
  } catch {
    return null;
  }
}

/** Twitch channel names, comma separated. Names only — never a full URL. */
function safeChannels(value: string | undefined): string | null {
  const names = (value ?? "")
    .split(",")
    .map((c) => c.trim().replace(/^https?:\/\/(www\.)?twitch\.tv\//i, "").replace(/\/.*$/, ""))
    // Twitch's own rule: letters, digits and underscore.
    .filter((c) => /^[A-Za-z0-9_]{3,25}$/.test(c))
    .slice(0, 6);

  return names.length ? names.join(",") : null;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const ctx = await getTournamentContext(body.key);

  if (!body.tournamentId) {
    return NextResponse.json({ error: "Which tournament?" }, { status: 400 });
  }
  if (!(await canManage(ctx, body.tournamentId))) {
    return NextResponse.json({ error: "You do not run this tournament." }, { status: 403 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { Id: body.tournamentId },
    include: { _count: { select: { Teams: true } } },
  });
  if (!tournament) return NextResponse.json({ error: "No such tournament." }, { status: 404 });

  const edition: EditionState = {
    published: tournament.Published,
    state: tournament.State,
    visibility: tournament.Visibility === "invite" ? "invite" : "public",
    maxTeams: tournament.MaxTeams,
    teamCount: tournament._count.Teams,
    startsAt: tournament.StartsAt,
    startedAt: tournament.StartedAt,
  };

  switch (body.action) {
    case "publish":
      await prisma.tournament.update({
        where: { Id: tournament.Id },
        data: { Published: true, State: tournament.State === "draft" ? "registration" : tournament.State },
      });

      // The followers of the org that runs it hear about it. Not awaited for
      // its result: a tournament that published but could not announce itself
      // is a much smaller problem than one that failed to publish, and
      // notifyFollowers never throws for the same reason.
      background("org:published", () => notifyFollowers(tournament.Id, "published"));
      await logAdminAction(ctx, "tournament.publish", undefined, tournament.Slug);
      return NextResponse.json({ ok: true });

    case "unpublish":
      // Refused once it has started: people are mid-tournament and pulling the
      // page out from under them helps nobody.
      if (edition.startedAt) {
        return NextResponse.json({ error: "It has already started." }, { status: 400 });
      }
      await prisma.tournament.update({ where: { Id: tournament.Id }, data: { Published: false } });
      await logAdminAction(ctx, "tournament.unpublish", undefined, tournament.Slug);
      return NextResponse.json({ ok: true });

    case "rotate-invite": {
      const fresh = token();
      await prisma.tournament.update({ where: { Id: tournament.Id }, data: { InviteToken: fresh } });
      await logAdminAction(ctx, "tournament.invite.rotate", undefined, tournament.Slug);
      return NextResponse.json({ ok: true, inviteToken: fresh });
    }

    case "start": {
      // Two teams is the floor and the only floor. Starting under the
      // advertised cap is explicitly allowed — the bracket adapts to who turned
      // up, which at an amateur event is the normal case rather than a failure.
      const started = await startTournament(tournament.Id);

      if (!started.ok) {
        return NextResponse.json({ error: started.error }, { status: 400 });
      }

      await logAdminAction(
        ctx,
        "tournament.start",
        undefined,
        `${tournament.Slug}: ${started.teams} teams, ${started.matches} matches`,
      );

      return NextResponse.json(started);
    }

    default:
      break;
  }

  // ------------------------------------------------------------------ save
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) {
    data.Name = body.name.trim().slice(0, 128);
  }
  if (typeof body.description === "string") {
    data.Description = body.description.trim().slice(0, 4000) || null;
  }
  if (body.visibility && VISIBILITIES.includes(body.visibility)) {
    data.Visibility = body.visibility;

    // Turning invite-only on with no token yet would produce a tournament
    // nobody can register for, including via a link that does not exist.
    if (body.visibility === "invite" && !tournament.InviteToken) {
      data.InviteToken = token();
    }
  }

  if (typeof body.maxTeams === "number" && body.maxTeams >= 2 && body.maxTeams <= 128) {
    data.MaxTeams = Math.trunc(body.maxTeams);
  }
  if (typeof body.teamSize === "number" && (TEAM_SIZES as readonly number[]).includes(body.teamSize)) {
    data.TeamSize = body.teamSize;
  }

  // Deliberately outside the format freeze below. Format, seeding and series
  // length shape a bracket that already exists once the tournament has started;
  // when the roles are drafted shapes nothing but the next match, and an
  // organizer who finds the per-match draft is costing them ten minutes a round
  // should be able to turn it off without regenerating anything.
  if (body.roleMode && ROLE_MODES.includes(body.roleMode)) {
    data.RoleMode = body.roleMode;
  }

  // Format, seeding and series length shape the bracket, so they freeze the
  // moment it exists. Silently ignoring them would be worse than refusing.
  const wantsFormatChange =
    body.format !== undefined ||
    body.seeding !== undefined ||
    body.bestOf !== undefined ||
    body.finalBestOf !== undefined;

  if (wantsFormatChange) {
    if (!canEditFormat(edition)) {
      return NextResponse.json(
        { error: "The tournament has started — the format is fixed now." },
        { status: 400 },
      );
    }

    if (body.format && FORMATS.includes(body.format)) data.Format = body.format;
    if (body.seeding && SEEDINGS.includes(body.seeding)) data.Seeding = body.seeding;
    if (typeof body.bestOf === "number" && body.bestOf >= 1 && body.bestOf <= 7) {
      data.BestOf = Math.trunc(body.bestOf);
    }
    if (body.finalBestOf === null) data.FinalBestOf = null;
    else if (typeof body.finalBestOf === "number" && body.finalBestOf >= 1 && body.finalBestOf <= 7) {
      data.FinalBestOf = Math.trunc(body.finalBestOf);
    }
  }

  if (body.startsAt === null) {
    data.StartsAt = null;
  } else if (typeof body.startsAt === "string" && body.startsAt.trim()) {
    const when = new Date(body.startsAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: "That start time is not a date." }, { status: 400 });
    }
    data.StartsAt = when;
  }

  if (typeof body.rulesText === "string") data.RulesText = body.rulesText.slice(0, 20000) || null;
  if (typeof body.prizeText === "string") data.PrizeText = body.prizeText.slice(0, 4000) || null;
  if (typeof body.sponsorsText === "string") data.SponsorsText = body.sponsorsText.slice(0, 4000) || null;

  if (body.discordUrl !== undefined) data.DiscordUrl = safeUrl(body.discordUrl);
  if (body.teamSpeakUrl !== undefined) data.TeamSpeakUrl = safeUrl(body.teamSpeakUrl);
  if (body.twitchChannels !== undefined) data.TwitchChannels = safeChannels(body.twitchChannels);

  if (Object.keys(data).length > 0) {
    await prisma.tournament.update({ where: { Id: tournament.Id }, data });
  }

  // The pool is its own table, replaced wholesale — a partial edit of a map
  // list is not a thing anybody wants.
  if (Array.isArray(body.maps)) {
    const maps = body.maps.map((m) => m.trim()).filter(Boolean).slice(0, 32);
    await prisma.$transaction([
      prisma.tournamentMap.deleteMany({ where: { TournamentId: tournament.Id } }),
      prisma.tournamentMap.createMany({
        data: maps.map((map, i) => ({ TournamentId: tournament.Id, Map: map, Ordinal: i })),
      }),
    ]);
  }

  await logAdminAction(ctx, "tournament.settings", undefined, tournament.Slug);
  return NextResponse.json({ ok: true });
}
