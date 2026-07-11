"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InventoryItem,
  InventoryStore,
  ItemKind,
  Loadout,
  LOADOUT_COLORS,
  PlacedSticker,
  SLOT_ANCHORS,
  Side,
  Team,
  defaultStickerSlots,
  defaultStore,
  emptyLoadout,
  loadStore,
  loadoutSize,
  newId,
  normaliseStore,
  saveStore,
  skinKey,
} from "@/lib/inventory";
import { importSnapshot, type LoadoutSnapshot } from "@/lib/share";

type WeaponEntry = {
  id: number;
  def: number;
  name: string;
  model: string;
  image: string;
  category: string;
  team: Team;
};
type Skin = { id: number; def: number; paint: number; name: string; image: string; rarity: string; collection?: string };
type StickerOption = { id: number; def: number; name: string; image: string; rarity: string };
type Catalog = Record<string, WeaponEntry[]>;
type Session = { authenticated: boolean; steamId?: string; name?: string | null; avatar?: string | null; adminLevel?: number };
type FeaturedPreset = { key: string; name: string; ownerName: string | null; images: string[]; count: number };
type SkinSort = "name" | "quality" | "newest" | "fav";
type LoSort = "custom" | "name" | "color";

const CATEGORY_ORDER = ["Rifles", "Snipers", "SMGs", "Pistols", "Heavy", "Knives", "Gloves"];

// Signature guns shown in the T/CT preview.
const T_SLOTS = [7, 9, 1, 4];
const CT_SLOTS = [16, 9, 1, 61]; // M4 slot swaps to preferredM4
const M4A4 = 16;
const M4A1S = 60;

// Rarity hex → quality tier (higher = rarer) for the "quality" sort.
const RARITY_TIER: Record<string, number> = {
  "#b0c3d9": 0, "#5e98d9": 1, "#4b69ff": 2, "#8847ff": 3,
  "#d32ce6": 4, "#eb4b4b": 5, "#e4ae39": 6, "#ffd700": 6, "#ffae39": 6,
};

function wearLabel(wear: number): string {
  if (wear < 0.07) return "Factory New";
  if (wear < 0.15) return "Minimal Wear";
  if (wear < 0.38) return "Field-Tested";
  if (wear < 0.45) return "Well-Worn";
  return "Battle-Scarred";
}
const skinLabel = (name: string) => name.split(" | ")[1] ?? name;
function kindOfCategory(category: string): ItemKind {
  if (category === "Knives") return "knife";
  if (category === "Gloves") return "gloves";
  return "weapon";
}

export default function InventorySimulator() {
  const [store, setStore] = useState<InventoryStore>(defaultStore());
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session>({ authenticated: false });
  const [origin, setOrigin] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [category, setCategory] = useState("Rifles");
  const [side, setSide] = useState<Side>("t");
  const [weapon, setWeapon] = useState<WeaponEntry | null>(null); // set = skin chooser open
  const [skins, setSkins] = useState<Skin[]>([]);
  const [skinsLoading, setSkinsLoading] = useState(false);

  // Skin chooser filters
  const [skinSearch, setSkinSearch] = useState("");
  const [skinSort, setSkinSort] = useState<SkinSort>("quality");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [favOnly, setFavOnly] = useState(false);

  // Config for the slot being edited
  const [wear, setWear] = useState(0.02);
  const [seed, setSeed] = useState(1);
  const [statTrak, setStatTrak] = useState(false);
  const [nameTag, setNameTag] = useState("");
  const [stickers, setStickers] = useState<(PlacedSticker | null)[]>(defaultStickerSlots());
  const [showStickers, setShowStickers] = useState(false);
  const [stickerQuery, setStickerQuery] = useState("Katowice 2014");
  const [stickerResults, setStickerResults] = useState<StickerOption[]>([]);
  const [stickersLoading, setStickersLoading] = useState(false);

  // Loadout sidebar
  const [loSort, setLoSort] = useState<LoSort>("custom");
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Preview + share
  const [showPreview, setShowPreview] = useState(true);
  const [importKey, setImportKey] = useState("");
  const [featured, setFeatured] = useState<FeaturedPreset[]>([]);
  const [shareBusy, setShareBusy] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragSlot = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const builderKind: ItemKind = weapon ? kindOfCategory(weapon.category) : "weapon";
  const supportsStickers = builderKind === "weapon";
  const supportsStatTrak = builderKind !== "gloves";

  // Full-height page: hide the global footer so the workspace never scrolls.
  useEffect(() => {
    document.body.classList.add("inv-fullscreen");
    return () => document.body.classList.remove("inv-fullscreen");
  }, []);

  // ---------- Boot ----------
  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/weapons").then((r) => r.json()).then(setCatalog).catch(() => setCatalog(null));
    (async () => {
      let sess: Session = { authenticated: false };
      try {
        sess = await fetch("/api/auth/session").then((r) => r.json());
      } catch {
        /* ignore */
      }
      setSession(sess);
      if (sess.authenticated) {
        try {
          setStore(normaliseStore(await fetch("/api/inventory").then((r) => r.json())));
        } catch {
          setStore(loadStore());
        }
      } else {
        setStore(loadStore());
      }
      setHydrated(true);
    })();
    fetch("/api/loadout/featured").then((r) => r.json()).then((d) => setFeatured(d.presets ?? [])).catch(() => {});
  }, []);

  // ---------- Persist ----------
  const persist = useCallback((next: InventoryStore, authed: boolean) => {
    saveStore(next);
    if (!authed) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
    }, 600);
  }, []);
  useEffect(() => {
    if (hydrated) persist(store, session.authenticated);
  }, [store, hydrated, session.authenticated, persist]);

  const activeLoadout = useMemo(
    () => store.loadouts.find((l) => l.id === store.activeLoadoutId) ?? store.loadouts[0],
    [store]
  );
  const itemById = useCallback((id?: string) => (id ? store.items.find((i) => i.id === id) : undefined), [store.items]);
  const favorites = useMemo(() => new Set(store.favorites ?? []), [store.favorites]);

  // ---------- Skins fetch ----------
  useEffect(() => {
    if (!weapon) {
      setSkins([]);
      return;
    }
    let cancelled = false;
    setSkinsLoading(true);
    fetch(`/api/skins?weapon=${weapon.def}`)
      .then((r) => r.json())
      .then((d: Skin[]) => !cancelled && setSkins(Array.isArray(d) ? d : []))
      .catch(() => !cancelled && setSkins([]))
      .finally(() => !cancelled && setSkinsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [weapon]);

  // ---------- Sticker search ----------
  useEffect(() => {
    if (!showStickers) return;
    const h = window.setTimeout(() => {
      setStickersLoading(true);
      fetch(`/api/stickers?q=${encodeURIComponent(stickerQuery)}`)
        .then((r) => r.json())
        .then((d: StickerOption[]) => setStickerResults(Array.isArray(d) ? d : []))
        .catch(() => setStickerResults([]))
        .finally(() => setStickersLoading(false));
    }, 350);
    return () => window.clearTimeout(h);
  }, [stickerQuery, showStickers]);

  // ---------- Slot helpers ----------
  const slotItemFor = useCallback(
    (def: number, kind: ItemKind, s: Side, loadout = activeLoadout): InventoryItem | undefined => {
      if (!loadout) return undefined;
      if (kind === "knife") return itemById(s === "t" ? loadout.knifeT : loadout.knifeCT);
      if (kind === "gloves") return itemById(s === "t" ? loadout.glovesT : loadout.glovesCT);
      return itemById((s === "t" ? loadout.equippedT : loadout.equippedCT)[def]);
    },
    [activeLoadout, itemById]
  );

  // Open a weapon in the chooser, preloading config from its equipped slot item.
  const openWeapon = (w: WeaponEntry) => {
    setWeapon(w);
    setSkinSearch("");
    setCollectionFilter("");
    setShowStickers(false);
    const existing = slotItemFor(w.def, kindOfCategory(w.category), side);
    if (existing) {
      setWear(existing.wear);
      setSeed(existing.seed);
      setStatTrak(existing.statTrak);
      setNameTag(existing.nameTag);
      setStickers(existing.stickers?.length ? [...existing.stickers] : defaultStickerSlots());
    } else {
      setWear(0.02);
      setSeed(1);
      setStatTrak(false);
      setNameTag("");
      setStickers(defaultStickerSlots());
    }
  };

  // Create/update the slot's item and equip it into the active loadout.
  const equipSkin = (skin: Skin) => {
    if (!weapon) return;
    const kind = kindOfCategory(weapon.category);
    setStore((cur) => {
      const loadout = cur.loadouts.find((l) => l.id === cur.activeLoadoutId);
      if (!loadout) return cur;
      const existing = slotItemFor(weapon.def, kind, side, loadout);
      let items = cur.items;
      let itemId: string;
      let nextUid = cur.nextUid;
      const payload = {
        kind,
        weaponDef: weapon.def,
        weaponName: weapon.name,
        team: weapon.team,
        skinId: skin.id,
        skinName: skin.name,
        paint: skin.paint,
        image: skin.image,
        wear,
        seed,
        statTrak: supportsStatTrak ? statTrak : false,
        nameTag,
        stickers: supportsStickers ? stickers : defaultStickerSlots(),
      };
      if (existing) {
        itemId = existing.id;
        items = cur.items.map((i) => (i.id === existing.id ? { ...i, ...payload } : i));
      } else {
        itemId = newId();
        items = [{ id: itemId, uid: nextUid, createdAt: Date.now(), ...payload }, ...cur.items];
        nextUid += 1;
      }
      const loadouts = cur.loadouts.map((l) => {
        if (l.id !== loadout.id) return l;
        const nl: Loadout = { ...l, equippedCT: { ...l.equippedCT }, equippedT: { ...l.equippedT } };
        if (kind === "knife") {
          if (side === "t") nl.knifeT = itemId;
          else nl.knifeCT = itemId;
        } else if (kind === "gloves") {
          if (side === "t") nl.glovesT = itemId;
          else nl.glovesCT = itemId;
        } else if (side === "t") nl.equippedT[weapon.def] = itemId;
        else nl.equippedCT[weapon.def] = itemId;
        return nl;
      });
      return pruneItems({ ...cur, items, loadouts, nextUid });
    });
    showToast(`Equipped ${skinLabel(skin.name)} (${side.toUpperCase()})`);
    setWeapon(null); // unselect on skin choice
  };

  const clearSlot = (def: number, kind: ItemKind) => {
    setStore((cur) => {
      const loadouts = cur.loadouts.map((l) => {
        if (l.id !== cur.activeLoadoutId) return l;
        const nl: Loadout = { ...l, equippedCT: { ...l.equippedCT }, equippedT: { ...l.equippedT } };
        if (kind === "knife") {
          if (side === "t") nl.knifeT = undefined;
          else nl.knifeCT = undefined;
        } else if (kind === "gloves") {
          if (side === "t") nl.glovesT = undefined;
          else nl.glovesCT = undefined;
        } else if (side === "t") delete nl.equippedT[def];
        else delete nl.equippedCT[def];
        return nl;
      });
      return pruneItems({ ...cur, loadouts });
    });
  };

  // Drop items no loadout references, to avoid orphan bloat.
  const pruneItems = (s: InventoryStore): InventoryStore => {
    const used = new Set<string>();
    for (const l of s.loadouts) {
      Object.values(l.equippedCT).forEach((id) => used.add(id));
      Object.values(l.equippedT).forEach((id) => used.add(id));
      [l.knifeCT, l.knifeT, l.glovesCT, l.glovesT].forEach((id) => id && used.add(id));
    }
    return { ...s, items: s.items.filter((i) => used.has(i.id)) };
  };

  const toggleFavorite = (def: number, paint: number) => {
    const key = skinKey(def, paint);
    setStore((cur) => {
      const set = new Set(cur.favorites ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...cur, favorites: Array.from(set) };
    });
  };

  // ---------- Stickers ----------
  const addSticker = (o: StickerOption) => {
    const slot = stickers.findIndex((s) => s === null);
    if (slot === -1) {
      showToast("All sticker slots full");
      return;
    }
    const next = [...stickers];
    next[slot] = { def: o.def, name: o.name, image: o.image, slot, wear: 0, x: SLOT_ANCHORS[slot].x, y: SLOT_ANCHORS[slot].y, rotation: 0 };
    setStickers(next);
  };
  const removeSticker = (slot: number) => {
    const next = [...stickers];
    next[slot] = null;
    setStickers(next);
  };
  const onStickerDown = (slot: number) => (e: React.PointerEvent) => {
    dragSlot.current = slot;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onStageMove = (e: React.PointerEvent) => {
    if (dragSlot.current === null || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.min(95, Math.max(5, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(92, Math.max(8, ((e.clientY - rect.top) / rect.height) * 100));
    setStickers((cur) => {
      const s = dragSlot.current;
      if (s === null || !cur[s]) return cur;
      const n = [...cur];
      n[s] = { ...n[s]!, x, y };
      return n;
    });
  };
  const endDrag = () => {
    dragSlot.current = null;
  };

  // ---------- Loadouts ----------
  const addLoadout = () => {
    const l = emptyLoadout(`Loadout ${store.loadouts.length + 1}`);
    setStore((c) => ({ ...c, loadouts: [...c.loadouts, l], activeLoadoutId: l.id }));
  };
  const duplicateLoadout = (src: Loadout) => {
    const copy: Loadout = { ...src, id: newId(), name: `${src.name} copy`, equippedCT: { ...src.equippedCT }, equippedT: { ...src.equippedT } };
    setStore((c) => ({ ...c, loadouts: [...c.loadouts, copy], activeLoadoutId: copy.id }));
    showToast(`Duplicated "${copy.name}"`);
  };
  const renameLoadout = (l: Loadout) => {
    const name = window.prompt("Loadout name (in-game: /loadout <name>)", l.name)?.trim();
    if (!name) return;
    setStore((c) => ({ ...c, loadouts: c.loadouts.map((x) => (x.id === l.id ? { ...x, name } : x)) }));
  };
  const deleteLoadout = (l: Loadout) => {
    if (store.loadouts.length <= 1) {
      showToast("Keep at least one loadout");
      return;
    }
    setStore((c) => {
      const loadouts = c.loadouts.filter((x) => x.id !== l.id);
      return { ...c, loadouts, activeLoadoutId: c.activeLoadoutId === l.id ? loadouts[0].id : c.activeLoadoutId };
    });
  };
  const setLoadoutColor = (l: Loadout, color: string) => {
    setStore((c) => ({ ...c, loadouts: c.loadouts.map((x) => (x.id === l.id ? { ...x, color } : x)) }));
  };
  const setActiveLoadout = (id: string) => setStore((c) => ({ ...c, activeLoadoutId: id }));

  // Drag-reorder (custom order only)
  const onLoDrop = (targetIdx: number) => {
    const from = dragIndex.current;
    setDragOver(null);
    dragIndex.current = null;
    if (from === null || from === targetIdx) return;
    setStore((c) => {
      const arr = [...c.loadouts];
      const [moved] = arr.splice(from, 1);
      arr.splice(targetIdx, 0, moved);
      return { ...c, loadouts: arr };
    });
    setLoSort("custom");
  };

  const sortedLoadouts = useMemo(() => {
    const arr = [...store.loadouts];
    if (loSort === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
    else if (loSort === "color") arr.sort((a, b) => (a.color ?? "~").localeCompare(b.color ?? "~"));
    return arr; // "custom" = array order
  }, [store.loadouts, loSort]);

  // ---------- Share / borrow ----------
  const shareLoadout = async (l: Loadout, asFeatured = false) => {
    setShareBusy(true);
    try {
      const res = await fetch("/api/loadout/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store, loadoutId: l.id, featured: asFeatured }),
      });
      const j = await res.json();
      if (!res.ok || !j.key) {
        showToast(j.error ?? "Could not share");
        return;
      }
      await navigator.clipboard?.writeText(j.key).catch(() => {});
      showToast(asFeatured ? `Featured! Key ${j.key} copied` : `Key ${j.key} copied · /borrow ${j.key}`);
      if (asFeatured) fetch("/api/loadout/featured").then((r) => r.json()).then((d) => setFeatured(d.presets ?? []));
    } finally {
      setShareBusy(false);
    }
  };
  const importByKey = async (raw: string) => {
    const key = raw.trim().toLowerCase();
    if (!key) return;
    setShareBusy(true);
    try {
      const res = await fetch(`/api/loadout/borrow/${encodeURIComponent(key)}`);
      const j = await res.json();
      if (!res.ok || !j.snapshot) {
        showToast(j.error === "not found" ? "No loadout for that key" : j.error ?? "Import failed");
        return;
      }
      setStore((cur) => importSnapshot(cur, j.snapshot as LoadoutSnapshot));
      setImportKey("");
      showToast(`Imported "${j.name}"`);
    } finally {
      setShareBusy(false);
    }
  };

  const isAdmin = (session.adminLevel ?? 0) >= 2;

  // ---------- Derived: skin chooser list ----------
  const collections = useMemo(() => {
    const set = new Set<string>();
    for (const s of skins) if (s.collection) set.add(s.collection);
    return Array.from(set).sort();
  }, [skins]);

  const currentSkinId = weapon ? slotItemFor(weapon.def, builderKind, side)?.skinId : undefined;

  const shownSkins = useMemo(() => {
    let list = skins.filter((s) => skinLabel(s.name).toLowerCase().includes(skinSearch.toLowerCase()));
    if (collectionFilter) list = list.filter((s) => s.collection === collectionFilter);
    if (favOnly) list = list.filter((s) => favorites.has(skinKey(s.def, s.paint)));
    const rank = (s: Skin) => RARITY_TIER[s.rarity?.toLowerCase()] ?? -1;
    if (skinSort === "quality") list.sort((a, b) => rank(b) - rank(a) || skinLabel(a.name).localeCompare(skinLabel(b.name)));
    else if (skinSort === "newest") list.sort((a, b) => b.paint - a.paint);
    else if (skinSort === "fav") list.sort((a, b) => Number(favorites.has(skinKey(b.def, b.paint))) - Number(favorites.has(skinKey(a.def, a.paint))));
    else list.sort((a, b) => skinLabel(a.name).localeCompare(skinLabel(b.name)));
    // Current skin first
    if (currentSkinId) {
      const idx = list.findIndex((s) => s.id === currentSkinId);
      if (idx > 0) list.unshift(list.splice(idx, 1)[0]);
    }
    return list;
  }, [skins, skinSearch, collectionFilter, favOnly, favorites, skinSort, currentSkinId]);

  const weapons = catalog?.[category] ?? [];

  // ---------- Preview slots ----------
  const previewSlots = (s: Side) => {
    const defs = s === "t" ? T_SLOTS : CT_SLOTS.map((d) => (d === M4A4 ? activeLoadout?.preferredM4 ?? M4A4 : d));
    return defs.map((def) => ({ def, item: slotItemFor(def, "weapon", s) }));
  };

  // ---------- Render ----------
  return (
    <div className="inv3">
      {/* ===== LEFT: loadout sidebar ===== */}
      <aside className="inv3-side">
        <div className="inv3-side-head">
          <span className="loadout-label">Loadouts</span>
          <button className="btn small" onClick={addLoadout} title="New loadout">
            +
          </button>
        </div>
        <div className="inv3-losort">
          <select className="input" value={loSort} onChange={(e) => setLoSort(e.target.value as LoSort)}>
            <option value="custom">Custom order</option>
            <option value="name">By name</option>
            <option value="color">By color</option>
          </select>
        </div>

        <div className="inv3-lolist">
          {sortedLoadouts.map((l, idx) => {
            const active = l.id === store.activeLoadoutId;
            const canDrag = loSort === "custom";
            return (
              <div
                key={l.id}
                className={`inv3-lo ${active ? "active" : ""} ${dragOver === idx ? "dragover" : ""}`}
                draggable={canDrag}
                onDragStart={() => (dragIndex.current = idx)}
                onDragOver={(e) => {
                  if (canDrag) {
                    e.preventDefault();
                    setDragOver(idx);
                  }
                }}
                onDrop={() => onLoDrop(idx)}
                onDragEnd={() => {
                  setDragOver(null);
                  dragIndex.current = null;
                }}
              >
                <span className="inv3-lo-dot" style={{ background: l.color ?? "var(--muted)" }} />
                <button className="inv3-lo-pick" onClick={() => setActiveLoadout(l.id)}>
                  <span className="inv3-lo-name">{l.name}</span>
                  <span className="inv3-lo-count">{loadoutSize(l)} items</span>
                </button>
                {canDrag && <span className="inv3-lo-grip" title="Drag to reorder">⠿</span>}
              </div>
            );
          })}
        </div>

        {activeLoadout && (
          <div className="inv3-lo-actions">
            <div className="inv3-colors">
              {LOADOUT_COLORS.map((c) => (
                <button
                  key={c.hex}
                  className={`inv3-color ${activeLoadout.color === c.hex ? "active" : ""}`}
                  style={{ background: c.hex }}
                  title={c.name}
                  onClick={() => setLoadoutColor(activeLoadout, c.hex)}
                />
              ))}
            </div>
            <div className="inv3-lo-btns">
              <button className="btn small secondary" onClick={() => renameLoadout(activeLoadout)}>✎</button>
              <button className="btn small secondary" onClick={() => duplicateLoadout(activeLoadout)}>⧉</button>
              <button className="btn small secondary" onClick={() => shareLoadout(activeLoadout)} disabled={shareBusy}>↗</button>
              {isAdmin && <button className="btn small secondary" title="Feature" onClick={() => shareLoadout(activeLoadout, true)}>★</button>}
              {store.loadouts.length > 1 && <button className="btn small danger" onClick={() => deleteLoadout(activeLoadout)}>✕</button>}
            </div>
          </div>
        )}

        <div className="inv3-borrow">
          <form
            className="borrow-row"
            onSubmit={(e) => {
              e.preventDefault();
              importByKey(importKey);
            }}
          >
            <input className="input" placeholder="borrow key…" value={importKey} maxLength={16} spellCheck={false} onChange={(e) => setImportKey(e.target.value)} />
            <button className="btn small" type="submit" disabled={shareBusy || !importKey.trim()}>Get</button>
          </form>
          {featured.length > 0 && (
            <div className="inv3-featured">
              <span className="loadout-label">★ Featured</span>
              {featured.slice(0, 4).map((f) => (
                <button key={f.key} className="inv3-feat" onClick={() => importByKey(f.key)} disabled={shareBusy}>
                  <span className="inv3-feat-name">{f.name}</span>
                  <span className="muted">{f.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ===== CENTER: weapons grid / skin chooser ===== */}
      <section className="inv3-main">
        <div className="inv3-topbar">
          <div className="inv3-sides">
            {(["t", "ct"] as Side[]).map((s) => (
              <button key={s} className={`inv3-sidebtn side-${s} ${side === s ? "active" : ""}`} onClick={() => setSide(s)}>
                {s.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="inv3-cats">
            {(catalog ? CATEGORY_ORDER.filter((c) => catalog[c]?.length) : CATEGORY_ORDER).map((c) => (
              <button
                key={c}
                className={`chip ${category === c ? "active" : ""}`}
                onClick={() => {
                  setCategory(c);
                  setWeapon(null);
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <button className={`btn small secondary inv3-prevtoggle ${showPreview ? "on" : ""}`} onClick={() => setShowPreview((v) => !v)} title="Toggle T/CT preview">
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
        </div>

        {!weapon ? (
          // ---- Weapons grid ----
          !catalog ? (
            <p className="empty-hint">Loading…</p>
          ) : (
            <div className="inv3-weapons">
              {weapons.map((w) => {
                const item = slotItemFor(w.def, kindOfCategory(w.category), side);
                return (
                  <button key={w.def} className={`inv3-weapon ${item ? "has-skin" : ""}`} onClick={() => openWeapon(w)}>
                    <div className="inv3-weapon-img">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item?.image ?? w.image} alt={w.name} loading="lazy" />
                    </div>
                    <div className="inv3-weapon-name">{w.name}</div>
                    <div className="inv3-weapon-skin">{item ? skinLabel(item.skinName) : "Default"}</div>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          // ---- Skin chooser ----
          <div className="inv3-chooser">
            <div className="inv3-chooser-head">
              <button className="btn small secondary" onClick={() => setWeapon(null)}>← Back</button>
              <strong>{weapon.name}</strong>
              <span className="muted">— {side.toUpperCase()} skin</span>
              {slotItemFor(weapon.def, builderKind, side) && (
                <button className="btn small danger" onClick={() => { clearSlot(weapon.def, builderKind); setWeapon(null); }}>
                  Remove skin
                </button>
              )}
            </div>

            <div className="inv3-filters">
              <input className="input" placeholder="Search skins…" value={skinSearch} onChange={(e) => setSkinSearch(e.target.value)} />
              <select className="input" value={skinSort} onChange={(e) => setSkinSort(e.target.value as SkinSort)}>
                <option value="quality">Quality</option>
                <option value="name">Name A–Z</option>
                <option value="newest">Newest</option>
                <option value="fav">Favorites first</option>
              </select>
              <select className="input" value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)}>
                <option value="">All collections</option>
                {collections.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button className={`chip ${favOnly ? "active" : ""}`} onClick={() => setFavOnly((v) => !v)}>♥ Favorites</button>
            </div>

            {/* config strip */}
            <div className="inv3-config">
              <label>
                Wear <strong>{wear.toFixed(3)}</strong> <em>{wearLabel(wear)}</em>
                <input type="range" min={0} max={1} step={0.001} value={wear} onChange={(e) => setWear(Number(e.target.value))} />
              </label>
              <label>
                Seed
                <input className="input" type="number" min={0} max={1000} value={seed} onChange={(e) => setSeed(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))} />
              </label>
              {supportsStatTrak && (
                <label className="inv3-cfg-toggle">
                  <input type="checkbox" checked={statTrak} onChange={(e) => setStatTrak(e.target.checked)} /> StatTrak™
                </label>
              )}
              {supportsStickers && (
                <button className="btn small secondary" onClick={() => setShowStickers((v) => !v)}>
                  {showStickers ? "Hide stickers" : "Stickers"}
                </button>
              )}
            </div>

            {showStickers && supportsStickers && (
              <div className="inv3-stickers">
                <div ref={stageRef} className="sticker-stage" onPointerMove={onStageMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
                  {(slotItemFor(weapon.def, builderKind, side)?.image ?? shownSkins[0]?.image) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="weapon-img" src={slotItemFor(weapon.def, builderKind, side)?.image ?? shownSkins[0]?.image} alt="" />
                  )}
                  {stickers.map((st, slot) =>
                    st ? (
                      <div key={slot} className="placed-sticker" style={{ left: `${st.x}%`, top: `${st.y}%` }} onPointerDown={onStickerDown(slot)} title={st.name}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={st.image} alt="" />
                        <button className="remove" onClick={() => removeSticker(slot)}>×</button>
                      </div>
                    ) : null
                  )}
                </div>
                <div className="sticker-picker">
                  <input className="input" placeholder="Search stickers…" value={stickerQuery} onChange={(e) => setStickerQuery(e.target.value)} />
                  {stickersLoading ? (
                    <p className="empty-hint">Searching…</p>
                  ) : (
                    <div className="results">
                      {stickerResults.map((s) => (
                        <div key={s.id} className="sticker-cell" title={s.name} onClick={() => addSticker(s)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s.image} alt="" loading="lazy" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="muted" style={{ fontSize: "0.78rem" }}>Stickers apply when you pick a skin below.</p>
              </div>
            )}

            {skinsLoading ? (
              <p className="empty-hint">Loading skins…</p>
            ) : (
              <div className="inv3-skins">
                {shownSkins.map((s) => {
                  const fav = favorites.has(skinKey(s.def, s.paint));
                  return (
                    <div key={s.id} className={`inv3-skin ${s.id === currentSkinId ? "current" : ""}`} style={{ "--rarity": s.rarity } as React.CSSProperties}>
                      <button className="inv3-skin-pick" onClick={() => equipSkin(s)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.image} alt={s.name} loading="lazy" />
                        <span className="inv3-skin-name" style={{ color: s.rarity }}>{skinLabel(s.name)}</span>
                      </button>
                      <button className={`inv3-heart ${fav ? "on" : ""}`} title="Favorite" onClick={() => toggleFavorite(s.def, s.paint)}>
                        {fav ? "♥" : "♡"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ===== RIGHT: T/CT preview (toggleable) ===== */}
      {showPreview && (
        <aside className="inv3-preview">
          <div className="loadout-label" style={{ marginBottom: 8 }}>{activeLoadout?.name ?? "Loadout"}</div>
          {(["t", "ct"] as Side[]).map((s) => (
            <div key={s} className="inv3-prev-side">
              <div className="inv3-prev-head">
                <span className={`side-tag ${s === "t" ? "side-t" : "side-ct"}`}>{s.toUpperCase()}</span>
              </div>
              <div className="inv3-prev-guns">
                {previewSlots(s).map(({ def, item }) => (
                  <div key={def} className={`inv3-prev-gun ${item ? "has" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item?.image ?? catalog && Object.values(catalog).flat().find((w) => w.def === def)?.image ?? ""} alt="" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <a className="btn small secondary" href={session.authenticated && session.steamId ? "/profile" : "#"} style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
            View on profile →
          </a>
        </aside>
      )}

      {/* Sign-in hint (slim) */}
      {hydrated && !session.authenticated && (
        <div className="inv3-guest">
          Guest — saved on this device. <a href="/api/auth/steam/login">Sign in</a> to sync in-game.
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
