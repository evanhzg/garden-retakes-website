"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ClipCard, { type Clip } from "@/components/feed/ClipCard";

// A player's own clips, on their profile. Same card as the feed so a clip looks
// and behaves identically wherever it appears.

export default function ClipsPanel({ steamId, signedIn }: { steamId: string; signedIn: boolean }) {
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/feed?steamId=${steamId}&range=all&sort=new`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok) return setError(json.error ?? "Could not load clips.");
        setClips(json.clips ?? []);
      })
      .catch(() => !cancelled && setError("Could not load clips."));
    return () => {
      cancelled = true;
    };
  }, [steamId]);

  if (error) {
    return (
      <p className="skin-note skin-note-warn">
        <span><strong>Clips unavailable.</strong> {error}</span>
      </p>
    );
  }

  if (clips === null) return <p className="muted">Loading clips…</p>;

  if (clips.length === 0) {
    return (
      <div className="empty-hint">
        <p style={{ margin: 0 }}>No clips posted yet.</p>
        <Link className="btn btn-secondary" href="/feed" style={{ marginTop: 12 }}>
          Go to the feed
        </Link>
      </div>
    );
  }

  return (
    <div className="feed-grid">
      {clips.map((c) => (
        <ClipCard key={c.id} clip={c} signedIn={signedIn} />
      ))}
    </div>
  );
}
