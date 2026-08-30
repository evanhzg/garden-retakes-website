import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Following an org.
 *
 * The point is the notification: somebody who liked the last event wants to
 * know about the next one, and today the only way to find out is to keep
 * checking the tournaments page. Publishing a tournament tells the followers —
 * see lib/tournament/orgNotify.
 *
 * A toggle rather than separate follow/unfollow verbs, because the button is a
 * toggle and giving it two endpoints means the client tracking which one to
 * call and getting it wrong after a failed request.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  const steamId = session?.steamId ? String(session.steamId) : null;
  if (!steamId) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  let body: { orgId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const orgId = Number(body.orgId);
  const org = Number.isFinite(orgId)
    ? await prisma.gardenOrg.findUnique({ where: { Id: orgId } })
    : null;
  if (!org) return NextResponse.json({ error: "no such org" }, { status: 404 });

  const id = BigInt(steamId);
  const existing = await prisma.gardenOrgFollow.findFirst({
    where: { OrgId: org.Id, SteamId: id },
  });

  if (existing) {
    await prisma.gardenOrgFollow.delete({ where: { Id: existing.Id } });
  } else {
    await prisma.gardenOrgFollow.create({ data: { OrgId: org.Id, SteamId: id } });
  }

  const followers = await prisma.gardenOrgFollow.count({ where: { OrgId: org.Id } });

  return NextResponse.json({ ok: true, following: !existing, followers });
}
