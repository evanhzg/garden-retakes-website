"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InventoryItem,
  InventoryStore,
  Loadout,
  PlacedSticker,
  SLOT_ANCHORS,
  Team,
  defaultStickerSlots,
  defaultStore,
  loadStore,
  newId,
  normaliseStore,
  saveStore,
} from "@/lib/inventory";

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
type Session = { authenticated: boolean; steamId?: string; name?: string | null; avatar?: string | null };
type Tab = "builder" | "inventory";

const CATEGORY_ORDER = ["Rifles", "Snipers", "SMGs", "Pistols", "Heavy"];

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

export default function InventorySimulator() {
  const [store, setStore] = useState<InventoryStore>(defaultStore());
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session>({ authenticated: false });
  const [origin, setOrigin] = useState("");
  const [tab, setTab] = useState<Tab>("builder");
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
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [stickerQuery, setStickerQuery] = useState("Katowice 2014");
  const [stickerResults, setStickerResults] = useState<StickerOption[]>([]);
  const [stickersLoading, setStickersLoading] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragSlot = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

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

  const persist = useCallback(
    (next: InventoryStore, authed: boolean) => {
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
    },
    []
  );

  useEffect(() => {
    if (hydrated) persist(store, session.authenticated);
  }, [store, hydrated, session.authenticated, persist]);

  const activeLoadout = useMemo(
    () => store.loadouts.find((l) => l.id === store.activeLoadoutId) ?? store.loadouts[0],
    [store]
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
                stickers,
                wear,
                seed,
                statTrak,
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
        weaponDef: weapon.def,
        weaponName: weapon.name,
        team: weapon.team,
        skinId: selectedSkin.id,
        skinName: selectedSkin.name,
        paint: selectedSkin.paint,
        image: selectedSkin.image,
        wear,
        seed,
        statTrak,
        nameTag,
        stickers,
        createdAt: Date.now(),
      };
      setEditingItemId(item.id);
      return {
        ...current,
        nextUid: current.nextUid + 1,
        items: [item, ...current.items],
        loadouts: current.loadouts.map((l) =>
          l.id === current.activeLoadoutId
            ? { ...l, equipped: { ...l.equipped, [item.weaponDef]: item.id } }
            : l
        ),
      };
    });
    showToast(`Saved & equipped on ${activeLoadout?.name ?? "loadout"}`);
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
    setWeapon(found ?? { id: 0, def: item.weaponDef, name: item.weaponName, model: "", image: item.image, category: foundCategory, team: item.team });
    setSelectedSkin({ id: item.skinId, def: item.weaponDef, paint: item.paint, name: item.skinName, image: item.image, rarity: "#a855f7" });
    setStickers(item.stickers.length ? [...item.stickers] : defaultStickerSlots());
    setWear(item.wear);
    setSeed(item.seed);
    setStatTrak(item.statTrak);
    setNameTag(item.nameTag);
    setEditingItemId(item.id);
    setTab("builder");
  };

  // ---------- Inventory ----------

  const equipItem = (item: InventoryItem) => {
    setStore((current) => ({
      ...current,
      loadouts: current.loadouts.map((l) =>
        l.id === current.activeLoadoutId
          ? { ...l, equipped: { ...l.equipped, [item.weaponDef]: item.id } }
          : l
      ),
    }));
    showToast(`Equipped on ${activeLoadout?.name ?? "loadout"}`);
  };

  const deleteItem = (item: InventoryItem) => {
    setStore((current) => ({
      ...current,
      items: current.items.filter((i) => i.id !== item.id),
      loadouts: current.loadouts.map((l) => {
        const equipped = { ...l.equipped };
        for (const [def, itemId] of Object.entries(equipped)) {
          if (itemId === item.id) delete equipped[def];
        }
        return { ...l, equipped };
      }),
    }));
    if (editingItemId === item.id) setEditingItemId(null);
  };

  // ---------- Loadouts ----------

  const addLoadout = () => {
    const loadout: Loadout = { id: newId(), name: `Loadout ${store.loadouts.length + 1}`, equipped: {} };
    setStore((current) => ({ ...current, loadouts: [...current.loadouts, loadout], activeLoadoutId: loadout.id }));
  };

  const renameLoadout = (loadout: Loadout) => {
    const name = window.prompt("Loadout name", loadout.name)?.trim();
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
        activeLoadoutId: current.activeLoadoutId === loadout.id ? loadouts[0].id : current.activeLoadoutId,
      };
    });
  };

  const setActiveLoadout = (id: string) => setStore((current) => ({ ...current, activeLoadoutId: id }));

  const filteredSkins = skins.filter((s) => skinLabel(s.name).toLowerCase().includes(skinSearch.toLowerCase()));

  // ---------- Render ----------

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
                Loadouts sync in-game via the plugin · run <code>css_ws</code> to refresh
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

      {/* Loadout switcher (always visible) */}
      <div className="loadout-bar">
        <span className="loadout-label">LOADOUT</span>
        {store.loadouts.map((l) => (
          <span key={l.id} className={`loadout-chip ${l.id === store.activeLoadoutId ? "active" : ""}`}>
            <button className="loadout-chip-main" onClick={() => setActiveLoadout(l.id)}>
              {l.name} · {Object.keys(l.equipped).length}
            </button>
            <button className="loadout-chip-edit" title="Rename" onClick={() => renameLoadout(l)}>
              ✎
            </button>
            {store.loadouts.length > 1 && (
              <button className="loadout-chip-edit" title="Delete" onClick={() => deleteLoadout(l)}>
                ✕
              </button>
            )}
          </span>
        ))}
        <button className="loadout-chip add" onClick={addLoadout}>
          + New loadout
        </button>
      </div>

      <div className="tabs">
        <button className={tab === "builder" ? "active" : ""} onClick={() => setTab("builder")}>
          Weapon picker
        </button>
        <button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>
          Inventory ({store.items.length})
        </button>
      </div>

      {tab === "builder" && (
        <>
          <div className="chip-row">
            {(catalog ? CATEGORY_ORDER.filter((c) => catalog[c]) : CATEGORY_ORDER).map((c) => (
              <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>

          {!catalog ? (
            <p className="empty-hint">Loading weapons…</p>
          ) : (
            <div className="card-grid" style={{ marginBottom: 20 }}>
              {(catalog[category] ?? []).map((w) => (
                <div key={w.def} className={`item-card ${weapon?.def === w.def ? "selected" : ""}`} onClick={() => pickWeapon(w)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.image} alt={w.name} loading="lazy" />
                  <div className="name">{w.name}</div>
                  <div className={`sub team-${w.team}`}>{w.team === "both" ? "CT / T" : w.team.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}

          {weapon && !selectedSkin && (
            <div className="panel">
              <h2>Pick a skin for the {weapon.name}</h2>
              <input
                className="input"
                placeholder="Search skins…"
                value={skinSearch}
                onChange={(e) => setSkinSearch(e.target.value)}
                style={{ marginBottom: 14 }}
              />
              {skinsLoading ? (
                <p className="empty-hint">Loading skins…</p>
              ) : (
                <div className="card-grid">
                  {filteredSkins.map((s) => (
                    <div key={s.id} className="item-card" onClick={() => setSelectedSkin(s)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.image} alt={s.name} loading="lazy" />
                      <div className="name" style={{ color: s.rarity }}>
                        {skinLabel(s.name)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {weapon && selectedSkin && (
            <div className="builder-columns">
              <div>
                <div ref={stageRef} className="sticker-stage" onPointerMove={onStagePointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="weapon-img" src={selectedSkin.image} alt={selectedSkin.name} />
                  {SLOT_ANCHORS.map((anchor, slot) =>
                    stickers[slot] ? null : (
                      <div key={slot} className="slot-hint" style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}>
                        {slot + 1}
                      </div>
                    )
                  )}
                  {stickers.map((sticker, slot) =>
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
                    <input className="input" type="number" min={0} max={1000} value={seed} onChange={(e) => setSeed(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))} />
                  </label>
                  <label className="config-field">
                    <span>Name tag</span>
                    <input className="input" placeholder="(none)" maxLength={20} value={nameTag} onChange={(e) => setNameTag(e.target.value)} />
                  </label>
                  <label className="config-field toggle">
                    <input type="checkbox" checked={statTrak} onChange={(e) => setStatTrak(e.target.checked)} />
                    <span>StatTrak™</span>
                  </label>
                </div>

                <div className="connect-row" style={{ marginTop: 14 }}>
                  <button className="btn" onClick={saveToInventory}>
                    {editingItemId ? "Update item" : "Save to inventory & equip"}
                  </button>
                  <button className="btn secondary" onClick={() => setSelectedSkin(null)}>
                    Change skin
                  </button>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    Drag stickers to preview placement · hover to remove
                  </span>
                </div>
              </div>

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
            </div>
          )}
        </>
      )}

      {tab === "inventory" && (
        <div className="panel">
          <h2>Your inventory</h2>
          {store.items.length === 0 ? (
            <p className="empty-hint">Nothing saved yet — build a weapon in the picker and it lands here.</p>
          ) : (
            <div className="card-grid">
              {store.items.map((item) => {
                const equippedHere = activeLoadout?.equipped[item.weaponDef] === item.id;
                return (
                  <div key={item.id} className={`item-card ${equippedHere ? "selected" : ""}`}>
                    <div style={{ position: "relative" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.image} alt={item.skinName} loading="lazy" />
                      {item.stickers.map((sticker, slot) =>
                        sticker ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={slot}
                            src={sticker.image}
                            alt=""
                            style={{ position: "absolute", left: `${sticker.x}%`, top: `${sticker.y}%`, width: 18, height: 18, transform: "translate(-50%, -50%)" }}
                          />
                        ) : null
                      )}
                    </div>
                    <div className="name">
                      {item.statTrak ? "StatTrak™ " : ""}
                      {skinLabel(item.skinName)}
                    </div>
                    <div className="sub">
                      {item.weaponName}
                      {equippedHere ? " · equipped" : ""}
                    </div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8 }}>
                      <button className="btn small" onClick={() => equipItem(item)} disabled={equippedHere}>
                        {equippedHere ? "Equipped" : "Equip"}
                      </button>
                      <button className="btn small secondary" onClick={() => editItem(item)}>
                        Edit
                      </button>
                      <button className="btn small danger" onClick={() => deleteItem(item)}>
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
