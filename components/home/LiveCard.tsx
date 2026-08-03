"use client";

import { useEffect, useState } from "react";
import { GAME_MODES } from "@/lib/gameModes";
import { useI18n } from "@/locales/client";

// What the server is playing, on the homepage.
//
// The card said "live" and a player count, which answers whether to bother
// looking but not whether to bother joining. Map and mode are the two things
// that decide that, and whether points are counting is the one that decides it
// most — so it gets the loudest treatment.

const MAP_LABEL: Record<string, { label: string; colour: string }> = {
  de_mirage: { label: "Mirage", colour: "#d9c39a" },
  de_inferno: { label: "Inferno", colour: "#c0392b" },
  de_nuke: { label: "Nuke", colour: "#2c3e6b" },
  de_ancient: { label: "Ancient", colour: "#4b8b3b" },
  de_dust2: { label: "Dust II", colour: "#e0b642" },
  de_anubis: { label: "Anubis", colour: "#d66a9c" },
  de_cache: { label: "Cache", colour: "#5a5a5a" },
  de_overpass: { label: "Overpass", colour: "#e08a3c" },
  de_vertigo: { label: "Vertigo", colour: "#7fb6d9" },
  de_train: { label: "Train", colour: "#b6b6b6" },
};

type Live = {
  online: boolean;
  map?: string | null;
  mode?: string | null;
  players?: number;
  ranked?: boolean;
  competitive?: boolean;
};

export default function LiveCard() {
  const t = useI18n();
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/server/live", { cache: "no-store" })
        .then((r) => r.json())
        .then(setLive)
        .catch(() => setLive({ online: false }));
    load();
    const id = window.setInterval(() => !document.hidden && load(), 45_000);
    return () => window.clearInterval(id);
  }, []);

  if (!live?.online) return null;

  const map = live.map ? MAP_LABEL[live.map] : undefined;
  const mode = GAME_MODES.find((m) => m.id === live.mode);

  // Competitive outranks ranked: both count, but only one is a real match.
  const banner = live.competitive ? t('home.liveCard.competitive') : live.ranked ? t('home.liveCard.ranked') : null;

  return (
    <div className="live-card">
      <span className="live-card-dot" aria-hidden />
      <span className="live-card-players num">{live.players ?? 0} {t('home.liveCard.online')}</span>

      {map && (
        <span className="live-card-map" style={{ ["--map" as string]: map.colour }}>
          {map.label}
        </span>
      )}

      {mode && <span className="live-card-mode">{mode.label}</span>}

      {banner && <strong className="live-card-banner">{banner}</strong>}
    </div>
  );
}
