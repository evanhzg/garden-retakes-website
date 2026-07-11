"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InventoryItem,
  InventoryStore,
  ItemKind,
  Loadout,
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
type Skin = { id: number; def: number; paint: number; name: string; image: string; rarity: string };
type StickerOption = { id: number; def: number; name: string; image: string; rarity: string };
type Catalog = Record<string, WeaponEntry[]>;
type Session = {
  authenticated: boolean;
  steamId?: string;
  name?: string | null;
  avatar?: string | null;
  adminLevel?: number;
};
type FeaturedPreset = { key: string; name: string; ownerName: string | null; images: string[]; count: number };
type RightTab = "loadout" | "items";
type EquipSide = Side | "both";

const CATEGORY_ORDER = ["Rifles", "Snipers", "SMGs", "Pistols", "Heavy", "Knives", "Gloves"];

function wearLabel(wear: number): string {
  if (wear < 0.07) return "Factory New";
  if (wear < 0.15) return "Minimal Wear";
  if (wear < 0.38) return "Field-Tested";
  if (wear < 0.45) return "Well-Worn";
  return "Battle-Scarred";
}

function skinLabel(name: string): string {
  return name.split(" | ")[1] ?? name;
}

function kindOfCategory(category: string): ItemKind {
  if (category === "Knives") return "knife";
  if (category === "Gloves") return "gloves";
  return "weapon";
}

/** Pure helper: equip an item into a loadout on the given side(s). */
function equipInto(loadout: Loadout, item: InventoryItem, side: EquipSide): Loadout {
  const next: Loadout = {
    ...loadout,
    equippedCT: { ...loadout.equippedCT },
    equippedT: { ...loadout.equippedT },
  };
  const sides: Side[] = side === "both" ? ["t", "ct"] : [side];

  for (const s of sides) {
    if (item.kind === "knife") {
      if (s === "t") next.knifeT = item.id;
      else next.knifeCT = item.id;
    } else if (item.kind === "gloves") {
      if (s === "t") next.glovesT = item.id;
      else next.glovesCT = item.id;
    } else if (s === "t") {
      next.equippedT[item.weaponDef] = item.id;
    } else {
      next.equippedCT[item.weaponDef] = item.id;
    }
  }
  return next;
}

/** Which sides of a loadout an item is currently equipped on. */
function equippedSides(loadout: Loadout | undefined, item: InventoryItem): Side[] {
  if (!loadout) return [];
  const sides: Side[] = [];
  if (item.kind === "knife") {
    if (loadout.knifeT === item.id) sides.push("t");
    if (loadout.knifeCT === item.id) sides.push("ct");
  } else if (item.kind === "gloves") {
    if (loadout.glovesT === item.id) sides.push("t");
    if (loadout.glovesCT === item.id) sides.push("ct");
  } else {
    if (loadout.equippedT[item.weaponDef] === item.id) sides.push("t");
    if (loadout.equippedCT[item.weaponDef] === item.id) sides.push("ct");
  }
  return sides;
}

export default function InventorySimulator() {
  const [store, setStore] = useState<InventoryStore>(defaultStore());
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session>({ authenticated: false });
  const [origin, setOrigin] = useState("");
  const [rightTab, setRightTab] = useState<RightTab>("loadout");
  const [toast, setToast] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [category, setCategory] = useState<string>("Rifles");
  const [weapon, setWeapon] = useState<WeaponEntry | null>(null);
  const [skins, setSkins] = useState<Skin[]>([]);
  const [skinsLoading, setSkinsLoading] = useState(false);
  const [skinSearch, setSkinSearch] = useState("");
  const [selectedSkin, setSelectedSkin] = useState<Skin | null>(null);

  const [stickers, setStickers] = useState<(PlacedSticker | null)[]>(defaultStickerSlots());
  const [wear, setWear] = useState(0.06);
  const [seed, setSeed] = useState(1);
  const [statTrak, setStatTrak] = useState(false);
  const [nameTag, setNameTag] = useState("");
  const [equipSide, setEquipSide] = useState<EquipSide>("both");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [stickerQuery, setStickerQuery] = useState("Katowice 2014");
  const [stickerResults, setStickerResults] = useState<StickerOption[]>([]);
  const [stickersLoading, setStickersLoading] = useState(false);

  const [importKey, setImportKey] = useState("");
  const [featured, setFeatured] = useState<FeaturedPreset[]>([]);
  const [shareBusy, setShareBusy] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragSlot = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const builderKind: ItemKind = weapon ? kindOfCategory(weapon.category) : "weapon";
  const supportsStickers = builderKind === "weapon";
  const supportsStatTrak = builderKind !== "gloves";

  // ---------- Boot: session + catalog + inventory ----------

  useEffect(() => {
    setOrigin(window.location.origin);

    fetch("/api/weapons")
      .then((r) => r.json())
      .then((data: Catalog) => setCatalog(data))
      .catch(() => setCatalog(null));

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
          const remote = await fetch("/api/inventory").then((r) => r.json());
          setStore(normaliseStore(remote));
        } catch {
          setStore(loadStore());
        }
      } else {
        setStore(loadStore());
      }
      setHydrated(true);
    })();
  }, []);

  // ---------- Persistence (debounced) ----------

  const persist = useCallback((next: InventoryStore, authed: boolean) => {
    saveStore(next);
    if (!authed) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      }).catch(() => {});
    }, 600);
  }, []);

  useEffect(() => {
    if (hydrated) persist(store, session.authenticated);
  }, [store, hydrated, session.authenticated, persist]);

  const activeLoadout = useMemo(
    () => store.loadouts.find((l) => l.id === store.activeLoadoutId) ?? store.loadouts[0],
    [store]
  );

  const itemById = useCallback(
    (id: string | undefined) => (id ? store.items.find((i) => i.id === id) : undefined),
    [store.items]
  );

  // ---------- Skins ----------

  useEffect(() => {
    if (!weapon) {
      setSkins([]);
      return;
    }
    let cancelled = false;
    setSkinsLoading(true);
    fetch(`/api/skins?weapon=${weapon.def}`)
      .then((r) => r.json())
      .then((data: Skin[]) => !cancelled && setSkins(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setSkins([]))
      .finally(() => !cancelled && setSkinsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [weapon]);

  // ---------- Sticker search (debounced) ----------

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setStickersLoading(true);
      fetch(`/api/stickers?q=${encodeURIComponent(stickerQuery)}`)
        .then((r) => r.json())
        .then((data: StickerOption[]) => setStickerResults(Array.isArray(data) ? data : []))
        .catch(() => setStickerResults([]))
        .finally(() => setStickersLoading(false));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [stickerQuery]);

  // ---------- Builder ----------

  const resetConfig = () => {
    setStickers(defaultStickerSlots());
    setWear(0.06);
    setSeed(1);
    setStatTrak(false);
    setNameTag("");
    setEditingItemId(null);
  };

  const pickWeapon = (w: WeaponEntry) => {
    setWeapon(w);
    setSelectedSkin(null);
    setSkinSearch("");
    resetConfig();
    // Preselect the natural side: side-specific weapons default to their side.
    setEquipSide(w.team === "both" ? "both" : w.team === "t" ? "t" : "ct");
  };

  const addSticker = (option: StickerOption) => {
    const slot = stickers.findIndex((s) => s === null);
    if (slot === -1) {
      showToast("All sticker slots are full — remove one first");
      return;
    }
    const next = [...stickers];
    next[slot] = {
      def: option.def,
      name: option.name,
      image: option.image,
      slot,
      wear: 0,
      x: SLOT_ANCHORS[slot].x,
      y: SLOT_ANCHORS[slot].y,
      rotation: 0,
    };
    setStickers(next);
  };

  const removeSticker = (slot: number) => {
    const next = [...stickers];
    next[slot] = null;
    setStickers(next);
  };

  const onStickerPointerDown = (slot: number) => (event: React.PointerEvent) => {
    dragSlot.current = slot;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const onStagePointerMove = (event: React.PointerEvent) => {
    if (dragSlot.current === null || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.min(95, Math.max(5, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100));
    setStickers((current) => {
      const slot = dragSlot.current;
      if (slot === null || !current[slot]) return current;
      const next = [...current];
      next[slot] = { ...next[slot]!, x, y };
      return next;
    });
  };

  const endDrag = () => {
    dragSlot.current = null;
  };

  const saveToInventory = () => {
    if (!weapon || !selectedSkin) return;

    if (editingItemId) {
      setStore((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === editingItemId
            ? {
                ...item,
                skinId: selectedSkin.id,
                skinName: selectedSkin.name,
                paint: selectedSkin.paint,
                image: selectedSkin.image,
                stickers: supportsStickers ? stickers : defaultStickerSlots(),
                wear,
                seed,
                statTrak: supportsStatTrak ? statTrak : false,
                nameTag,
              }
            : item
        ),
      }));
      showToast("Item updated");
      return;
    }

    setStore((current) => {
      const item: InventoryItem = {
        id: newId(),
        uid: current.nextUid,
        kind: builderKind,
        weaponDef: weapon.def,
        weaponName: weapon.name,
        team: weapon.team,
        skinId: selectedSkin.id,
        skinName: selectedSkin.name,
        paint: selectedSkin.paint,
        image: selectedSkin.image,
        wear,
        seed,
        statTrak: supportsStatTrak ? statTrak : false,
        nameTag,
        stickers: supportsStickers ? stickers : defaultStickerSlots(),
        createdAt: Date.now(),
      };
      setEditingItemId(item.id);
      return {
        ...current,
        nextUid: current.nextUid + 1,
        items: [item, ...current.items],
        loadouts: current.loadouts.map((l) =>
          l.id === current.activeLoadoutId ? equipInto(l, item, equipSide) : l
        ),
      };
    });
    showToast(
      `Saved & equipped (${equipSide === "both" ? "T + CT" : equipSide.toUpperCase()}) on ${activeLoadout?.name ?? "loadout"}`
    );
  };

  const editItem = (item: InventoryItem) => {
    if (!catalog) return;
    let found: WeaponEntry | undefined;
    let foundCategory = category;
    for (const [cat, list] of Object.entries(catalog)) {
      const hit = list.find((w) => w.def === item.weaponDef);
      if (hit) {
        found = hit;
        foundCategory = cat;
        break;
      }
    }
    setCategory(foundCategory);
    setWeapon(
      found ?? {
        id: 0,
        def: item.weaponDef,
        name: item.weaponName,
        model: "",
        image: item.image,
        category: foundCategory,
        team: item.team,
      }
    );
    setSelectedSkin({
      id: item.skinId,
      def: item.weaponDef,
      paint: item.paint,
      name: item.skinName,
      image: item.image,
      rarity: "#a855f7",
    });
    setStickers(item.stickers.length ? [...item.stickers] : defaultStickerSlots());
    setWear(item.wear);
    setSeed(item.seed);
    setStatTrak(item.statTrak);
    setNameTag(item.nameTag);
    setEditingItemId(item.id);
    setRightTab("items");
  };

  // ---------- Inventory ----------

  const equipItem = (item: InventoryItem, side: EquipSide) => {
    setStore((current) => ({
      ...current,
      loadouts: current.loadouts.map((l) =>
        l.id === current.activeLoadoutId ? equipInto(l, item, side) : l
      ),
    }));
    showToast(
      `Equipped (${side === "both" ? "T + CT" : side.toUpperCase()}) on ${activeLoadout?.name ?? "loadout"}`
    );
  };

  const unequipSlot = (side: Side, item: InventoryItem) => {
    setStore((current) => ({
      ...current,
      loadouts: current.loadouts.map((l) => {
        if (l.id !== current.activeLoadoutId) return l;
        const next: Loadout = { ...l, equippedCT: { ...l.equippedCT }, equippedT: { ...l.equippedT } };
        if (item.kind === "knife") {
          if (side === "t" && next.knifeT === item.id) next.knifeT = undefined;
          if (side === "ct" && next.knifeCT === item.id) next.knifeCT = undefined;
        } else if (item.kind === "gloves") {
          if (side === "t" && next.glovesT === item.id) next.glovesT = undefined;
          if (side === "ct" && next.glovesCT === item.id) next.glovesCT = undefined;
        } else if (side === "t") {
          if (next.equippedT[item.weaponDef] === item.id) delete next.equippedT[item.weaponDef];
        } else if (next.equippedCT[item.weaponDef] === item.id) {
          delete next.equippedCT[item.weaponDef];
        }
        return next;
      }),
    }));
  };

  const deleteItem = (item: InventoryItem) => {
    setStore((current) => ({
      ...current,
      items: current.items.filter((i) => i.id !== item.id),
      loadouts: current.loadouts.map((l) => {
        const next: Loadout = { ...l, equippedCT: { ...l.equippedCT }, equippedT: { ...l.equippedT } };
        for (const map of [next.equippedCT, next.equippedT]) {
          for (const [def, itemId] of Object.entries(map)) {
            if (itemId === item.id) delete map[def];
          }
        }
        if (next.knifeCT === item.id) next.knifeCT = undefined;
        if (next.knifeT === item.id) next.knifeT = undefined;
        if (next.glovesCT === item.id) next.glovesCT = undefined;
        if (next.glovesT === item.id) next.glovesT = undefined;
        return next;
      }),
    }));
    if (editingItemId === item.id) setEditingItemId(null);
  };

  // ---------- Loadouts ----------

  const addLoadout = () => {
    const loadout = emptyLoadout(`Loadout ${store.loadouts.length + 1}`);
    setStore((current) => ({
      ...current,
      loadouts: [...current.loadouts, loadout],
      activeLoadoutId: loadout.id,
    }));
  };

  const duplicateLoadout = (source: Loadout) => {
    const copy: Loadout = {
      ...source,
      id: newId(),
      name: `${source.name} copy`,
      equippedCT: { ...source.equippedCT },
      equippedT: { ...source.equippedT },
    };
    setStore((current) => ({
      ...current,
      loadouts: [...current.loadouts, copy],
      activeLoadoutId: copy.id,
    }));
    showToast(`Duplicated as "${copy.name}"`);
  };

  const renameLoadout = (loadout: Loadout) => {
    const name = window.prompt("Loadout name (used in-game: /loadout <name>)", loadout.name)?.trim();
    if (!name) return;
    setStore((current) => ({
      ...current,
      loadouts: current.loadouts.map((l) => (l.id === loadout.id ? { ...l, name } : l)),
    }));
  };

  const deleteLoadout = (loadout: Loadout) => {
    if (store.loadouts.length <= 1) {
      showToast("You need at least one loadout");
      return;
    }
    setStore((current) => {
      const loadouts = current.loadouts.filter((l) => l.id !== loadout.id);
      return {
        ...current,
        loadouts,
        activeLoadoutId:
          current.activeLoadoutId === loadout.id ? loadouts[0].id : current.activeLoadoutId,
      };
    });
  };

  const setActiveLoadout = (id: string) => setStore((current) => ({ ...current, activeLoadoutId: id }));

  // ---------- Share / borrow ----------

  const loadFeatured = useCallback(() => {
    fetch("/api/loadout/featured")
      .then((r) => r.json())
      .then((d: { presets?: FeaturedPreset[] }) => setFeatured(Array.isArray(d.presets) ? d.presets : []))
      .catch(() => setFeatured([]));
  }, []);

  useEffect(() => {
    loadFeatured();
  }, [loadFeatured]);

  const shareLoadout = async (loadout: Loadout, asFeatured = false) => {
    setShareBusy(true);
    try {
      const res = await fetch("/api/loadout/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store, loadoutId: loadout.id, featured: asFeatured }),
      });
      const json = await res.json();
      if (!res.ok || !json.key) {
        showToast(json.error ?? "Could not share");
        return;
      }
      await navigator.clipboard?.writeText(json.key).catch(() => {});
      showToast(
        asFeatured
          ? `Featured! Key ${json.key} copied`
          : `Share key ${json.key} copied — friends run /borrow ${json.key}`
      );
      if (asFeatured) loadFeatured();
    } finally {
      setShareBusy(false);
    }
  };

  const importByKey = async (rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    if (!key) return;
    setShareBusy(true);
    try {
      const res = await fetch(`/api/loadout/borrow/${encodeURIComponent(key)}`);
      const json = await res.json();
      if (!res.ok || !json.snapshot) {
        showToast(json.error === "not found" ? "No loadout for that key" : json.error ?? "Import failed");
        return;
      }
      const snapshot = json.snapshot as LoadoutSnapshot;
      setStore((current) => importSnapshot(current, snapshot));
      setImportKey("");
      setRightTab("loadout");
      showToast(`Imported "${json.name}" — now active`);
    } finally {
      setShareBusy(false);
    }
  };

  const isAdmin = (session.adminLevel ?? 0) >= 2;

  const filteredSkins = skins.filter((s) =>
    skinLabel(s.name).toLowerCase().includes(skinSearch.toLowerCase())
  );

  // ---------- Loadout view helpers ----------

  const sideRows = (side: Side) => {
    if (!activeLoadout) return [];
    const rows: { slot: string; item: InventoryItem }[] = [];
    const knife = itemById(side === "t" ? activeLoadout.knifeT : activeLoadout.knifeCT);
    if (knife) rows.push({ slot: "Knife", item: knife });
    const gloves = itemById(side === "t" ? activeLoadout.glovesT : activeLoadout.glovesCT);
    if (gloves) rows.push({ slot: "Gloves", item: gloves });
    const map = side === "t" ? activeLoadout.equippedT : activeLoadout.equippedCT;
    for (const itemId of Object.values(map)) {
      const item = itemById(itemId);
      if (item) rows.push({ slot: item.weaponName, item });
    }
    return rows;
  };

  // ---------- Render ----------

  const categories = catalog ? CATEGORY_ORDER.filter((c) => catalog[c]?.length) : CATEGORY_ORDER;

  return (
    <>
      {/* Auth / sync banner */}
      <div className={`sync-banner ${session.authenticated ? "on" : ""}`}>
        {session.authenticated ? (
          <>
            {session.avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="sync-avatar" src={session.avatar} alt="" />
            )}
            <div className="sync-text">
              <strong>{session.name ?? "Signed in"}</strong>
              <span className="muted">
                Syncs in-game · <code>!ws</code> refreshes · <code>!loadout &lt;name&gt;</code> swaps loadouts
              </span>
            </div>
            {origin && session.steamId && (
              <button
                className="btn small secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(`${origin}/api/equipped/v4/${session.steamId}.json`);
                  showToast("Equipped-items URL copied");
                }}
              >
                Copy plugin URL
              </button>
            )}
            <a className="btn small danger" href="/api/auth/logout">
              Sign out
            </a>
          </>
        ) : (
          <>
            <div className="sync-text">
              <strong>Playing as a guest</strong>
              <span className="muted">Saved on this device only. Sign in to sync skins in-game.</span>
            </div>
            <a className="btn small" href="/api/auth/steam/login">
              Sign in with Steam
            </a>
          </>
        )}
      </div>

      <div className="inv-layout">
        {/* ---------- LEFT: weapons + CENTER: editor ---------- */}
        <div className="inv-builder">
          {/* WEAPONS */}
          <aside className="inv-weapons">
            <div className="pane-head">Weapons</div>
            <div className="chip-row inv-cats">
              {categories.map((c) => (
                <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
            {!catalog ? (
              <p className="empty-hint">Loading…</p>
            ) : (
              <div className="weapon-list">
                {(catalog[category] ?? []).map((w) => (
                  <button
                    key={w.def}
                    className={`weapon-row ${weapon?.def === w.def ? "selected" : ""}`}
                    onClick={() => pickWeapon(w)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.image} alt="" loading="lazy" />
                    <span className="wr-name">{w.name}</span>
                    <span className={`wr-team team-${w.team}`}>{w.team === "both" ? "T/CT" : w.team.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* EDITOR */}
          <section className="inv-editor">
            {!weapon && (
              <div className="editor-empty">
                <div className="editor-empty-icon">🎯</div>
                <p className="muted">Pick a weapon on the left to browse its skins.</p>
              </div>
            )}

            {weapon && !selectedSkin && (
              <>
                <div className="editor-head">
                  <div className="editor-title">
                    <strong>{weapon.name}</strong> <span className="muted">— choose a skin</span>
                  </div>
                  <input
                    className="input editor-search"
                    placeholder="Search skins…"
                    value={skinSearch}
                    onChange={(e) => setSkinSearch(e.target.value)}
                  />
                </div>
                {skinsLoading ? (
                  <p className="empty-hint">Loading skins…</p>
                ) : (
                  <div className="card-grid skins-grid">
                    {filteredSkins.map((s) => (
                      <div
                        key={s.id}
                        className="item-card skin-card"
                        style={{ "--rarity": s.rarity } as React.CSSProperties}
                        onClick={() => setSelectedSkin(s)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.image} alt={s.name} loading="lazy" />
                        <div className="name" style={{ color: s.rarity }}>
                          {skinLabel(s.name)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {weapon && selectedSkin && (
              <>
                <div className="editor-head">
                  <button className="btn small secondary" onClick={() => setSelectedSkin(null)}>
                    ← Skins
                  </button>
                  <div className="editor-title">
                    <strong>{weapon.name}</strong> · {skinLabel(selectedSkin.name)}
                  </div>
                  {editingItemId && <span className="mini-badge">editing</span>}
                </div>

                <div className="builder-columns">
                  <div>
                    <div
                      ref={stageRef}
                      className="sticker-stage"
                      onPointerMove={onStagePointerMove}
                      onPointerUp={endDrag}
                      onPointerLeave={endDrag}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="weapon-img" src={selectedSkin.image} alt={selectedSkin.name} />
                      {supportsStickers &&
                        SLOT_ANCHORS.map((anchor, slot) =>
                          stickers[slot] ? null : (
                            <div key={slot} className="slot-hint" style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}>
                              {slot + 1}
                            </div>
                          )
                        )}
                      {supportsStickers &&
                        stickers.map((sticker, slot) =>
                          sticker ? (
                            <div
                              key={slot}
                              className="placed-sticker"
                              style={{ left: `${sticker.x}%`, top: `${sticker.y}%` }}
                              onPointerDown={onStickerPointerDown(slot)}
                              title={sticker.name}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={sticker.image} alt={sticker.name} />
                              <button className="remove" onClick={() => removeSticker(slot)}>
                                ×
                              </button>
                            </div>
                          ) : null
                        )}
                    </div>

                    {/* Item config */}
                    <div className="config-grid">
                      <label className="config-field">
                        <span>
                          Wear · <strong>{wear.toFixed(3)}</strong> <em>{wearLabel(wear)}</em>
                        </span>
                        <input type="range" min={0} max={1} step={0.001} value={wear} onChange={(e) => setWear(Number(e.target.value))} />
                      </label>
                      <label className="config-field">
                        <span>Pattern seed</span>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={1000}
                          value={seed}
                          onChange={(e) => setSeed(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
                        />
                      </label>
                      {builderKind !== "gloves" && (
                        <label className="config-field">
                          <span>Name tag</span>
                          <input className="input" placeholder="(none)" maxLength={20} value={nameTag} onChange={(e) => setNameTag(e.target.value)} />
                        </label>
                      )}
                      {supportsStatTrak && (
                        <label className="config-field toggle">
                          <input type="checkbox" checked={statTrak} onChange={(e) => setStatTrak(e.target.checked)} />
                          <span>StatTrak™</span>
                        </label>
                      )}
                    </div>

                    {/* Side selection */}
                    <div className="side-select">
                      <span className="loadout-label">EQUIP ON</span>
                      {(["t", "ct", "both"] as EquipSide[]).map((s) => (
                        <button
                          key={s}
                          className={`chip side-chip-${s} ${equipSide === s ? "active" : ""}`}
                          onClick={() => setEquipSide(s)}
                        >
                          {s === "both" ? "Both sides" : s === "t" ? "T side" : "CT side"}
                        </button>
                      ))}
                    </div>

                    <div className="connect-row" style={{ marginTop: 14 }}>
                      <button className="btn" onClick={saveToInventory}>
                        {editingItemId ? "Update item" : "Save & equip"}
                      </button>
                      <button className="btn secondary" onClick={() => setSelectedSkin(null)}>
                        Change skin
                      </button>
                      {supportsStickers && (
                        <span className="muted" style={{ fontSize: "0.85rem" }}>
                          Drag stickers to preview placement · hover to remove
                        </span>
                      )}
                    </div>
                  </div>

                  {supportsStickers ? (
                    <div className="sticker-picker">
                      <strong>Stickers</strong>
                      <input className="input" placeholder="Search stickers…" value={stickerQuery} onChange={(e) => setStickerQuery(e.target.value)} />
                      {stickersLoading ? (
                        <p className="empty-hint">Searching…</p>
                      ) : (
                        <div className="results">
                          {stickerResults.map((sticker) => (
                            <div key={sticker.id} className="sticker-cell" title={sticker.name} onClick={() => addSticker(sticker)}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={sticker.image} alt={sticker.name} loading="lazy" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="sticker-picker">
                      <strong>{builderKind === "knife" ? "Knife" : "Gloves"}</strong>
                      <p className="muted" style={{ fontSize: "0.85rem" }}>
                        {builderKind === "knife"
                          ? "Knives don't take stickers. Pick your finish, wear and seed, then choose which side carries it."
                          : "Gloves have no stickers, StatTrak or name tags — just the finish, wear and seed."}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        {/* ---------- RIGHT: loadouts + saved items ---------- */}
        <aside className="inv-loadouts">
          <div className="right-subtabs">
            <button className={rightTab === "loadout" ? "active" : ""} onClick={() => setRightTab("loadout")}>
              Loadouts
            </button>
            <button className={rightTab === "items" ? "active" : ""} onClick={() => setRightTab("items")}>
              Saved ({store.items.length})
            </button>
          </div>

          {rightTab === "loadout" && (
            <>
              <div className="lo-head">
                <span className="loadout-label">YOUR LOADOUTS</span>
                <button className="btn small" onClick={addLoadout}>
                  + New
                </button>
              </div>
              <div className="lo-list">
                {store.loadouts.map((l) => (
                  <div key={l.id} className={`lo-row ${l.id === store.activeLoadoutId ? "active" : ""}`}>
                    <button className="lo-pick" onClick={() => setActiveLoadout(l.id)}>
                      <span className="lo-name">{l.name}</span>
                      <span className="lo-size">{loadoutSize(l)} items</span>
                    </button>
                    <div className="lo-actions">
                      <button title="Share (get a /borrow key)" onClick={() => shareLoadout(l)} disabled={shareBusy}>
                        ↗
                      </button>
                      <button title="Rename" onClick={() => renameLoadout(l)}>
                        ✎
                      </button>
                      <button title="Duplicate" onClick={() => duplicateLoadout(l)}>
                        ⧉
                      </button>
                      {isAdmin && (
                        <button title="Publish as a Featured preset" onClick={() => shareLoadout(l, true)} disabled={shareBusy}>
                          ★
                        </button>
                      )}
                      {store.loadouts.length > 1 && (
                        <button title="Delete" onClick={() => deleteLoadout(l)}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {activeLoadout && (
                <div className="active-loadout">
                  <div className="al-head">
                    <strong>{activeLoadout.name}</strong>
                    <code>/loadout {activeLoadout.name}</code>
                  </div>
                  {(["t", "ct"] as Side[]).map((side) => (
                    <div key={side} className="al-side">
                      <div className="al-side-head">
                        <span className={`side-tag ${side === "t" ? "side-t" : "side-ct"}`}>{side.toUpperCase()}</span>
                        <span className="muted">{side === "t" ? "Terrorist" : "Counter-Terrorist"}</span>
                      </div>
                      {sideRows(side).length === 0 ? (
                        <p className="empty-hint small">Nothing on this side yet.</p>
                      ) : (
                        <div className="loadout-rows">
                          {sideRows(side).map(({ slot, item }) => (
                            <div key={`${slot}-${item.id}`} className="loadout-row">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.image} alt="" />
                              <div className="loadout-row-text">
                                <strong>{skinLabel(item.skinName)}</strong>
                                <span className="muted">{slot}</span>
                              </div>
                              <button className="lo-unequip" title="Unequip" onClick={() => unequipSlot(side, item)}>
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Borrow a loadout by key + Featured presets */}
              <div className="share-block">
                <div className="lo-head" style={{ marginTop: 4 }}>
                  <span className="loadout-label">BORROW A LOADOUT</span>
                </div>
                <form
                  className="borrow-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    importByKey(importKey);
                  }}
                >
                  <input
                    className="input"
                    placeholder="paste a key…"
                    value={importKey}
                    maxLength={16}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => setImportKey(e.target.value)}
                  />
                  <button className="btn small" type="submit" disabled={shareBusy || !importKey.trim()}>
                    Borrow
                  </button>
                </form>
                <p className="field-hint" style={{ marginTop: 6 }}>
                  Share ↗ any loadout for a short key. In-game: <code>/borrow &lt;key&gt;</code>.
                </p>

                {featured.length > 0 && (
                  <>
                    <div className="lo-head" style={{ marginTop: 16 }}>
                      <span className="loadout-label">★ FEATURED PRESETS</span>
                    </div>
                    <div className="featured-list">
                      {featured.map((f) => (
                        <div key={f.key} className="featured-card">
                          <div className="fc-imgs">
                            {f.images.slice(0, 4).map((img, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={img} alt="" loading="lazy" />
                            ))}
                          </div>
                          <div className="fc-text">
                            <strong>{f.name}</strong>
                            <span className="muted">
                              {f.ownerName ? `by ${f.ownerName} · ` : ""}
                              {f.count} items
                            </span>
                          </div>
                          <button className="btn small" onClick={() => importByKey(f.key)} disabled={shareBusy}>
                            Copy
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {rightTab === "items" && (
            <div className="saved-items">
              {store.items.length === 0 ? (
                <p className="empty-hint">Nothing saved yet — build a weapon and it lands here.</p>
              ) : (
                store.items.map((item) => {
                  const sides = equippedSides(activeLoadout, item);
                  return (
                    <div key={item.id} className={`saved-item ${sides.length ? "equipped" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.image} alt="" loading="lazy" />
                      <div className="si-text">
                        <strong>
                          {item.statTrak ? "StatTrak™ " : ""}
                          {skinLabel(item.skinName)}
                        </strong>
                        <span className="muted">
                          {item.weaponName}
                          {sides.length ? ` · ${sides.map((s) => s.toUpperCase()).join(" + ")}` : ""}
                        </span>
                        <div className="si-actions">
                          <button className="btn small" onClick={() => equipItem(item, "t")}>
                            T
                          </button>
                          <button className="btn small" onClick={() => equipItem(item, "ct")}>
                            CT
                          </button>
                          <button className="btn small" onClick={() => equipItem(item, "both")}>
                            Both
                          </button>
                          <button className="btn small secondary" onClick={() => editItem(item)}>
                            Edit
                          </button>
                          <button className="btn small danger" onClick={() => deleteItem(item)}>
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </aside>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
