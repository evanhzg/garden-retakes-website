import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSharedClip, absolute, siteOrigin } from "@/lib/feedClip";
import { youtubeEmbed } from "@/lib/feedShared";
import { getT } from "@/lib/serverI18n";
import ClipStage from "@/components/feed/ClipStage";
import ShareMenu from "@/components/feed/ShareMenu";
import AvatarImage from "@/components/AvatarImage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A clip on its own page, which is what a share link points at.
//
// This exists so a link pasted into Discord, X or Reddit unfurls into a playing
// video rather than a bare URL. Those crawlers never run our JavaScript, so the
// clip has to be described entirely in <meta> — og:video for Discord and
// Facebook, twitter:player for X, both pointing at /feed/<id>/embed.

const PLAYER_W = 1280;
const PLAYER_H = 720;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const clip = await getSharedClip(Number(params.id));
  if (!clip) return { title: "Clip not found" };

  const url = `${siteOrigin()}/feed/${clip.id}`;
  const embed = `${url}/embed`;
  const image = clip.thumb ? absolute(clip.thumb) : undefined;
  const description = clip.description || `A clip by ${clip.author} on REEEETAKES.`;

  // A YouTube clip is best embedded by YouTube itself; ours plays from the
  // rendition file directly, which is what Discord wants for inline playback.
  const video = clip.kind === "youtube" ? youtubeEmbed(clip.source) : clip.variants[0] ? absolute(clip.variants[0].url) : null;
  const isFile = clip.kind !== "youtube";

  return {
    title: clip.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "video.other",
      title: clip.title,
      description,
      url,
      siteName: "REEEETAKES",
      ...(image ? { images: [{ url: image, width: PLAYER_W, height: PLAYER_H, alt: clip.title }] } : {}),
      ...(video
        ? {
            videos: [
              {
                url: video,
                secureUrl: video,
                type: isFile ? "video/mp4" : "text/html",
                width: PLAYER_W,
                height: PLAYER_H,
              },
            ],
          }
        : {}),
    },
    // A player card needs a real stream to point at. A YouTube clip has none of
    // ours, so it falls back to a large image — X renders YouTube's own player
    // from the og:video anyway.
    twitter:
      video && isFile
        ? {
            card: "player",
            title: clip.title,
            description,
            ...(image ? { images: [image] } : {}),
            players: [{ playerUrl: embed, streamUrl: video, width: PLAYER_W, height: PLAYER_H }],
          }
        : {
            card: "summary_large_image",
            title: clip.title,
            description,
            ...(image ? { images: [image] } : {}),
          },
    // No `other` block: og:video:type comes from the openGraph block above, and
    // theme-color is already set once in the root layout.
  };
}

export default async function ClipPage({ params }: { params: { id: string } }) {
  const t = getT();
  const clip = await getSharedClip(Number(params.id));
  if (!clip) notFound();

  const when = new Date(clip.createdAt);

  return (
    <section className="pro-section clip-page">
      <nav className="clip-page-back">
        <Link href="/feed" className="btn btn-ghost">{t("feed.backToFeed")}</Link>
      </nav>

      <ClipStage clip={clip} />

      <header className="clip-page-head">
        <div>
          <h1 className="clip-page-title">{clip.title}</h1>
          <p className="clip-page-meta">
            {clip.authorIsUser ? (
              <Link href={`/players/${clip.steamId}`} className="clip-author">
                <AvatarImage steamId={clip.steamId} src={clip.avatar} alt={clip.author} className="avatar avatar-sm" />
                {clip.author}
              </Link>
            ) : (
              <span className="clip-author is-guest" title={t("feed.noProfileTooltip")}>
                <AvatarImage steamId={clip.steamId} src={clip.avatar} alt={clip.author} className="avatar avatar-sm" />
                {clip.author}
              </span>
            )}
            <span className="clip-time" title={when.toLocaleString()}>
              {when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </span>
            <span className="clip-page-counts num">
              ♥ {clip.likes} · 💬 {clip.comments}
            </span>
          </p>
        </div>
        <ShareMenu clipId={clip.id} title={clip.title} />
      </header>

      {clip.description && <p className="clip-page-desc">{clip.description}</p>}
    </section>
  );
}
