"use client";

import { useEffect, useState } from "react";
import ClipModal from "@/components/feed/ClipModal";
import type { Clip } from "@/components/feed/ClipCard";
import type { Variant } from "@/components/feed/VideoPlayer";

// The player's best clip, on their profile hero.
//
// "Best" is the one other people reacted to most, not the newest — a profile
// should open on the thing worth watching. Likes lead and comments break ties,
// since a clip people argued about is a clip worth seeing.
//
// Renders nothing at all when they have no clips: an empty frame saying "no
// clips" in a hero is worse than the hero simply being shorter.

const score = (c: Clip) => c.likes * 3 + c.comments;

export default function FeaturedClip({ steamId }: { steamId: string }) {
  const [clip, setClip] = useState<Clip | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/feed?steamId=${steamId}&range=all&sort=likes&take=20`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const clips: Clip[] = (json.clips ?? []).filter((c: Clip) => !c.unlisted);
        if (clips.length === 0) return;
        setClip([...clips].sort((a, b) => score(b) - score(a))[0]);
      })
      .catch(() => {
        /* the hero is fine without it */
      })
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [steamId]);

  // The card used to appear once the fetch landed, shoving the loadout beside
  // it down the page a moment after it had been read. The space is reserved
  // from the start and says which of the two states it is in.
  if (!loaded) {
    return (
      <div className="pro-feature is-skeleton" aria-busy="true">
        <span className="pro-feature-media" />
        <span className="pro-feature-meta">
          <span className="kicker">Top clip</span>
          <span className="pro-feature-title muted">Looking for one…</span>
        </span>
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="pro-feature is-empty">
        <span className="pro-feature-media" />
        <span className="pro-feature-meta">
          <span className="kicker">Top clip</span>
          <span className="pro-feature-title muted">No clips yet</span>
          <span className="pro-feature-counts">Post one on the feed, or type /clip in game.</span>
        </span>
      </div>
    );
  }

  const variants: Variant[] = (() => {
    if (clip.variants) {
      try {
        const parsed = JSON.parse(clip.variants) as Variant[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch {
        /* fall through */
      }
    }
    if (clip.kind === "upload") return [{ name: "Source", height: 0, url: `/api/feed/video/${encodeURIComponent(clip.source)}` }];
    if (clip.kind === "r2") return [{ name: "Source", height: 0, url: clip.source }];
    return [];
  })();

  return (
    <>
      <button className="pro-feature" onClick={() => setOpen(true)} aria-label={`Play ${clip.title}`}>
        <span className="pro-feature-media">
          {clip.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clip.thumb} alt="" loading="lazy" />
          ) : (
            <span className="pro-feature-ph" aria-hidden />
          )}
          <span className="clip-play" aria-hidden>▶</span>
        </span>
        <span className="pro-feature-meta">
          <span className="kicker">Top clip</span>
          <span className="pro-feature-title">{clip.title}</span>
          <span className="pro-feature-counts num">
            ♥ {clip.likes} · 💬 {clip.comments}
          </span>
        </span>
      </button>

      {open && <ClipModal clip={clip} variants={variants} onClose={() => setOpen(false)} />}
    </>
  );
}
