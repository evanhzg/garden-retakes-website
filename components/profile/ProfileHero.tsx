"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AvatarImage from "@/components/AvatarImage";
import ProfileSettingsModal from "@/components/profile/ProfileSettingsModal";
import FeaturedClip from "@/components/profile/FeaturedClip";
import { ConnectionsBar } from "@/components/profile/Connections";
import MedalCase from "@/components/profile/MedalCase";
import { M4A1S, M4A4, SIGNATURE_SLOTS, normaliseStore } from "@/lib/inventory";
import type { InventoryItem, InventoryStore, Loadout, Side } from "@/lib/inventory";
import { useI18n } from '@/components/I18nProvider';
import type { ProfileHeroStats } from "@/app/profile/page";

// Replaces ProfileShowcase, which framed the profile around a 3D Garden-Pop on
// a bitmap backdrop with the stats and loadout floating over it as absolutely
// positioned overlays. Nothing about that matched the rest of the site, and the
// overlays had to be toggled off to read the image underneath. The Pop itself
// isn't gone — it moved to /games/profile, which is where it belongs.
//
// The loadout strip reads SIGNATURE_SLOTS, the same definition the inventory
// board renders, so "your loadout" means one thing across both pages.

type WeaponEntry = { def: number; name: string; image: string };

const SIDES: Side[] = ["t", "ct"];
const skinLabel = (name: string) => name.split(" | ")[1] ?? name;

/** Shape of /api/inventory/[steamId], for a profile that is not the viewer's. */
type PublicSlot = { label: string; image: string | null; hasSkin: boolean; skinName?: string };
type PublicLoadout = {
  name: string;
  t: PublicSlot[];
  ct: PublicSlot[];
  knife: { t: PublicSlot; ct: PublicSlot };
  gloves: { t: PublicSlot; ct: PublicSlot };
};

export default function ProfileHero({
  steamId,
  initialName,
  bio,
  country,
  stats,
  owner = true,
}: {
  steamId: string;
  initialName: string;
  bio: string | null;
  country: string | null;
  stats: ProfileHeroStats;
  /**
   * Whose profile this is. Someone else's is the same page minus the controls
   * that only make sense on your own, and its loadout comes from the public
   * read rather than the private one — same layout either way, which is the
   * point: a player page and your page should not be two different designs.
   */
  owner?: boolean;
}) {
    const { t } = useI18n();

  const [publicLoadout, setPublicLoadout] = useState<PublicLoadout | null>(null);
  const [store, setStore] = useState<InventoryStore | null>(null);
  const [baseImages, setBaseImages] = useState<Map<number, string>>(new Map());
  const [side, setSide] = useState<Side>("t");

  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!owner) {
      fetch(`/api/inventory/${steamId}`)
        .then((r) => r.json())
        .then((d) => setPublicLoadout(d ?? null))
        .catch(() => setPublicLoadout(null));
      return;
    }
    fetch("/api/inventory")
      .then((r) => r.json())
      .then((d) => setStore(normaliseStore(d)))
      .catch(() => setStore(null));

    fetch("/api/weapons")
      .then((r) => r.json())
      .then((catalog: Record<string, WeaponEntry[]>) => {
        const map = new Map<number, string>();
        for (const list of Object.values(catalog)) for (const w of list) map.set(w.def, w.image);
        setBaseImages(map);
      })
      .catch(() => {});
  }, [owner, steamId]);

  const loadout: Loadout | undefined = useMemo(
    () => store?.loadouts.find((l) => l.id === store.activeLoadoutId) ?? store?.loadouts[0],
    [store]
  );

  const itemById = (id?: string): InventoryItem | undefined =>
    id ? store?.items.find((i) => i.id === id) : undefined;

  const slots = useMemo(() => {
    if (!owner) {
      const p = publicLoadout;
      if (!p) return [];
      const guns = (side === "t" ? p.t : p.ct).map((g) => ({
        key: g.label,
        label: g.label,
        image: g.image,
        skin: g.hasSkin ? (g.skinName ?? "").split(" | ")[1] ?? g.skinName ?? null : null,
        rarity: undefined as string | undefined,
      }));
      const k = side === "t" ? p.knife.t : p.knife.ct;
      const gl = side === "t" ? p.gloves.t : p.gloves.ct;
      return [
        ...guns,
        { key: "knife", label: "Knife", image: k.image, skin: k.hasSkin ? k.skinName ?? null : null, rarity: undefined },
        { key: "gloves", label: "Gloves", image: gl.image, skin: gl.hasSkin ? gl.skinName ?? null : null, rarity: undefined },
      ];
    }
    const preferredM4 = loadout?.preferredM4 ?? M4A4;
    const guns = SIGNATURE_SLOTS[side].map((slot) => {
      const def = slot.m4 ? preferredM4 : slot.def;
      const item = itemById((side === "t" ? loadout?.equippedT : loadout?.equippedCT)?.[def]);
      return {
        key: slot.label,
        label: slot.m4 ? (preferredM4 === M4A1S ? "M4A1-S" : "M4A4") : slot.label,
        image: item?.image ?? baseImages.get(def) ?? null,
        skin: item ? skinLabel(item.skinName) : null,
        rarity: item?.rarity,
      };
    });
    const knife = itemById(side === "t" ? loadout?.knifeT : loadout?.knifeCT);
    const gloves = itemById(side === "t" ? loadout?.glovesT : loadout?.glovesCT);
    return [
      ...guns,
      { key: "knife", label: "Knife", image: knife?.image ?? null, skin: knife ? skinLabel(knife.skinName) : null, rarity: knife?.rarity },
      { key: "gloves", label: "Gloves", image: gloves?.image ?? null, skin: gloves ? skinLabel(gloves.skinName) : null, rarity: gloves?.rarity },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadout, side, baseImages, store, owner, publicLoadout]);

  const saveName = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save that name.");
        return;
      }
      setName(trimmed);
      setEditing(false);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  // Four headline figures, not six. Six equal tiles is a wall with no shape —
  // nothing is emphasised, so nothing is read. The rest stay one line below in
  // smaller type, which is where they belong: context, not headline.
  const headline = [
    { label: "Rating", value: stats.rating.toFixed(2) },
    { label: "CS Rating", value: stats.elo ?? "—", sub: stats.peakElo ? `peak ${stats.peakElo}` : undefined },
    { label: "K/D", value: stats.kd.toFixed(2) },
    { label: "ADR", value: stats.adr.toFixed(0) },
  ];

  const secondary = [
    { label: "Win rate", value: `${stats.winPct.toFixed(0)}%` },
    { label: "Rounds", value: stats.rounds },
    { label: "Clutches", value: stats.clutches },
    { label: "Opening kills", value: stats.openingKills },
  ];

  return (
    <section className="pro-hero">
      <div className="pro-id">
        <AvatarImage steamId={steamId} className="grayscale avatar avatar-xl" />
        <div style={{ minWidth: 0 }}>
          <span className="kicker">{owner ? "Your profile" : "Player"}</span>
          {owner && editing ? (
            <div className="pro-name-edit">
              <label className="sr-only" htmlFor="pro-name">{t("auto.profilehero.display_name")}</label>
              <input
                id="pro-name"
                className="input"
                value={draft}
                maxLength={32}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <button className="btn btn-primary" onClick={saveName} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>{t("auto.profilehero.cancel")}</button>
            </div>
          ) : (
            <h1 className="pro-name">
              {name}
              {owner && (
                <button
                  className="btn btn-ghost pro-name-btn"
                  onClick={() => {
                    setDraft(name);
                    setEditing(true);
                  }}
                >
                  {t("auto.profilehero.edit")}
                                                      </button>
              )}
            </h1>
          )}
          <div className="pro-sub num">
            {steamId}
            {country ? ` · ${country}` : ""}
          </div>
          {bio && <p className="pro-bio">{bio}</p>}
          {/* Who they are elsewhere, right under the name — it used to be a lone
              Discord button near the bottom of the page. */}
          <MedalCase steamId={steamId} />
          <ConnectionsBar steamId={steamId} />
          {error && (
            <p className="skin-note skin-note-error" role="alert" style={{ marginTop: "var(--space-2)" }}>
              <span>{error}</span>
            </p>
          )}
        </div>
        <div className="pro-id-actions">
          {owner && (
            <>
              {/* Settings used to live in a panel at the very bottom of the page. */}
              <button className="btn btn-primary" onClick={() => setSettingsOpen(true)}>
                {t("auto.profilehero.settings")}
                                            </button>
              <Link className="btn btn-secondary" href="/inventory">{t("auto.profilehero.loadouts")}</Link>
            </>
          )}
          <Link className="btn btn-secondary" href={`/compare?a=${steamId}`}>{t("auto.profilehero.compare")}</Link>
        </div>
      </div>

      <div className="pro-headline">
        {headline.map((h) => (
          <div key={h.label} className="pro-stat">
            <span className="num pro-stat-v">{h.value}</span>
            <span className="pro-stat-k">{h.label}</span>
            {h.sub && <span className="pro-stat-sub">{h.sub}</span>}
          </div>
        ))}
      </div>

      <dl className="pro-secondary">
        {secondary.map((sx) => (
          <div key={sx.label}>
            <dt>{sx.label}</dt>
            <dd className="num">{sx.value}</dd>
          </div>
        ))}
      </dl>

      {/* Best clip and loadout share a band. Both are "what this player looks
          like" rather than numbers, and side by side the hero stops being one
          long column of unrelated blocks. */}
      <div className="pro-showcase">
        <FeaturedClip steamId={steamId} />

        <div className="pro-loadout">
        <div className="pro-loadout-head is-bare">
          <h2>{t("auto.profilehero.equipped")}{owner ? (loadout ? ` — ${loadout.name}` : "") : publicLoadout ? ` — ${publicLoadout.name}` : ""}</h2>
          <div className="pro-sides" role="group" aria-label={t("auto.profilehero.side")}>
            {SIDES.map((s) => (
              <button key={s} className={`pro-sidebtn ${side === s ? "active" : ""}`} onClick={() => setSide(s)}>
                {s.toUpperCase()}
              </button>
            ))}
          </div>
          {owner && <Link className="btn btn-ghost" href="/inventory">{t("auto.profilehero.edit")}</Link>}
        </div>
        <div className="pro-guns">
          {slots.map((slot, i) => (
            <div
              key={slot.key}
              /* The rifle and pistol lead: they are what you look at all game,
                 and a flat grid of eight equal tiles said otherwise. */
              className={`pro-gun ${slot.skin ? "has" : ""} ${i < 2 ? "lead" : ""}`}
              style={slot.rarity ? ({ "--rarity": slot.rarity } as React.CSSProperties) : undefined}
            >
              {slot.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={slot.image} alt="" loading="lazy" />
              ) : (
                <span className="pro-gun-ph" aria-hidden />
              )}
              <span className="pro-gun-label">{slot.label}</span>
              <span className="pro-gun-skin">{slot.skin ?? "Default"}</span>
            </div>
          ))}
        </div>
      </div>

      </div>

      {owner && settingsOpen && <ProfileSettingsModal onClose={() => setSettingsOpen(false)} />}
    </section>
  );
}
