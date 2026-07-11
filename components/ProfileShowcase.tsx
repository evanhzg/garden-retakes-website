"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  emptyLoadout,
  normaliseStore,
  type InventoryStore,
  type Loadout,
} from "@/lib/inventory";
import type { ProfileStats } from "@/app/profile/page";

type Side = "t" | "ct";
type WeaponEntry = { def: number; name: string; image: string };
type Catalog = Record<string, WeaponEntry[]>;

// Fixed preview slots (defs resolved from cs2-lib).
const T_SLOTS = [
  { def: 7, label: "AK-47" },
  { def: 9, label: "AWP" },
  { def: 1, label: "Desert Eagle" },
  { def: 4, label: "Glock-18" },
];
const CT_SLOTS = [
  { def: 0, label: "M4", m4: true }, // def replaced by preferredM4 (16 / 60)
  { def: 9, label: "AWP" },
  { def: 1, label: "Desert Eagle" },
  { def: 61, label: "USP-S" },
];
const M4A4 = 16;
const M4A1S = 60;

export default function ProfileShowcase({
  steamId,
  initialName,
  steamName,
  stats,
}: {
  steamId: string;
  initialName: string;
  steamName: string | null;
  stats: ProfileStats;
}) {
  const router = useRouter();
  const [store, setStore] = useState<InventoryStore | null>(null);
  const [baseImages, setBaseImages] = useState<Map<number, string>>(new Map());
  const [selectedId, setSelectedId] = useState<string>("");
  const [side, setSide] = useState<Side>("t");
  const [name, setName] = useState(initialName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialName);
  const [saving, setSaving] = useState(false);

  // ---------- Load loadouts + base weapon images ----------

  useEffect(() => {
    fetch("/api/inventory")
      .then((r) => r.json())
      .then((data) => {
        const s = normaliseStore(data);
        setStore(s);
        setSelectedId(s.activeLoadoutId);
      })
      .catch(() => setStore(null));

    fetch("/api/weapons")
      .then((r) => r.json())
      .then((catalog: Catalog) => {
        const map = new Map<number, string>();
        for (const list of Object.values(catalog)) {
          for (const w of list) map.set(w.def, w.image);
        }
        setBaseImages(map);
      })
      .catch(() => {});
  }, []);

  const loadout: Loadout | undefined = useMemo(
    () => store?.loadouts.find((l) => l.id === selectedId) ?? store?.loadouts[0],
    [store, selectedId]
  );

  const slots = side === "t" ? T_SLOTS : CT_SLOTS;
  const preferredM4 = loadout?.preferredM4 ?? M4A4;

  const slotImage = (def: number): { image: string | null; hasSkin: boolean; name?: string } => {
    if (!store || !loadout) return { image: baseImages.get(def) ?? null, hasSkin: false };
    const map = side === "t" ? loadout.equippedT : loadout.equippedCT;
    const itemId = map[def];
    const item = itemId ? store.items.find((i) => i.id === itemId) : undefined;
    if (item) return { image: item.image, hasSkin: true, name: item.skinName };
    return { image: baseImages.get(def) ?? null, hasSkin: false };
  };

  const slotItemKG = (kind: "knife" | "gloves"): { image: string | null; hasSkin: boolean; name?: string } => {
    if (!store || !loadout) return { image: null, hasSkin: false };
    const itemId =
      kind === "knife"
        ? side === "t" ? loadout.knifeT : loadout.knifeCT
        : side === "t" ? loadout.glovesT : loadout.glovesCT;
    const item = itemId ? store.items.find((i) => i.id === itemId) : undefined;
    if (item) return { image: item.image, hasSkin: true, name: item.skinName };
    return { image: null, hasSkin: false };
  };

  // ---------- Persist helpers ----------

  const persist = useCallback((next: InventoryStore) => {
    fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {});
  }, []);

  const setPreferredM4 = (def: number) => {
    if (!store || !loadout) return;
    const next: InventoryStore = {
      ...store,
      loadouts: store.loadouts.map((l) => (l.id === loadout.id ? { ...l, preferredM4: def } : l)),
    };
    setStore(next);
    persist(next);
  };

  const addLoadout = async () => {
    const base = store ?? normaliseStore(null);
    const loadout = emptyLoadout(`Loadout ${base.loadouts.length + 1}`);
    const next: InventoryStore = {
      ...base,
      loadouts: [...base.loadouts, loadout],
      activeLoadoutId: loadout.id,
    };
    persist(next);
    router.push("/inventory");
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        setName(trimmed);
        setEditingName(false);
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------- Render ----------

  return (
    <section className="profile-showcase">
      <div className="ps-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="ps-bg"
          src={`/${steamId}-character.PNG`}
          alt=""
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/default-character.PNG"; }}
        />
        <div className="ps-scrim" aria-hidden="true" />

        {/* Username — top center */}
        <div className="ps-username">
          {editingName ? (
            <div className="ps-name-edit">
              <input
                className="input"
                value={nameDraft}
                maxLength={32}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
              />
              <button className="btn small" onClick={saveName} disabled={saving}>
                {saving ? "…" : "Save"}
              </button>
            </div>
          ) : (
            <button
              className="ps-name"
              title="Click to edit your name"
              onClick={() => {
                setNameDraft(name);
                setEditingName(true);
              }}
            >
              {name}
              <span className="ps-name-edit-icon">✎</span>
            </button>
          )}
          <div className="ps-steamid">SteamID64 {steamId}</div>
        </div>

        {/* Stats — left */}
        <div className="ps-stats">
          <div className="ps-stat big">
            <span className="v">{stats.rating.toFixed(2)}</span>
            <span className="k">Rating</span>
          </div>
          <div className="ps-stat">
            <span className="v">{stats.elo ?? "—"}</span>
            <span className="k">CS Rating{stats.peakElo ? ` · peak ${stats.peakElo}` : ""}</span>
          </div>
          <div className="ps-stat">
            <span className="v">{stats.kd.toFixed(2)}</span>
            <span className="k">K/D</span>
          </div>
          <div className="ps-stat">
            <span className="v">{stats.adr.toFixed(0)}</span>
            <span className="k">ADR</span>
          </div>
          <div className="ps-stat">
            <span className="v">{stats.winPct.toFixed(0)}%</span>
            <span className="k">Win rate · {stats.rounds} rds</span>
          </div>
          <div className="ps-stat">
            <span className="v">{stats.clutches}</span>
            <span className="k">Clutches · {stats.openingKills} OK</span>
          </div>
        </div>

        {/* Loadout preview — right */}
        <div className="ps-loadout">
          <div className="ps-lo-controls">
            <select
              className="input ps-lo-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {(store?.loadouts ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button className="btn small" title="Create a new loadout" onClick={addLoadout}>
              +
            </button>
          </div>

          <div className="ps-side-toggle">
            {(["t", "ct"] as Side[]).map((s) => (
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
            {slots.map((slot) => {
              const def = "m4" in slot && slot.m4 ? preferredM4 : slot.def;
              const { image, hasSkin, name: skinName } = slotImage(def);
              return (
                <div key={slot.label} className={`ps-gun ${hasSkin ? "has-skin" : "empty"}`}>
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={slot.label} loading="lazy" />
                  ) : (
                    <div className="ps-gun-ph" />
                  )}
                  <div className="ps-gun-label">
                    {"m4" in slot && slot.m4 ? (
                      <span className="ps-m4-toggle">
                        <button
                          className={preferredM4 === M4A4 ? "active" : ""}
                          onClick={() => setPreferredM4(M4A4)}
                        >
                          M4A4
                        </button>
                        <button
                          className={preferredM4 === M4A1S ? "active" : ""}
                          onClick={() => setPreferredM4(M4A1S)}
                        >
                          M4A1-S
                        </button>
                      </span>
                    ) : (
                      <span className="ps-gun-name">{hasSkin ? skinName?.split(" | ")[1] ?? slot.label : slot.label}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Knife + Gloves */}
          <div className="ps-guns ps-extras">
            {(["knife", "gloves"] as const).map((kind) => {
              const label = kind === "knife" ? "🗡 Knife" : "🧤 Gloves";
              const { image, hasSkin, name: skinName } = slotItemKG(kind);
              return (
                <div key={kind} className={`ps-gun ${hasSkin ? "has-skin" : "empty"}`}>
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={label} loading="lazy" />
                  ) : (
                    <div className="ps-gun-ph" />
                  )}
                  <div className="ps-gun-label">
                    <span className="ps-gun-name">
                      {hasSkin ? skinName?.split(" | ")[1] ?? label : label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <a className="btn small secondary ps-edit-loadouts" href="/inventory">
            Edit loadouts →
          </a>
        </div>
      </div>
    </section>
  );
}
