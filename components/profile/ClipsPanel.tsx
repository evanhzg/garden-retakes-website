"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from '@/components/I18nProvider';
import ClipCard, { type Clip } from "@/components/feed/ClipCard";

// A player's own clips, on their profile. Same card as the feed so a clip looks
// and behaves identically wherever it appears.

export default function ClipsPanel({ steamId, signedIn }: { steamId: string; signedIn: boolean }) {
  const { t } = useI18n();
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/feed?steamId=${steamId}&range=all&sort=new`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok) return setError(json.error ?? t("profile.clips.error"));
        setClips(json.clips ?? []);
      })
      .catch(() => !cancelled && setError(t("profile.clips.error")));
    return () => {
      cancelled = true;
    };
  }, [steamId]);

  if (error) {
    return (
      <p className="skin-note skin-note-warn">
        <span><strong>{t("profile.clips.unavailable")}</strong> {error}</span>
      </p>
    );
  }

  if (clips === null) return <p className="muted">{t("profile.clips.loading")}</p>;

  if (clips.length === 0) {
    return (
      <div className="empty-hint">
        <p style={{ margin: 0 }}>{t("profile.clips.empty")}</p>
        <Link className="btn btn-secondary" href="/feed" style={{ marginTop: 12 }}>
          {t("profile.clips.goToFeed")}
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
