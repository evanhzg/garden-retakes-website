"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import ClipModal from "@/components/feed/ClipModal";
import type { Clip } from "@/components/feed/ClipCard";
import { clipVariants, pickHero } from "@/lib/feedShared";

/**
 * The top of the feed: one clip worth watching, and four behind it.
 *
 * The feed's "hero" was a heading and a paragraph — a page about video that
 * opened with no video on it. This puts the best clip on screen, playing, and
 * the next four beside it.
 *
 * "Best" is `pickHero` in lib/feedShared: reaction decayed by age, which is the
 * formula the profile page already used plus a half-life it did not need. The
 * decay is the point — without it the most-liked clip of all time holds this
 * seat for ever, and a hero that never changes stops being looked at.
 *
 * It renders nothing when no clip has any reaction yet. A hero promoting
 * something nobody has watched is worse than the page starting at the grid,
 * and unlike the profile card there is a whole feed underneath to fall back on.
 */
export default function FeedHero({
  clips,
  loading,
  signedIn = false,
}: {
  clips: Clip[];
  loading: boolean;
  signedIn?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Clip | null>(null);

  // Unlisted clips are visible to their owner so they can name them. That does
  // not make one the front page.
  const hero = useMemo(() => pickHero(clips.filter((c) => !c.unlisted)), [clips]);

  // Reserve the space while the feed loads, so the filters and grid do not jump
  // down the page a moment after somebody has started reading them.
  if (loading) return <div className="feed-hero is-skeleton" aria-busy="true" />;
  if (!hero) return null;

  const { featured, rest } = hero;

  return (
    <>
      <section className="feed-hero" aria-label={t("feed.hero.label")}>
        <button className="feed-hero-main" onClick={() => setOpen(featured)}>
          <HeroVideo clip={featured} />
          <span className="feed-hero-meta">
            <span className="feed-hero-kicker">{t("feed.hero.kicker")}</span>
            <span className="feed-hero-title">{featured.title}</span>
            <span className="feed-hero-sub">
              {featured.author}
              <span className="feed-hero-stat">♥ {featured.likes}</span>
              {featured.comments > 0 && <span className="feed-hero-stat">💬 {featured.comments}</span>}
            </span>
          </span>
        </button>

        {rest.length > 0 && (
          <ul className="feed-hero-rest">
            {rest.map((clip) => (
              <li key={clip.id}>
                <button className="feed-hero-side" onClick={() => setOpen(clip)}>
                  <span
                    className="feed-hero-thumb"
                    style={clip.thumb ? { backgroundImage: `url(${clip.thumb})` } : undefined}
                  >
                    {!clip.thumb && <span aria-hidden>▸</span>}
                  </span>
                  <span className="feed-hero-side-text">
                    <span className="feed-hero-side-title">{clip.title}</span>
                    <span className="feed-hero-side-sub">
                      {clip.author} · ♥ {clip.likes}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <ClipModal
          clip={open}
          variants={clipVariants(open.kind, open.source, open.variants)}
          signedIn={signedIn}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/**
 * The lead clip, playing quietly.
 *
 * Muted and inline, because a page that makes noise when you open it is a page
 * people close. Autoplay is skipped entirely under reduced motion — that
 * setting exists for exactly this, and the site already honours it through
 * MotionToggle's `data-motion` attribute as well as the OS preference.
 *
 * Falls back to the poster for a YouTube clip, which cannot be played inline
 * without loading their iframe and its cookies into the top of the page.
 */
function HeroVideo({ clip }: { clip: Clip }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  const variants = useMemo(
    () => clipVariants(clip.kind, clip.source, clip.variants),
    [clip.kind, clip.source, clip.variants],
  );

  // Smallest rendition that is still worth looking at: this plays unbidden, so
  // it should not cost somebody on a phone their data to decorate a page.
  const source = useMemo(() => {
    if (variants.length === 0) return null;
    const usable = [...variants].sort((a, b) => a.height - b.height);
    return (usable.find((v) => v.height >= 480) ?? usable[usable.length - 1]).url;
  }, [variants]);

  useEffect(() => {
    const video = ref.current;
    if (!video || !source) return;

    // MotionToggle writes data-motion="full" | "off", and removes the attribute
    // entirely for "system". So: an explicit "off" always wins, an explicit
    // "full" overrides the OS, and no attribute means ask the OS.
    const pref = document.documentElement.dataset.motion;
    const reduced =
      pref === "off" ||
      (pref !== "full" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (reduced) return;

    // Autoplay is refused in plenty of situations, and a rejected promise here
    // is not an error — the poster stays up, which is a fine outcome.
    video.play().catch(() => {});
  }, [source]);

  if (!source || failed) {
    return (
      <span
        className="feed-hero-poster"
        style={clip.thumb ? { backgroundImage: `url(${clip.thumb})` } : undefined}
      >
        <span className="feed-hero-play" aria-hidden>▸</span>
      </span>
    );
  }

  return (
    <video
      ref={ref}
      className="feed-hero-video"
      src={source}
      poster={clip.thumb ?? undefined}
      muted
      loop
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      tabIndex={-1}
      aria-hidden
    />
  );
}
