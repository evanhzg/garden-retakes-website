import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getAdminContext } from "@/lib/adminAuth";
import { membersOf, tournamentsOf } from "@/lib/tournament/orgs";
import { resolveNames } from "@/lib/names";
import AvatarImage from "@/components/AvatarImage";
import FollowOrg from "@/components/tournament/FollowOrg";
import OrgAdmin from "@/components/tournament/OrgAdmin";
import "@/components/tournament/org.css";

export const dynamic = "force-dynamic";

/**
 * An organization's page.
 *
 * The thing a tournament's "by ..." points at, and the reason an org exists as
 * a row rather than as a list of SteamIDs: somewhere to send a person who liked
 * the last event and wants to know when the next one is.
 *
 * Public, because it is a shop window. The edit controls below are rendered
 * only for admins, and every action behind them is checked again on the server.
 */
export default async function OrgPage({ params }: { params: { slug: string } }) {
  const org = await prisma.gardenOrg.findUnique({ where: { Slug: params.slug } });
  if (!org) notFound();

  const [members, { live, upcoming, past }, followers, session, ctx] = await Promise.all([
    membersOf(org.Id),
    tournamentsOf(org.Id),
    prisma.gardenOrgFollow.count({ where: { OrgId: org.Id } }),
    getSession(),
    getAdminContext(null),
  ]);

  const steamId = session?.steamId ? String(session.steamId) : null;
  const following = steamId
    ? (await prisma.gardenOrgFollow.findFirst({
        where: { OrgId: org.Id, SteamId: BigInt(steamId) },
      })) !== null
    : false;

  const names = await resolveNames(members.map((m) => m.SteamId));
  const canEdit = Boolean(ctx.viaKey) || ctx.level >= 2;

  const links = [
    ["Discord", org.DiscordUrl],
    ["Twitch", org.TwitchUrl],
    ["YouTube", org.YoutubeUrl],
    ["X", org.TwitterUrl],
    ["Site", org.WebsiteUrl],
  ].filter(([, url]) => Boolean(url)) as [string, string][];

  return (
    <>
      <section className="hero hero-compact org-hero">
        {org.ImageMime && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="org-banner" src={`/api/orgs/image?slug=${org.Slug}`} alt="" />
        )}

        <div className="hero-inner org-hero-inner">
          <h1 className="grad">{org.Name}</h1>

          <div className="org-actions">
            <FollowOrg orgId={org.Id} initialFollowing={following} initialFollowers={followers} />
          </div>

          {links.length > 0 && (
            <p className="org-links">
              {links.map(([label, url]) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              ))}
            </p>
          )}
        </div>
      </section>

      {org.Description && (
        <section className="panel">
          <p className="org-desc">{org.Description}</p>
        </section>
      )}

      {org.TrailerYoutubeId && (
        <section className="panel">
          {/* youtube-nocookie, and no autoplay. A page that starts talking at
              somebody who followed a link from a bracket is a page they close. */}
          <div className="org-trailer">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${org.TrailerYoutubeId}`}
              title={`${org.Name} trailer`}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </section>
      )}

      {members.length > 0 && (
        <section className="panel">
          <h3>Team</h3>
          <ul className="org-members">
            {members.map((m) => (
              <li key={m.SteamId.toString()}>
                <AvatarImage steamId={m.SteamId.toString()} alt="" className="org-member-avatar" />
                <Link href={`/players/${m.SteamId}`} className="org-member-name">
                  {names.get(m.SteamId.toString()) ?? m.SteamId.toString()}
                </Link>
                <span className={`org-role role-${m.Role}`}>{m.Role}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TournamentList title="Live" rows={live} />
      <TournamentList title="Coming up" rows={upcoming} />
      <TournamentList title="Past" rows={past} />

      {canEdit && <OrgAdmin org={{ id: org.Id, slug: org.Slug }} />}
    </>
  );
}

function TournamentList({
  title,
  rows,
}: {
  title: string;
  rows: { Id: number; Slug: string; Name: string; StartsAt: Date | null; State: string }[];
}) {
  // An empty section is worse than none: three headings with nothing under two
  // of them reads as a page that failed to load.
  if (rows.length === 0) return null;

  return (
    <section className="panel">
      <h3>{title}</h3>
      <ul className="org-tournaments">
        {rows.map((t) => (
          <li key={t.Id}>
            <Link href={`/tournaments/${t.Slug}`}>{t.Name}</Link>
            {t.StartsAt && (
              <time dateTime={t.StartsAt.toISOString()}>
                {t.StartsAt.toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </time>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
