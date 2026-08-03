import Link from "next/link";
import { prisma } from "@/lib/db";
import { resolveNames, nameFrom } from "@/lib/names";
import { getT } from "@/lib/serverI18n";

// A few recent clips, as evidence rather than a feature list.
//
// Posters only, no players: the point on a landing page is that the thing
// exists and has content in it, and a row of live <video> elements to make that
// point would cost more than the rest of the page put together.

export default async function ClipsPreview() {
  const t = getT();
  const clips = await prisma.feedClip
    .findMany({
      where: { Unlisted: false, Thumb: { not: null } },
      orderBy: { CreatedAt: "desc" },
      take: 4,
      select: { Id: true, Title: true, Thumb: true, SteamId: true, PlayerName: true, DurationSec: true },
    })
    .catch(() => []);

  if (clips.length === 0) return null;

  const names = await resolveNames(clips.map((c) => c.SteamId));

  return (
    <section className="home-block">
      <header className="home-block-head">
        <span className="kicker">{t("home.clips.kicker")}</span>
        <h2>{t("home.clips.title")}</h2>
        <Link href="/feed" className="btn btn-secondary">{t("home.clips.cta")}</Link>
      </header>

      <p className="home-block-lead">
        Type <code>/clip</code> in game and the last fifteen seconds are recorded, rendered and
        posted here. Upload a demo and every ace, 4K and 3K in it is found and cut for you.
      </p>

      <div className="home-clips">
        {clips.map((c) => (
          <Link key={c.Id} href={`/feed?clip=${c.Id}`} className="home-clip">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.Thumb ?? ""} alt="" loading="lazy" />
            <span className="home-clip-play" aria-hidden>▶</span>
            <span className="home-clip-meta">
              <strong>{c.Title}</strong>
              <span>{c.PlayerName || nameFrom(names, c.SteamId)}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
