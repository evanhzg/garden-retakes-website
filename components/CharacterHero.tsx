"use client";

import { useEffect, useState } from "react";
import type { PublicLoadout, PublicLoadoutSlot } from "@/app/api/inventory/[steamId]/route";

type StatEntry = { label: string; value: string; big?: boolean };

function GunCard({ slot }: { slot: PublicLoadoutSlot }) {
  return (
    <div className={`ps-gun ${slot.hasSkin ? "has-skin" : "empty"}`}>
      {slot.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slot.image} alt={slot.label} loading="lazy" />
      ) : (
        <div className="ps-gun-ph" />
      )}
      <div className="ps-gun-label">
        <span className="ps-gun-name">
          {slot.hasSkin && slot.skinName
            ? slot.skinName.split(" | ")[1] ?? slot.label
            : slot.label}
        </span>
      </div>
    </div>
  );
}

/**
 * Full-width character image hero with overlaid stats + active loadout preview.
 * Used on /players/[steamId] pages (read-only; no editing).
 */
export default function CharacterHero({
  steamId,
  playerName,
  stats,
  characterSrc,
}: {
  steamId: string;
  playerName: string;
  stats: StatEntry[];
  characterSrc?: string | null;
}) {
  const [loadout, setLoadout] = useState<PublicLoadout | null>(null);
  const [side, setSide] = useState<"t" | "ct">("t");
  const [overlaysVisible, setOverlaysVisible] = useState(true);

  useEffect(() => {
    fetch(`/api/inventory/${steamId}`)
      .then((r) => r.json())
      .then((d) => setLoadout(d ?? null))
      .catch(() => setLoadout(null));
  }, [steamId]);

  const slots = side === "t" ? loadout?.t : loadout?.ct;
  const knife = side === "t" ? loadout?.knife.t : loadout?.knife.ct;
  const gloves = side === "t" ? loadout?.gloves.t : loadout?.gloves.ct;

  return (
    <section className="profile-showcase">
      <div className="ps-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="ps-bg"
          src={characterSrc || `/${steamId}_character.PNG`}
          alt=""
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "/default_character.PNG";
          }}
        />
        <div className="ps-scrim" aria-hidden="true" />

        {/* Toggle button */}
        <button
          className="ps-overlay-toggle btn small secondary"
          onClick={() => setOverlaysVisible((v) => !v)}
          title={overlaysVisible ? "Hide overlays" : "Show overlays"}
        >
          {overlaysVisible ? "Hide overlays" : "Show overlays"}
        </button>

        {/* Overlays wrapper — fades in/out */}
        <div className={`ps-overlays ${overlaysVisible ? "visible" : "hidden"}`}>
          {/* Name — top center */}
          <div className="ps-username">
            <div className="ps-name" style={{ cursor: "default" }}>
              {playerName}
            </div>
            <div className="ps-steamid">SteamID64 {steamId}</div>
          </div>

          {/* Stats — left */}
          <div className="ps-stats">
            {stats.map((s) => (
              <div key={s.label} className={`ps-stat${s.big ? " big" : ""}`}>
                <span className="v">{s.value}</span>
                <span className="k">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Loadout — right */}
          {loadout && (
            <div className="ps-loadout">
              <div className="ps-side-toggle">
                {(["t", "ct"] as const).map((s) => (
                  <button
                    key={s}
                    className={`ps-side ${side === s ? "active" : ""} side-${s}`}
                    onClick={() => setSide(s)}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="ps-guns">
                {(slots ?? []).map((slot, i) => (
                  <GunCard key={i} slot={slot} />
                ))}
              </div>

              {/* Knife + Gloves */}
              <div className="ps-guns ps-extras" style={{ marginTop: 8 }}>
                {knife && <GunCard slot={{ ...knife, label: "🗡 Knife" }} />}
                {gloves && <GunCard slot={{ ...gloves, label: "🧤 Gloves" }} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
