"use client";

import VideoPlayer from "@/components/feed/VideoPlayer";
import { youtubeEmbed } from "@/lib/feedShared";
import type { SharedClip } from "@/lib/feedClip";

// The video itself, on the share page and in the embed.
//
// A thin client wrapper so the pages around it can stay server components: the
// player needs state, the page does not.

export default function ClipStage({ clip, autoPlay = false }: { clip: SharedClip; autoPlay?: boolean }) {
  if (clip.kind === "youtube") {
    return (
      <div className="clip-page-stage">
        <iframe
          src={`${youtubeEmbed(clip.source)}${autoPlay ? "?autoplay=1" : ""}`}
          title={clip.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="clip-page-stage">
      <VideoPlayer variants={clip.variants} poster={clip.thumb} title={clip.title} autoPlay={autoPlay} />
    </div>
  );
}
