import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getAdminContext } from "@/lib/adminAuth";
import { membersOf, orgSlug } from "@/lib/tournament/orgs";
import { resolveNames } from "@/lib/names";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Organizations.
 *
 * Creating and editing is admin-only for now, which is the request and also the
 * cautious order to do it in: an org grants tournament permissions to everybody
 * in it, so "who may make one" is a question worth answering conservatively
 * until the shape has been used in anger.
 *
 * Reading is public. An org page is a shop window — past events, the next one,
 * who runs it — and gating that would defeat the point of having one.
 */

/** Admin, in the site-wide sense. Orgs are not scoped to a tournament. */
async function isAdmin(): Promise<boolean> {
  const ctx = await getAdminContext(null);
  return Boolean(ctx.viaKey) || ctx.level >= 2;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");

  if (slug) {
    const org = await prisma.gardenOrg.findUnique({ where: { Slug: slug } });
    if (!org) return NextResponse.json({ error: "no such org" }, { status: 404 });

    const members = await membersOf(org.Id);
    const names = await resolveNames(members.map((m) => m.SteamId));

    const session = await getSession();
    const steamId = session?.steamId ? String(session.steamId) : null;

    const [followers, following] = await Promise.all([
      prisma.gardenOrgFollow.count({ where: { OrgId: org.Id } }),
      steamId
        ? prisma.gardenOrgFollow.findFirst({
            where: { OrgId: org.Id, SteamId: BigInt(steamId) },
          })
        : null,
    ]);

    return NextResponse.json({
      org: shape(org),
      members: members.map((m) => ({
        steamId: m.SteamId.toString(),
        name: names.get(m.SteamId.toString()) ?? m.SteamId.toString(),
        role: m.Role,
      })),
      followers,
      following: Boolean(following),
      canEdit: await isAdmin(),
    });
  }

  // The list, for the filter on the tournaments page.
  const orgs = await prisma.gardenOrg.findMany({ orderBy: { Name: "asc" } });
  return NextResponse.json({ orgs: orgs.map(shape), canEdit: await isAdmin() });
}

/** Without the image bytes, which are served by their own route. */
function shape(o: {
  Id: number;
  Slug: string;
  Name: string;
  Description: string | null;
  ImageMime: string | null;
  DiscordUrl: string | null;
  TwitchUrl: string | null;
  YoutubeUrl: string | null;
  WebsiteUrl: string | null;
  TwitterUrl: string | null;
  TrailerYoutubeId: string | null;
}) {
  return {
    id: o.Id,
    slug: o.Slug,
    name: o.Name,
    description: o.Description,
    hasImage: Boolean(o.ImageMime),
    discordUrl: o.DiscordUrl,
    twitchUrl: o.TwitchUrl,
    youtubeUrl: o.YoutubeUrl,
    websiteUrl: o.WebsiteUrl,
    twitterUrl: o.TwitterUrl,
    trailerYoutubeId: o.TrailerYoutubeId,
  };
}

/** A YouTube id out of whatever somebody pasted. */
function youtubeId(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // Already an id.
  if (/^[\w-]{11}$/.test(raw)) return raw;

  // Every shape of link people actually paste: watch?v=, youtu.be/, /embed/,
  // /shorts/. Storing the id rather than the URL means the embed source is
  // built once here instead of parsed on every render.
  const m = raw.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

const url = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  // Only http(s). A `javascript:` in a link somebody else clicks is the whole
  // of a stored XSS, and these are rendered as anchors on a public page.
  return /^https?:\/\//i.test(s) ? s.slice(0, 255) : null;
};

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "admins only" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const action = String(body.action ?? "");

  if (action === "create") {
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (name.length < 2) return NextResponse.json({ error: "a name is required" }, { status: 400 });

    const slug = orgSlug(name);
    if (!slug) return NextResponse.json({ error: "that name has no usable slug" }, { status: 400 });

    const clash = await prisma.gardenOrg.findUnique({ where: { Slug: slug } });
    if (clash) return NextResponse.json({ error: "an org with that name exists" }, { status: 409 });

    const org = await prisma.gardenOrg.create({ data: { Name: name, Slug: slug } });
    return NextResponse.json({ ok: true, slug: org.Slug });
  }

  const orgId = Number(body.orgId);
  const org = Number.isFinite(orgId)
    ? await prisma.gardenOrg.findUnique({ where: { Id: orgId } })
    : null;
  if (!org) return NextResponse.json({ error: "no such org" }, { status: 404 });

  if (action === "edit") {
    await prisma.gardenOrg.update({
      where: { Id: org.Id },
      data: {
        Description: String(body.description ?? "").slice(0, 4000) || null,
        DiscordUrl: url(body.discordUrl),
        TwitchUrl: url(body.twitchUrl),
        YoutubeUrl: url(body.youtubeUrl),
        WebsiteUrl: url(body.websiteUrl),
        TwitterUrl: url(body.twitterUrl),
        TrailerYoutubeId: youtubeId(String(body.trailer ?? "")),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "addMember") {
    const steamId = String(body.steamId ?? "").trim();
    if (!/^\d{17}$/.test(steamId)) {
      return NextResponse.json({ error: "a SteamID64 is required" }, { status: 400 });
    }

    const role = body.role === "organizer" ? "organizer" : "moderator";

    await prisma.gardenOrgMember.upsert({
      where: { OrgId_SteamId: { OrgId: org.Id, SteamId: BigInt(steamId) } },
      // Upsert rather than create: adding somebody who is already in the org is
      // how you change their role, and refusing it would mean remove-then-add
      // for a one-word edit.
      update: { Role: role },
      create: { OrgId: org.Id, SteamId: BigInt(steamId), Role: role },
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "removeMember") {
    const steamId = String(body.steamId ?? "").trim();
    await prisma.gardenOrgMember.deleteMany({
      where: { OrgId: org.Id, SteamId: BigInt(steamId || "0") },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
