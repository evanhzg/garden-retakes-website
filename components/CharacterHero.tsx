"use client";

import { useEffect, useState } from "react";
import AvatarImage from "@/components/AvatarImage";
import { useI18n } from '@/components/I18nProvider';
import type { PublicLoadout, PublicLoadoutSlot } from "@/app/api/inventory/[steamId]/route";

// The read-only twin of ProfileHero, shown on /players/[steamId] and
// /pros/[slug]. It used to be the same character-image-with-overlays treatment
// as the old ProfileShowcase — stats floating over a full-bleed PNG behind a
// scrim, with a button to hide them so you could see the art underneath. It now
// shares ProfileHero's markup and .pro-* styles, so your own profile and the
// one everyone else sees are the same page with different permissions.

type StatEntry = { label: string; value: string; big?: boolean };

const skinLabel = (slot: PublicLoadoutSlot) =>
  slot.hasSkin && slot.skinName ? slot.skinName.split(" | ")[1] ?? slot.label : null;

function GunCard({ slot, label }: { slot: PublicLoadoutSlot; label?: string }) {
  const skin = skinLabel(slot);
  return (
    <div className={`pro-gun ${skin ? "has" : ""}`}>
      {slot.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slot.image} alt="" loading="lazy" />
      ) : (
        <span className="pro-gun-ph" aria-hidden />
      )}
      <span className="pro-gun-label">{label ?? slot.label}</span>
      <span className="pro-gun-skin">{skin ?? "Default"}</span>
    </div>
  );
}

export default function CharacterHero({
  steamId,
  playerName,
  stats,
}: {
  steamId: string;
  playerName: string;
  stats: StatEntry[];
  /** Kept for call-site compatibility; the character PNG is no longer used. */
  characterSrc?: string | null;
}) {
    const { t } = useI18n();

  const [loadout, setLoadout] = useState<PublicLoadout | null>(null);
  const [side, setSide] = useState<"t" | "ct">("t");

  useEffect(() => {
    fetch(`/api/inventory/${steamId}`)
      .then((r) => r.json())
      .then((d) => setLoadout(d ?? null))
      .catch(() => setLoadout(null));
  }, [steamId]);

  const slots = side === "t" ? loadout?.t : loadout?.ct;
  const knife = side === "t" ? loadout?.knife.t : loadout?.knife.ct;
  const gloves = side === "t" ? loadout?.gloves.t : loadout?.gloves.ct;
  const hasLoadout = Boolean(loadout && ((slots?.length ?? 0) > 0 || knife || gloves));

  return (
    <section className="pro-hero">
      <div className="pro-id">
        <AvatarImage steamId={steamId} alt={playerName} className="grayscale avatar avatar-xl" />
        <div style={{ minWidth: 0 }}>
          <span className="kicker">{t("auto.characterhero.player")}</span>
          <h1 className="pro-name">{playerName}</h1>
          <div className="pro-sub num">{steamId}</div>
        </div>
      </div>

      {stats.length > 0 && (
        <div className="pro-headline">
          {stats.map((s) => (
            <div key={s.label} className="pro-stat">
              <span className="num pro-stat-v">{s.value}</span>
              <span className="pro-stat-k">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {hasLoadout && (
        <div className="pro-loadout">
          <div className="pro-loadout-head">
            <h2>{t("auto.characterhero.equipped")}</h2>
            <div className="pro-sides" role="group" aria-label={t("auto.characterhero.side")}>
              {(["t", "ct"] as const).map((s) => (
                <button
                  key={s}
                  className={`pro-sidebtn ${side === s ? "active" : ""}`}
                  onClick={() => setSide(s)}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="pro-guns">
            {(slots ?? []).map((slot, i) => (
              <GunCard key={`${side}-${i}`} slot={slot} />
            ))}
            {knife && <GunCard slot={knife} label={t("auto.characterhero.knife")} />}
            {gloves && <GunCard slot={gloves} label={t("auto.characterhero.gloves")} />}
          </div>
        </div>
      )}
    </section>
  );
}
