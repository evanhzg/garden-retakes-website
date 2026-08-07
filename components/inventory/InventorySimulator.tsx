"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InventoryItem,
  InventoryStore,
  ItemKind,
  Loadout,
  LOADOUT_COLORS,
  M4A1S,
  M4A4,
  PlacedSticker,
  SIGNATURE_SLOTS,
  SLOT_ANCHORS,
  Side,
  TOTAL_SIGNATURE_SLOTS,
  Team,
  defaultStickerSlots,
  defaultStore,
  emptyLoadout,
  loadStore,
  loadoutSize,
  newId,
  normaliseStore,
  rarityName,
  rarityRank,
  saveStore,
  skinKey,
} from "@/lib/inventory";
import { useI18n } from '@/components/I18nProvider';
import { importSnapshot, type LoadoutSnapshot } from "@/lib/share";
import SkinEditor3D from "./SkinEditor3D";

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
type SkinSort = "name" | "quality" | "newest" | "fav";

/** One tile on the equipped board. */
type BoardSlot = {
  key: string;
  def: number;
  kind: ItemKind;
  label: string;
  item?: InventoryItem;
  /** The CT rifle tile, which toggles between M4A4 and M4A1-S. */
  m4?: boolean;
  /** True for slots outside the signature set, appended so nothing is hidden. */
  extra?: boolean;
};

const CATEGORY_ORDER = ["Rifles", "Snipers", "SMGs", "Pistols", "Heavy", "Knives", "Gloves"];
const SIDES: Side[] = ["t", "ct"];

function wearLabel(wear: number): string {
  if (wear < 0.07) return "Factory New";
  if (wear < 0.15) return "Minimal Wear";
  if (wear < 0.38) return "Field-Tested";
  if (wear < 0.45) return "Well-Worn";
  return "Battle-Scarred";
}
const wearShort = (wear: number) =>
  wearLabel(wear).split(/[\s-]/).map((w) => w[0]).join("").toUpperCase();

const skinLabel = (name: string) => name.split(" | ")[1] ?? name;

function kindOfCategory(category: string): ItemKind {
  if (category === "Knives") return "knife";
  if (category === "Gloves") return "gloves";
  return "weapon";
}

export default function InventorySimulator() {
    const { t } = useI18n();

  const [store, setStore] = useState<InventoryStore>(defaultStore());
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session>({ authenticated: false });
  const [origin, setOrigin] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [category, setCategory] = useState("Rifles");
  /** Whole-loadout view instead of the store. Closes any open type. */
  const [previewMode, setPreviewMode] = useState(false);
  /** Which weapon type the loadout rail has open. Null = all collapsed. */
  const [openBoardType, setOpenBoardType] = useState<string | null>(null);
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
  const [editor3dOpen, setEditor3dOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; skin: Skin } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);
  const [stickerQuery, setStickerQuery] = useState("Katowice 2014");
  const [stickerResults, setStickerResults] = useState<StickerOption[]>([]);
  const [stickersLoading, setStickersLoading] = useState(false);

  // Loadout switcher drag-reorder
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Share / borrow
  const [share, setShare] = useState<{ key: string; name: string } | null>(null);
  const [importKey, setImportKey] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragSlot = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2400);
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

  // ---------- URL state ----------
  //
  // Written with history.replaceState rather than the Next router: this is a
  // client workspace on a force-dynamic route, so router.replace would round
  // trip to the server on every category click. history + a popstate listener
  // gives working back/forward with no network at all.

  const applyUrl = useCallback(
    (cat: Catalog | null) => {
      const q = new URLSearchParams(window.location.search);
      const s = q.get("side");
      if (s === "t" || s === "ct") setSide(s);
      const c = q.get("cat");
      if (c && CATEGORY_ORDER.includes(c)) setCategory(c);
      setPreviewMode(q.get("view") === "preview");
      const lo = q.get("lo");
      if (lo) setStore((cur) => (cur.loadouts.some((l) => l.id === lo) ? { ...cur, activeLoadoutId: lo } : cur));

      const w = q.get("w");
      if (w && cat) {
        const def = Number(w);
        const entry = Object.values(cat).flat().find((e) => e.def === def);
        setWeapon(entry ?? null);
      } else if (!w) {
        setWeapon(null);
      }
    },
    []
  );

  const writeUrl = useCallback(
    (patch: Record<string, string | null>, push = false) => {
      if (typeof window === "undefined") return;
      const q = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") q.delete(k);
        else q.set(k, v);
      }
      const url = `${window.location.pathname}${q.toString() ? `?${q}` : ""}`;
      if (push) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    []
  );

  // Restore from the URL once the catalog is in (a ?w= needs it to resolve).
  const bootedUrl = useRef(false);
  useEffect(() => {
    if (!hydrated || bootedUrl.current) return;
    // Side, category and loadout can be restored straight away, but ?w= needs
    // the catalog to turn a def number back into a weapon. Waiting for it is
    // what makes a refresh land where you were instead of on the default page.
    applyUrl(catalog);
    if (catalog) bootedUrl.current = true;
  }, [hydrated, catalog, applyUrl]);

  useEffect(() => {
    const onPop = () => applyUrl(catalog);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [applyUrl, catalog]);

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
    if (!editor3dOpen) return;
    const h = window.setTimeout(() => {
      setStickersLoading(true);
      fetch(`/api/stickers?q=${encodeURIComponent(stickerQuery)}`)
        .then((r) => r.json())
        .then((d: StickerOption[]) => setStickerResults(Array.isArray(d) ? d : []))
        .catch(() => setStickerResults([]))
        .finally(() => setStickersLoading(false));
    }, 350);
    return () => window.clearTimeout(h);
  }, [stickerQuery, editor3dOpen]);

  // ---------- Slot helpers ----------
  const slotItemFor = useCallback(
    (def: number, kind: ItemKind, s: Side, loadout = activeLoadout): InventoryItem | undefined => {
      if (!loadout) return undefined;
      if (kind === "knife") {
        const item = itemById(s === "t" ? loadout.knifeT : loadout.knifeCT);
        return item?.weaponDef === def ? item : undefined;
      }
      if (kind === "gloves") {
        const item = itemById(s === "t" ? loadout.glovesT : loadout.glovesCT);
        return item?.weaponDef === def ? item : undefined;
      }
      if (kind === "agent") {
        const item = itemById(s === "t" ? loadout.agentT : loadout.agentCT);
        return item?.weaponDef === def ? item : undefined;
      }
      return itemById((s === "t" ? loadout.equippedT : loadout.equippedCT)[def]);
    },
    [activeLoadout, itemById]
  );

  // For the chooser head / sticker stage: resolve knife/gloves without def check
  // (the user has already clicked that specific weapon entry).
  const slotItemForChooser = useCallback(
    (def: number, kind: ItemKind, s: Side, loadout = activeLoadout): InventoryItem | undefined => {
      if (!loadout) return undefined;
      if (kind === "knife") return itemById(s === "t" ? loadout.knifeT : loadout.knifeCT);
      if (kind === "gloves") return itemById(s === "t" ? loadout.glovesT : loadout.glovesCT);
      if (kind === "agent") return itemById(s === "t" ? loadout.agentT : loadout.agentCT);
      return itemById((s === "t" ? loadout.equippedT : loadout.equippedCT)[def]);
    },
    [activeLoadout, itemById]
  );

  // ---------- The equipped board ----------
  const boardFor = useCallback(
    (s: Side): BoardSlot[] => {
      if (!activeLoadout) return [];
      const preferredM4 = activeLoadout.preferredM4 ?? M4A4;
      const byDef = (def: number) => Object.values(catalog ?? {}).flat().find((w) => w.def === def);

      const guns: BoardSlot[] = SIGNATURE_SLOTS[s].map((slot) => {
        const def = slot.m4 ? preferredM4 : slot.def;
        return {
          key: `${s}-${slot.label}`,
          def,
          kind: "weapon",
          label: slot.m4 ? (preferredM4 === M4A1S ? "M4A1-S" : "M4A4") : slot.label,
          item: slotItemFor(def, "weapon", s),
          m4: slot.m4,
        };
      });

      const knifeItem = itemById(s === "t" ? activeLoadout.knifeT : activeLoadout.knifeCT);
      const gloveItem = itemById(s === "t" ? activeLoadout.glovesT : activeLoadout.glovesCT);
      const agentItem = itemById(s === "t" ? activeLoadout.agentT : activeLoadout.agentCT);

      // Anything equipped on this side that the signature set doesn't cover —
      // an AK on CT, an MP9 on T — still has to be visible somewhere.
      const covered = new Set(guns.map((g) => g.def));
      const extras: BoardSlot[] = Object.entries(s === "t" ? activeLoadout.equippedT : activeLoadout.equippedCT)
        .filter(([def]) => !covered.has(Number(def)))
        .map(([def, id]) => {
          const n = Number(def);
          return {
            key: `${s}-extra-${def}`,
            def: n,
            kind: "weapon" as ItemKind,
            label: byDef(n)?.name ?? `Weapon ${def}`,
            item: itemById(id),
            extra: true,
          };
        });

      return [
        ...guns,
        { key: `${s}-knife`, def: knifeItem?.weaponDef ?? -1, kind: "knife", label: "Knife", item: knifeItem },
        { key: `${s}-gloves`, def: gloveItem?.weaponDef ?? -1, kind: "gloves", label: "Gloves", item: gloveItem },
        { key: `${s}-agent`, def: agentItem?.weaponDef ?? -1, kind: "agent", label: "Agent", item: agentItem },
        ...extras,
      ];
    },
    [activeLoadout, catalog, itemById, slotItemFor]
  );

  const boardT = useMemo(() => boardFor("t"), [boardFor]);
  const boardCT = useMemo(() => boardFor("ct"), [boardFor]);

  /** Filled signature slots out of the 12 both sides can hold. */
  const completeness = useMemo(() => {
    const filled = [...boardT, ...boardCT].filter((slot) => !slot.extra && slot.item).length;
    return { filled, total: TOTAL_SIGNATURE_SLOTS, pct: Math.round((filled / TOTAL_SIGNATURE_SLOTS) * 100) };
  }, [boardT, boardCT]);

  /** Rarity spread of everything in the active loadout, rarest first. */
  const rarityBreakdown = useMemo(() => {
    const counts = new Map<string, { name: string; hex: string; count: number; rank: number }>();
    for (const slot of [...boardT, ...boardCT]) {
      const hex = slot.item?.rarity;
      if (!hex) continue;
      const key = hex.toLowerCase();
      const cur = counts.get(key);
      if (cur) cur.count += 1;
      else counts.set(key, { name: rarityName(hex), hex, count: 1, rank: rarityRank(hex) });
    }
    return Array.from(counts.values()).sort((a, b) => b.rank - a.rank);
  }, [boardT, boardCT]);

  // ---------- Opening weapons ----------
  const openWeapon = useCallback(
    (w: WeaponEntry, opts: { push?: boolean } = {}) => {
      setWeapon(w);
      setSkinSearch("");
      setCollectionFilter("");
      setEditor3dOpen(false);
      writeUrl({ w: String(w.def), cat: w.category }, opts.push ?? true);
      const existing = slotItemForChooser(w.def, kindOfCategory(w.category), side);
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
    },
    [side, slotItemForChooser, writeUrl]
  );

  const closeChooser = useCallback(() => {
    setWeapon(null);
    writeUrl({ w: null }, true);
  }, [writeUrl]);

  /** Board tile → the chooser for that slot. */
  const openBoardSlot = (slot: BoardSlot, s: Side) => {
    setSide(s);
    writeUrl({ side: s });
    if (slot.kind !== "weapon") {
      // Knife and glove tiles have no fixed def until something is equipped,
      // so an empty one lands on the right category instead of the chooser.
      const cat = slot.kind === "knife" ? "Knives" : slot.kind === "gloves" ? "Gloves" : slot.kind === "agent" ? "Agents" : slot.kind === "patch" ? "Patches" : slot.kind === "charm" ? "Charms" : "Gloves";
      if (slot.item) {
        const entry = Object.values(catalog ?? {}).flat().find((w) => w.def === slot.item!.weaponDef);
        if (entry) return openWeapon(entry);
      }
      setCategory(cat);
      setWeapon(null);
      writeUrl({ cat, w: null }, true);
      return;
    }
    const entry = Object.values(catalog ?? {}).flat().find((w) => w.def === slot.def);
    if (entry) openWeapon(entry);
  };

  /**
   * The rail's slots, grouped by weapon type, for the side currently selected.
   * Knives and gloves are their own groups since they are not in any category.
   */
  const boardGroups = useMemo(() => {
    const slots = side === "t" ? boardT : boardCT;
    const categoryOf = (def: number) => {
      if (!catalog) return "Other";
      for (const [c, list] of Object.entries(catalog)) {
        if (list.some((w) => w.def === def)) return c;
      }
      return "Other";
    };
    const groups = new Map<string, typeof slots>();
    for (const slot of slots) {
      const g = slot.kind === "knife" ? "Knives" : slot.kind === "gloves" ? "Gloves" : slot.kind === "agent" ? "Agents" : slot.kind === "patch" ? "Patches" : slot.kind === "charm" ? "Charms" : categoryOf(slot.def);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(slot);
    }
    return Array.from(groups.entries());
  }, [side, boardT, boardCT, catalog]);

  const chooseSide = (s: Side) => {
    setSide(s);
    writeUrl({ side: s });
  };
  const chooseCategory = (c: string) => {
    // Clicking the open type closes it; clicking another swaps to it. Two types
    // open at once would put two skin lists on the page with no way to tell
    // which one an equip belonged to.
    if (c === category && weapon) {
      setWeapon(null);
      writeUrl({ w: null });
      return;
    }
    setCategory(c);
    setPreviewMode(false);
    const first = catalog?.[c]?.[0];
    if (first) {
      openWeapon(first, { push: false });
      writeUrl({ cat: c, view: null });
    } else {
      setWeapon(null);
      writeUrl({ cat: c, w: null, view: null });
    }
  };

  const togglePreview = () => {
    setPreviewMode((on) => {
      const next = !on;
      // Preview is the whole loadout at once, so an open type would be a second
      // answer to the same question.
      if (next) setWeapon(null);
      writeUrl({ view: next ? "preview" : null, w: null });
      return next;
    });
  };

  // Escape backs out of the chooser; T / C flip sides. Skipped while a text
  // field has focus so typing a skin name doesn't jump the side.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (e.key === "Escape") {
        if (share) return setShare(null);
        if (weapon) return closeChooser();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "t") chooseSide("t");
      if (e.key.toLowerCase() === "c") chooseSide("ct");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Equip / clear ----------
  const equipSkin = (skin: Skin, overrideSide?: "t" | "ct" | "both", preventClose?: boolean) => {
    if (!weapon) return;
    const kind = kindOfCategory(weapon.category);
    const targetSides = overrideSide === "both" ? ["t" as const, "ct" as const] : [overrideSide || side];
    
    setStore((cur) => {
      const loadout = cur.loadouts.find((l) => l.id === cur.activeLoadoutId);
      if (!loadout) return cur;
      let nextUid = cur.nextUid;
      let newItems = [...cur.items];
      let newLoadout = { ...loadout, equippedCT: { ...loadout.equippedCT }, equippedT: { ...loadout.equippedT } };

      for (const s of targetSides) {
        const existing = slotItemForChooser(weapon.def, kind, s, newLoadout);
        const payload = {
          kind,
          weaponDef: weapon.def,
          weaponName: weapon.name,
          team: weapon.team,
          skinId: skin.id,
          skinName: skin.name,
          paint: skin.paint,
          image: skin.image,
          rarity: skin.rarity,
          wear,
          seed,
          statTrak: supportsStatTrak ? statTrak : false,
          nameTag,
          stickers: supportsStickers ? stickers : defaultStickerSlots(),
        };
        let itemId: string;
        if (existing) {
          itemId = existing.id;
          newItems = newItems.map((i) => (i.id === existing.id ? { ...i, ...payload } : i));
        } else {
          itemId = newId();
          newItems = [{ id: itemId, uid: nextUid, createdAt: Date.now(), ...payload }, ...newItems];
          nextUid += 1;
        }

        if (kind === "knife") {
          if (s === "t") newLoadout.knifeT = itemId;
          else newLoadout.knifeCT = itemId;
        } else if (kind === "gloves") {
          if (s === "t") newLoadout.glovesT = itemId;
          else newLoadout.glovesCT = itemId;
        } else if (kind === "agent") {
          if (s === "t") newLoadout.agentT = itemId;
          else newLoadout.agentCT = itemId;
        } else {
          if (s === "t") newLoadout.equippedT[weapon.def] = itemId;
          else newLoadout.equippedCT[weapon.def] = itemId;
        }
      }
      
      const loadouts = cur.loadouts.map(l => l.id === newLoadout.id ? newLoadout : l);
      return pruneItems({ ...cur, items: newItems, loadouts, nextUid });
    });
    
    showToast(`Equipped ${skinLabel(skin.name)}`);
    if (!preventClose) closeChooser();
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
        } else if (kind === "agent") {
          if (side === "t") nl.agentT = undefined;
          else nl.agentCT = undefined;
        } else if (side === "t") delete nl.equippedT[def];
        else delete nl.equippedCT[def];
        return nl;
      });
      return pruneItems({ ...cur, loadouts });
    });
  };

  /** Drop items no loadout references, to avoid orphan bloat. */
  const pruneItems = (s: InventoryStore): InventoryStore => {
    const used = new Set<string>();
    for (const l of s.loadouts) {
      Object.values(l.equippedCT).forEach((id) => used.add(id));
      Object.values(l.equippedT).forEach((id) => used.add(id));
      [l.knifeCT, l.knifeT, l.glovesCT, l.glovesT, l.agentCT, l.agentT].forEach((id) => id && used.add(id));
      l.equippedPatchesCT?.forEach(id => id && used.add(id));
      l.equippedPatchesT?.forEach(id => id && used.add(id));
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

  const setPreferredM4 = (def: number) => {
    setStore((cur) => ({
      ...cur,
      loadouts: cur.loadouts.map((l) => (l.id === cur.activeLoadoutId ? { ...l, preferredM4: def } : l)),
    }));
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
    writeUrl({ lo: l.id });
  };
  const duplicateLoadout = (src: Loadout) => {
    const copy: Loadout = { ...src, id: newId(), name: `${src.name} copy`, equippedCT: { ...src.equippedCT }, equippedT: { ...src.equippedT } };
    setStore((c) => ({ ...c, loadouts: [...c.loadouts, copy], activeLoadoutId: copy.id }));
    writeUrl({ lo: copy.id });
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
    if (!window.confirm(`Delete "${l.name}"?`)) return;
    setStore((c) => {
      const loadouts = c.loadouts.filter((x) => x.id !== l.id);
      return { ...c, loadouts, activeLoadoutId: c.activeLoadoutId === l.id ? loadouts[0].id : c.activeLoadoutId };
    });
  };
  const setLoadoutColor = (l: Loadout, color: string) => {
    setStore((c) => ({ ...c, loadouts: c.loadouts.map((x) => (x.id === l.id ? { ...x, color } : x)) }));
  };
  const setActiveLoadout = (id: string) => {
    setStore((c) => ({ ...c, activeLoadoutId: id }));
    writeUrl({ lo: id });
  };

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
  };

  // ---------- Share / borrow ----------
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      showToast("Clipboard blocked — select and copy manually");
    }
  };

  const shareLoadout = async (l: Loadout) => {
    setShareBusy(true);
    try {
      const res = await fetch("/api/loadout/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store, loadoutId: l.id }),
      });
      const j = await res.json();
      if (!res.ok || !j.key) {
        showToast(j.error ?? "Could not share");
        return;
      }
      // The old flow wrote the key to the clipboard and said nothing at all, so
      // a successful share was indistinguishable from a dead button.
      setShare({ key: j.key, name: l.name });
      await copy(j.key, "key");
    } finally {
      setShareBusy(false);
    }
  };


  const importCstrike = async (raw: string) => {
    const payload = raw.trim();
    if (!payload) return;
    setShareBusy(true);
    try {
      const res = await fetch("/api/loadout/import-cstrike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const j = await res.json();
      if (!res.ok || !j.loadout) {
        showToast(j.error ?? "Import failed");
        return;
      }
      setStore((cur) => {
        let maxUid = cur.nextUid;
        for (const i of j.items) if (i.uid >= maxUid) maxUid = i.uid + 1;
        return {
          ...cur,
          items: [...cur.items, ...j.items],
          loadouts: [...cur.loadouts, j.loadout],
          activeLoadoutId: j.loadout.id,
          nextUid: maxUid,
        };
      });
      setImportKey("");
      showToast("Imported from cstrike");
    } finally {
      setShareBusy(false);
    }
  };

  const importByKey = useCallback(
    async (raw: string) => {
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
    },
    [showToast]
  );

  // A shared link lands here as ?borrow=<key> and imports itself, so the
  // recipient never has to know what a borrow key is.
  const borrowed = useRef(false);
  useEffect(() => {
    if (!hydrated || borrowed.current) return;
    const key = new URLSearchParams(window.location.search).get("borrow");
    if (!key) return;
    borrowed.current = true;
    importByKey(key).finally(() => writeUrl({ borrow: null }));
  }, [hydrated, importByKey, writeUrl]);

  // ---------- Derived: skin chooser list ----------
  const collections = useMemo(() => {
    const set = new Set<string>();
    for (const s of skins) if (s.collection) set.add(s.collection);
    return Array.from(set).sort();
  }, [skins]);

  const currentSkinId = weapon ? slotItemForChooser(weapon.def, builderKind, side)?.skinId : undefined;

  const shownSkins = useMemo(() => {
    let list = skins.filter((s) => skinLabel(s.name).toLowerCase().includes(skinSearch.toLowerCase()));
    if (collectionFilter) list = list.filter((s) => s.collection === collectionFilter);
    if (favOnly) list = list.filter((s) => favorites.has(skinKey(s.def, s.paint)));
    if (skinSort === "quality") list.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || skinLabel(a.name).localeCompare(skinLabel(b.name)));
    else if (skinSort === "newest") list.sort((a, b) => b.paint - a.paint);
    else if (skinSort === "fav") list.sort((a, b) => Number(favorites.has(skinKey(b.def, b.paint))) - Number(favorites.has(skinKey(a.def, a.paint))));
    else list.sort((a, b) => skinLabel(a.name).localeCompare(skinLabel(b.name)));
    if (currentSkinId) {
      const idx = list.findIndex((s) => s.id === currentSkinId);
      if (idx > 0) list.unshift(list.splice(idx, 1)[0]);
    }
    return list;
  }, [skins, skinSearch, collectionFilter, favOnly, favorites, skinSort, currentSkinId]);

  /** Roll a random skin from whatever the filters currently show. */
  const surpriseMe = () => {
    const pool = shownSkins.filter((s) => s.id !== currentSkinId);
    if (!pool.length) return showToast("Nothing to roll from");
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setWear(Math.random() * 0.45);
    setSeed(Math.floor(Math.random() * 1000));
    equipSkin(pick);
  };

  const weapons = catalog?.[category] ?? [];
  const borrowUrl = share && origin ? `${origin}/inventory?borrow=${share.key}` : "";

  // ---------- Render ----------
  return (
    <div className="inv4">
      {/* ===== Header: which loadout, how full, and what to do with it ===== */}
      <header className="inv4-bar">
        <div className="inv4-loadouts" role="tablist" aria-label={t("auto.inventorysimulator.loadouts")}>
          {store.loadouts.map((l, idx) => (
            <button
              key={l.id}
              role="tab"
              aria-selected={l.id === store.activeLoadoutId}
              className={`inv4-lo ${l.id === store.activeLoadoutId ? "active" : ""} ${dragOver === idx ? "dragover" : ""}`}
              draggable
              onDragStart={() => (dragIndex.current = idx)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(idx);
              }}
              onDrop={() => onLoDrop(idx)}
              onDragEnd={() => {
                setDragOver(null);
                dragIndex.current = null;
              }}
              onClick={() => setActiveLoadout(l.id)}
            >
              <span className="inv4-lo-dot" style={{ background: l.color ?? "var(--color-neutral-500)" }} />
              {l.name}
              <span className="inv4-lo-count">{loadoutSize(l)}</span>
            </button>
          ))}
          <button className="btn btn-secondary inv4-lo-new" onClick={addLoadout} title={t("auto.inventorysimulator.new_loadout")}>
            {t("auto.inventorysimulator._new")}
                                </button>
        </div>

        <div className="inv4-bar-right">
          <div className="inv4-progress" title={`${completeness.filled} of ${completeness.total} signature slots`}>
            <div className="inv4-progress-track">
              <div className="inv4-progress-fill" style={{ width: `${completeness.pct}%` }} />
            </div>
            <span className="inv4-progress-label num">
              {completeness.filled}/{completeness.total} {t("auto.inventorysimulator.dressed")}
                                      </span>
          </div>

          <button
            className={`btn ${previewMode ? "btn-primary" : "btn-secondary"}`}
            onClick={togglePreview}
            title={t("auto.inventorysimulator.see_the_whole_loadout_at_once")}
            aria-pressed={previewMode}
          >
            {t("auto.inventorysimulator.preview")}
                                </button>

          <button className="btn btn-secondary" disabled={shareBusy || !activeLoadout} onClick={() => activeLoadout && shareLoadout(activeLoadout)}>
            {t("auto.inventorysimulator.share")}
                                </button>

          <form
            className="inv4-borrow"
            onSubmit={(e) => {
              e.preventDefault();
              if (importKey.includes("cstrike.app") || importKey.startsWith("[")) { importCstrike(importKey); } else { importByKey(importKey); }
            }}
          >
            <label className="sr-only" htmlFor="inv-borrow">{t("auto.inventorysimulator.borrow_key")}</label>
            <input
              id="inv-borrow"
              className="input"
              placeholder={t("auto.inventorysimulator.borrow_key")}
              value={importKey}
              // removed max length for cstrike json payloads
              spellCheck={false}
              onChange={(e) => setImportKey(e.target.value)}
            />
            <button className="btn btn-secondary" type="submit" disabled={shareBusy || !importKey.trim()}>
              {t("auto.inventorysimulator.get")}
                                      </button>
          </form>
        </div>
      </header>

      <div className="inv4-body">
        {/* ===== LEFT: what is actually equipped ===== */}
        <aside className="inv4-board">
          {activeLoadout && (
            <div className="inv4-board-head">
              <div className="inv4-board-title">
                <span className="inv4-lo-dot" style={{ background: activeLoadout.color ?? "var(--color-accent)" }} />
                <strong>{activeLoadout.name}</strong>
              </div>
              <div className="inv4-board-actions">
                <button className="btn btn-ghost" title={t("auto.inventorysimulator.rename")} onClick={() => renameLoadout(activeLoadout)}>{t("auto.inventorysimulator.rename")}</button>
                <button className="btn btn-ghost" title={t("auto.inventorysimulator.duplicate")} onClick={() => duplicateLoadout(activeLoadout)}>{t("auto.inventorysimulator.duplicate")}</button>
                {store.loadouts.length > 1 && (
                  <button className="btn btn-ghost" title={t("auto.inventorysimulator.delete")} onClick={() => deleteLoadout(activeLoadout)}>{t("auto.inventorysimulator.delete")}</button>
                )}
              </div>
              <div className="inv4-colors">
                {LOADOUT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    className={`inv4-color ${activeLoadout.color === c.hex ? "active" : ""}`}
                    style={{ background: c.hex }}
                    title={c.name}
                    aria-label={`Colour ${c.name}`}
                    onClick={() => setLoadoutColor(activeLoadout, c.hex)}
                  />
                ))}
              </div>
              {rarityBreakdown.length > 0 && (
                <div className="inv4-rarities">
                  {rarityBreakdown.map((r) => (
                    <span key={r.hex} className="inv4-rarity" title={`${r.count} × ${r.name}`}>
                      <span className="inv4-rarity-dot" style={{ background: r.hex }} />
                      {r.count} {r.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Only this inner wrapper scrolls, so the loadout name, colours and
              rarity chips above stay put while the slot list moves. */}
          {/* One row of types for the side you are on. Both sides at once was
              two lists of the same eight slots, and the only place the
              difference actually matters is Preview. Types stay closed until
              you open one, so the rail is a rail and not a second store. */}
          <div className="inv4-board-scroll">
            <div className="inv4-types">
              {boardGroups.map(([group, slots]) => {
                const filled = slots.filter((x) => x.item).length;
                const open = openBoardType === group;
                return (
                  <button
                    key={group}
                    className={`inv4-type ${open ? "open" : ""}`}
                    onClick={() => setOpenBoardType(open ? null : group)}
                    aria-expanded={open}
                  >
                    <span className="inv4-type-name">{group}</span>
                    <span className="inv4-type-count num">{filled}/{slots.length}</span>
                  </button>
                );
              })}
            </div>

            {openBoardType && (
              <ul className="inv4-slots">
                {(boardGroups.find(([g]) => g === openBoardType)?.[1] ?? []).map((slot) => (
                  <li key={slot.key}>
                    <button
                      className={`inv4-slot ${slot.item ? "filled" : "empty"}`}
                      onClick={() => openBoardSlot(slot, side)}
                      style={slot.item?.rarity ? ({ "--rarity": slot.item.rarity } as React.CSSProperties) : undefined}
                    >
                      <span className="inv4-slot-art">
                        {slot.item ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={slot.item.image} alt="" loading="lazy" />
                        ) : (
                          <span className="inv4-slot-none" aria-hidden />
                        )}
                      </span>
                      <span className="inv4-slot-text">
                        <span className="inv4-slot-weapon">{slot.label}</span>
                        <span className="inv4-slot-skin">
                          {slot.item ? skinLabel(slot.item.skinName) : "Default"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* ===== RIGHT: browse and choose ===== */}
        <section className="inv4-browse">
          <div className="inv4-topbar">
            <div className="inv4-sides" role="group" aria-label={t("auto.inventorysimulator.side")}>
              {SIDES.map((s) => (
                <button key={s} className={`inv4-sidebtn side-${s} ${side === s ? "active" : ""}`} onClick={() => chooseSide(s)}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="inv4-cats">
              {(catalog ? CATEGORY_ORDER.filter((c) => catalog[c]?.length) : CATEGORY_ORDER).map((c) => (
                <button key={c} className={`chip ${category === c && !weapon ? "active" : ""}`} onClick={() => chooseCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {previewMode ? (
            !catalog ? (
              <p className="empty-hint">{t("auto.inventorysimulator.loading")}</p>
            ) : (
              // Every weapon of every type, skinned or not, grouped under a
              // small heading. This is the "what does my loadout actually look
              // like" view — the store answers a different question and shows
              // one type at a time.
              <div className="inv4-preview">
                {CATEGORY_ORDER.filter((c) => catalog[c]?.length).map((c) => (
                  <section key={c} className="inv4-preview-group">
                    <h3 className="inv4-preview-title">{c}</h3>
                    <div className="inv4-preview-row">
                      {catalog[c].map((w) => {
                        const item = slotItemFor(w.def, kindOfCategory(w.category), side);
                        return (
                          <button
                            key={w.def}
                            className={`inv4-preview-cell ${item ? "has-skin" : ""}`}
                            style={item?.rarity ? ({ "--rarity": item.rarity } as React.CSSProperties) : undefined}
                            onClick={() => {
                              setPreviewMode(false);
                              openWeapon(w);
                            }}
                            title={item ? item.skinName : `${w.name} — no skin`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item?.image ?? w.image} alt={w.name} loading="lazy" />
                            <span className="inv4-preview-name">{w.name}</span>
                            <span className="inv4-preview-skin">{item ? skinLabel(item.skinName) : "—"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : !weapon ? (
            !catalog ? (
              <p className="empty-hint">{t("auto.inventorysimulator.loading")}</p>
            ) : (
              <div className="inv4-weapons">
                {weapons.map((w) => {
                  const item = slotItemFor(w.def, kindOfCategory(w.category), side);
                  return (
                    <button
                      key={w.def}
                      className={`inv4-weapon ${item ? "has-skin" : ""}`}
                      onClick={() => openWeapon(w)}
                      style={item?.rarity ? ({ "--rarity": item.rarity } as React.CSSProperties) : undefined}
                    >
                      <div className="inv4-weapon-img">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item?.image ?? w.image} alt={w.name} loading="lazy" />
                      </div>
                      <div className="inv4-weapon-name">{w.name}</div>
                      <div className="inv4-weapon-skin">{item ? skinLabel(item.skinName) : "Default"}</div>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <div className="inv4-chooser">
              <div className="inv4-chooser-head">
                <button className="btn btn-secondary" onClick={closeChooser}>← {category}</button>
                <strong>{weapon.name}</strong>
                <span className="muted">{side.toUpperCase()} {t("auto.inventorysimulator.slot")}</span>
                <div className="inv4-chooser-head-right">
                  <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={surpriseMe} disabled={skinsLoading} title={t("auto.inventorysimulator.roll_a_random_skin_from_the_cu")}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
                    </svg>
                    {t("auto.inventorysimulator._surprise_me")}
                  </button>
                  {slotItemForChooser(weapon.def, builderKind, side) && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        clearSlot(weapon.def, builderKind);
                        closeChooser();
                      }}
                    >
                      {t("auto.inventorysimulator.remove_skin")}
                                                                      </button>
                  )}
                </div>
              </div>

              <div className="inv4-filters">
                <label className="sr-only" htmlFor="inv-skin-search">{t("auto.inventorysimulator.search_skins")}</label>
                <input id="inv-skin-search" className="input" placeholder={t("auto.inventorysimulator.search_skins")} value={skinSearch} onChange={(e) => setSkinSearch(e.target.value)} />
                <label className="sr-only" htmlFor="inv-skin-sort">{t("auto.inventorysimulator.sort_skins")}</label>
                <select id="inv-skin-sort" className="input" value={skinSort} onChange={(e) => setSkinSort(e.target.value as SkinSort)}>
                  <option value="quality">{t("auto.inventorysimulator.quality")}</option>
                  <option value="name">{t("auto.inventorysimulator.name_a_z")}</option>
                  <option value="newest">{t("auto.inventorysimulator.newest")}</option>
                  <option value="fav">{t("auto.inventorysimulator.favorites_first")}</option>
                </select>
                <label className="sr-only" htmlFor="inv-skin-collection">{t("auto.inventorysimulator.collection")}</label>
                <select id="inv-skin-collection" className="input" value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)}>
                  <option value="">{t("auto.inventorysimulator.all_collections")}</option>
                  {collections.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button className={`chip ${favOnly ? "active" : ""}`} onClick={() => setFavOnly((v) => !v)}>{t("auto.inventorysimulator._favorites")}</button>
              </div>

              <div className="inv4-config">
                <label>
                  {t("auto.inventorysimulator.wear")} <strong>{wear.toFixed(3)}</strong> <em>{wearLabel(wear)}</em>
                  <input type="range" min={0} max={1} step={0.001} value={wear} onChange={(e) => setWear(Number(e.target.value))} />
                </label>
                <label>
                  {t("auto.inventorysimulator.seed")}
                                                            <input className="input" type="number" min={0} max={1000} value={seed} onChange={(e) => setSeed(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))} />
                </label>
                <label>
                  {t("auto.inventorysimulator.name_tag")}
                                                            <input className="input" maxLength={20} value={nameTag} placeholder={t("auto.inventorysimulator.none")} onChange={(e) => setNameTag(e.target.value)} />
                </label>
                {supportsStatTrak && (
                  <label className="inv4-cfg-toggle">
                    <input type="checkbox" checked={statTrak} onChange={(e) => setStatTrak(e.target.checked)} /> {t("auto.inventorysimulator.stattrak")}
                                                                </label>
                )}
                {supportsStickers && (
                  <button className="btn btn-secondary" onClick={() => setEditor3dOpen(true)}>
                    Edit in 3D
                  </button>
                )}
              </div>



              {skinsLoading ? (
                <p className="empty-hint">{t("auto.inventorysimulator.loading_skins")}</p>
              ) : (
                <div className="inv4-skins">
                  {shownSkins.map((s) => {
                    const fav = favorites.has(skinKey(s.def, s.paint));
                    return (
                      <div 
                        key={s.id} 
                        className={`inv4-skin ${s.id === currentSkinId ? "current" : ""}`} 
                        style={{ "--rarity": s.rarity } as React.CSSProperties}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, skin: s });
                        }}
                      >
                        <button className="inv4-skin-pick" onClick={() => equipSkin(s)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s.image} alt={s.name} loading="lazy" />
                          <span className="inv4-skin-name">{skinLabel(s.name)}</span>
                          <span className="inv4-skin-rarity">{rarityName(s.rarity)}</span>
                          <span className="inv4-skin-equip">{t("auto.inventorysimulator.equip")}</span>
                        </button>
                        <button
                          className={`inv4-heart ${fav ? "on" : ""}`}
                          title={fav ? "Remove from favorites" : "Add to favorites"}
                          aria-label={fav ? `Unfavorite ${skinLabel(s.name)}` : `Favorite ${skinLabel(s.name)}`}
                          onClick={() => toggleFavorite(s.def, s.paint)}
                        >
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
      </div>

      {/* ===== Share panel ===== */}
      {share && (
        <div className="inv4-modal" role="dialog" aria-modal="true" aria-labelledby="inv-share-title" onClick={() => setShare(null)}>
          <div className="inv4-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 id="inv-share-title">{t("auto.inventorysimulator.share")}{share.name}”</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              {t("auto.inventorysimulator.anyone_with_this_key_can_borro")}
                                      </p>

            <div className="inv4-share-key num">{share.key}</div>

            <div className="inv4-share-rows">
              <div className="inv4-share-row">
                <span className="inv4-share-label">{t("auto.inventorysimulator.link")}</span>
                <code className="skin-path">{borrowUrl}</code>
                <button className="btn btn-secondary" onClick={() => copy(borrowUrl, "link")}>
                  {copied === "link" ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="inv4-share-row">
                <span className="inv4-share-label">{t("auto.inventorysimulator.in_game")}</span>
                <code className="skin-path">{t("auto.inventorysimulator._borrow")} {share.key}</code>
                <button className="btn btn-secondary" onClick={() => copy(`/borrow ${share.key}`, "cmd")}>
                  {copied === "cmd" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-4)" }}>
              <button className="btn btn-primary" onClick={() => setShare(null)}>{t("auto.inventorysimulator.done")}</button>
            </div>
          </div>
        </div>
      )}

      {hydrated && !session.authenticated && (
        <div className="inv4-guest">
          {t("auto.inventorysimulator.guest_saved_on_this_device")} <a href="/api/auth/steam/login">{t("auto.inventorysimulator.sign_in")}</a> {t("auto.inventorysimulator.to_sync_in_game")}
                          </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {editor3dOpen && weapon && (
        <SkinEditor3D 
          skinId={currentSkinId || weapon.id}
          wear={wear}
          seed={seed}
          statTrak={statTrak}
          nameTag={nameTag}
          initialStickers={stickers}
          onSave={(newStickers) => {
            setStickers(newStickers);
            setEditor3dOpen(false);
          }}
          onClose={() => setEditor3dOpen(false)}
        />
      )}
      
      {contextMenu && (
        <div 
          className="inv4-context"
          style={{ 
            left: contextMenu.x + 4, 
            top: contextMenu.y + 4 
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="inv4-context-title" style={{ color: contextMenu.skin.rarity }}>
            {weapon ? `${weapon.name} | ` : ""}{skinLabel(contextMenu.skin.name)}
          </div>
          {supportsStickers && (
            <button className="inv4-context-btn" onClick={() => { equipSkin(contextMenu.skin, side, true); setEditor3dOpen(true); }}>
              3D Edit
            </button>
          )}
          <button className="inv4-context-btn" onClick={() => equipSkin(contextMenu.skin, "t")}>
            Equip T
          </button>
          <button className="inv4-context-btn" onClick={() => equipSkin(contextMenu.skin, "ct")}>
            Equip CT
          </button>
          <button className="inv4-context-btn" onClick={() => equipSkin(contextMenu.skin, "both")}>
            Equip Both
          </button>
        </div>
      )}
    </div>
  );
}
