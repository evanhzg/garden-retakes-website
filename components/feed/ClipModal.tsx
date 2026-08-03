"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import AvatarImage from "@/components/AvatarImage";
import ShareMenu from "@/components/feed/ShareMenu";
import ClipSocial from "@/components/feed/ClipSocial";
import VideoPlayer, { type Variant } from "@/components/feed/VideoPlayer";
import type { Clip } from "@/components/feed/ClipCard";

// Expanded view. Clicking a card opens the clip large, with the title, author
// and description beside it — the grid card stays small and scannable, and this
// is where you actually watch something.

export default function ClipModal({
  clip,
  variants,
  signedIn = false,
  onClose,
}: {
  clip: Clip;
  variants: Variant[];
  signedIn?: boolean;
  onClose: () => void;
}) {
  // Portalled to <body>. Rendered in place it sat inside the clip card, and an
  // ancestor with a transform in its animation keyframes becomes the containing
  // block for position:fixed — so once the feed was long enough to scroll, the
  // modal anchored to the card rather than the viewport.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes — unless the player is fullscreen, where the browser
      // should handle it and drop back to the modal rather than closing both.
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);

    // .main-content is the scroll container, not <body>, so locking the body
    // did nothing and the feed kept scrolling behind the modal.
    const scroller = document.querySelector<HTMLElement>(".main-content");
    const previous = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      if (scroller) scroller.style.overflow = previous;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="clip-modal" role="dialog" aria-modal="true" aria-label={clip.title} onClick={onClose}>
      <div className="clip-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="clip-modal-close" onClick={onClose} aria-label="Close">×</button>

        <div className="clip-modal-stage">
          {clip.kind === "youtube" ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${clip.source}?autoplay=1`}
              title={clip.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : (
            <VideoPlayer variants={variants} poster={clip.thumb} title={clip.title} autoPlay />
          )}
        </div>

        <div className="clip-modal-meta">
          <div className="clip-modal-meta-head">
            <h2>{clip.title}</h2>
            <ShareMenu clipId={clip.id} title={clip.title} />
          </div>
          {/* Same rule as the card: only link players who have a profile here. */}
          {clip.authorIsUser === false ? (
            <span className="clip-author is-guest" title="No profile on this site yet">
              <AvatarImage steamId={clip.steamId} src={clip.avatar} alt={clip.author} className="avatar avatar-sm" />
              {clip.author}
            </span>
          ) : (
            <Link href={`/players/${clip.steamId}`} className="clip-author">
              <AvatarImage steamId={clip.steamId} src={clip.avatar} alt={clip.author} className="avatar avatar-sm" />
              {clip.author}
            </Link>
          )}
          {clip.description && <p className="clip-desc">{clip.description}</p>}

          {/* Likes and comments live here too. Watching something and then
              having to close it to react to it is a round trip for no reason;
              the panel scrolls so a long thread never pushes the video off. */}
          <ClipSocial clip={clip} signedIn={signedIn} />
        </div>
      </div>
    </div>,
    document.body
  );
}
