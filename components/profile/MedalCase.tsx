"use client";

import { useEffect, useState } from "react";

// Medals under the name, beside the connections.
//
// Renders nothing when empty — an empty trophy case on every profile would say
// "you have none" to everyone, all season, which is not information anyone
// asked for.

type Medal = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  colour: string;
  note: string | null;
  seasonId: number;
};

export default function MedalCase({ steamId }: { steamId: string }) {
  const [medals, setMedals] = useState<Medal[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/medals?steamId=${steamId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setMedals(j.medals ?? []))
      .catch(() => !cancelled && setMedals([]));
    return () => {
      cancelled = true;
    };
  }, [steamId]);

  if (!medals || medals.length === 0) return null;

  return (
    <div className="medal-case">
      {medals.map((m) => (
        <span
          key={`${m.slug}-${m.seasonId}`}
          className="medal"
          style={{ ["--tint" as string]: m.colour }}
          title={`${m.name} — ${m.description}${m.note ? ` (${m.note})` : ""}`}
        >
          <span className="medal-icon" aria-hidden>{m.icon}</span>
          <span className="medal-name">{m.name}</span>
        </span>
      ))}
    </div>
  );
}
