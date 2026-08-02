"use client";

import { useEffect } from "react";
import Link from "next/link";
import AvatarImage from "@/components/AvatarImage";
import VideoPlayer, { type Variant } from "@/components/feed/VideoPlayer";
import type { Clip } from "@/components/feed/ClipCard";

// Expanded view. Clicking a card opens the clip large, with the title, author
// and description beside it — the grid card stays small and scannable, and this
// is where you actually watch something.

export default function ClipModal({
  clip,
  variants,
  onClose,
}: {
  clip: Clip;
  variants: Variant[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes — unless the player is fullscreen, where the browser
      // should handle it and drop back to the modal rather than closing both.
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll while this is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
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
          <h2>{clip.title}</h2>
          <Link href={`/players/${clip.steamId}`} className="clip-author">
            <AvatarImage steamId={clip.steamId} src={clip.avatar} alt={clip.author} className="avatar avatar-sm" />
            {clip.author}
          </Link>
          {clip.description && <p className="clip-desc">{clip.description}</p>}
        </div>
      </div>
    </div>
  );
}
