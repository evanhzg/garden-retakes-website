"use client";

import { createPortal } from "react-dom";
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
import agentAudioMapping from "@/lib/agent_audio_mapping.json";
import agentVoicesV2 from "@/data/agent_voices_v2.json";

type WeaponEntry = {
  id: number;
  def: number;
  name: string;
  model: string;
  image: string;
  category: string;
  team: Team;
  rarity?: string;
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

const CATEGORY_ORDER = ["Rifles", "Snipers", "SMGs", "Pistols", "Heavy", "Knives", "Gloves", "Agents"];
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
  if (category === "Agents") return "agent";
  if (category === "Patches") return "patch";
  return "weapon";
}

const RADIO_COMMANDS = [
  { label: "Go Go Go", key: "go" }, 
  { label: "Fall Back", key: "fallback" }, 
  { label: "Stick Together", key: "stick_together" }, 
  { label: "Hold This Position", key: "hold" },
  { label: "Follow Me", key: "follow_me" }, 
  { label: "Affirmative", key: "agree" }, 
  { label: "Negative", key: "negative" }, 
  { label: "Cheer", key: "cheer" }, 
  { label: "Compliment", key: "compliment" },
  { label: "Thanks", key: "thanks" }, 
  { label: "Enemy Spotted", key: "spotted" }, 
  { label: "Need Backup", key: "coverme" }, 
  { label: "Take the Point", key: "point" },
  { label: "Sector Clear", key: "clear" }, 
  { label: "I'm in Position", key: "position" },
  { label: "Report In", key: "report_in" },
  { label: "Reporting In", key: "reporting_in" },
  { label: "Get in Position", key: "get_in_position" },
  { label: "Regroup", key: "regroup" },
  { label: "Sniper Warning", key: "sniper_warning" },
  { label: "Bomb Planted", key: "bomb_planted" },
  { label: "Lost Round", key: "lost" },
  { label: "Won Round", key: "won" }
];

function RadioCommandsModal({ weapon, onClose }: { weapon: WeaponEntry, onClose: () => void }) {
  const factionId = (agentAudioMapping as any)[weapon.id.toString()];
  const voices = factionId ? (agentVoicesV2 as any)[factionId]?.sounds || [] : [];
  
  const [playIndexes, setPlayIndexes] = useState<Record<string, number>>({});
  
  // Hide scrollbar but allow scrolling
  return createPortal(
    <div className="inv4-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="inv4-modal-card" style={{ maxWidth: 800, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Radio Commands - {weapon.name}</h2>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px', margin: '0 -4px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {RADIO_COMMANDS.map(cmd => {
              const variants = voices.filter((v: string) => v.includes(`_${cmd.key}_`) || v.includes(`${cmd.key}_`)).sort();
              const count = variants.length;
              const idx = playIndexes[cmd.key] || 0;
              const currentVariant = variants.length > 0 ? variants[idx % variants.length] : null;
              const src = currentVariant ? `/audio/agents/${factionId}/${currentVariant}` : null;
              
              return (
                <button
                  key={cmd.key}
                  disabled={!src}
                  onClick={() => {
                    if (src) {
                      new Audio(src).play().catch(() => {});
                      setPlayIndexes(prev => ({ ...prev, [cmd.key]: (prev[cmd.key] || 0) + 1 }));
                    }
                  }}
                  style={{
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    background: src ? "var(--color-surface)" : "transparent",
                    opacity: src ? 1 : 0.4,
                    cursor: src ? "pointer" : "not-allowed",
                    color: "var(--fg)",
                    fontSize: "12px",
                    fontWeight: 500,
                    transition: "all 0.2s"
                  }}
                  onMouseOver={e => { if (src) e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                  onMouseOut={e => { if (src) e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  {cmd.label} {count > 1 ? `(${idx % count + 1}/${count})` : (count === 1 ? '(1/1)' : '')}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
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
  const [chooserTab, setChooserTab] = useState<"catalog" | "inventory">("catalog");
  const [skins, setSkins] = useState<Skin[]>([]);
  const [overrideSide, setOverrideSide] = useState<"t" | "ct" | "both" | null>(null);
  const [skinsLoading, setSkinsLoading] = useState(false);

  // Skin chooser filters
  const [skinSearch, setSkinSearch] = useState("");
  const [skinSort, setSkinSort] = useState<SkinSort>("quality");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [favOnly, setFavOnly] = useState(false);

  const [radioModalOpen, setRadioModalOpen] = useState<WeaponEntry | null>(null);
  // Config for the slot being edited
  const [wear, setWear] = useState(0.02);
  const [seed, setSeed] = useState(1);
  const [statTrak, setStatTrak] = useState(false);
  const [nameTag, setNameTag] = useState("");
  const [stickers, setStickers] = useState<(PlacedSticker | null)[]>(defaultStickerSlots());
  const [charm, setCharm] = useState<PlacedSticker | null>(null);
  const [editor3dOpen, setEditor3dOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; skin: Skin; weapon: WeaponEntry; side: "t" | "ct"; boardSlot?: BoardSlot } | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedSkins, setSelectedSkins] = useState<Set<number>>(new Set());

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".inv4-context")) return;
      setContextMenu(null);
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);
  const [stickerQuery, setStickerQuery] = useState("Katowice 2014");
  const [stickerResults, setStickerResults] = useState<StickerOption[]>([]);
  const [stickersLoading, setStickersLoading] = useState(false);
  const [vaultCatsCollapsed, setVaultCatsCollapsed] = useState<Record<string, boolean>>({});

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
  const supportsStickers = builderKind === "weapon" || builderKind === "agent";
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
    if (!editor3dOpen && builderKind !== "agent") return; // Allow patches to be picked even without 3D editor if that's how it's handled, but actually keep it true to the original logic
    // Actually, wait, let me just restore the original logic exactly but with kind support
    if (!editor3dOpen && builderKind !== "agent" && !weapon) return; // ensure something is open
    const searchKind = builderKind === "agent" ? "patch" : "sticker";
    const h = window.setTimeout(() => {
      setStickersLoading(true);
      fetch(`/api/stickers?q=${encodeURIComponent(stickerQuery)}&kind=${searchKind}`)
        .then((r) => r.json())
        .then((d: StickerOption[]) => setStickerResults(Array.isArray(d) ? d : []))
        .catch(() => setStickerResults([]))
        .finally(() => setStickersLoading(false));
    }, 350);
    return () => window.clearTimeout(h);
  }, [stickerQuery, editor3dOpen, builderKind, weapon]);

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
        setWear(existing.wear ?? 0.0);
        setSeed(existing.seed ?? 0);
        setStatTrak(existing.statTrak ?? false);
        setNameTag(existing.nameTag ?? "");
        setStickers(existing.stickers?.length ? [...existing.stickers] : defaultStickerSlots());
        setCharm(existing.charm || null);
      } else {
        setWear(0.0);
        setSeed(0);
        setStatTrak(false);
        setNameTag("");
        setStickers(defaultStickerSlots());
        setCharm(null);
      }
    },
    [side, slotItemForChooser, writeUrl]
  );

  const closeChooser = useCallback(() => {
    setWeapon(null);
    setSkinSearch("");
    setSkins([]);
    setOverrideSide(null);
    setChooserTab("catalog");
    setCharm(null);
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
    return Array.from(groups.entries()).sort(
      (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0])
    );
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
  const equipSkin = (skin: Skin, overrideSide?: "t" | "ct" | "both", preventClose?: boolean, explicitWeapon?: WeaponEntry, onlyVault?: boolean) => {
    const targetWeapon = explicitWeapon || weapon;
    if (!targetWeapon) return;
    const kind = kindOfCategory(targetWeapon.category);
    const targetSidesRaw = overrideSide === "both" ? ["t" as const, "ct" as const] : [overrideSide || side];
    const targetSides = targetSidesRaw.filter(s => targetWeapon.team === "both" || targetWeapon.team === s);
    if (targetSides.length === 0) {
      showToast("This item cannot be equipped on this team");
      return;
    }
    
    setStore((cur) => {
      const loadout = cur.loadouts.find((l) => l.id === cur.activeLoadoutId);
      if (!loadout) return cur;
      let nextUid = cur.nextUid;
      let newItems = [...cur.items];
      let newLoadout = { ...loadout, equippedCT: { ...loadout.equippedCT }, equippedT: { ...loadout.equippedT } };

      for (const s of targetSides) {
        const existing = slotItemForChooser(targetWeapon.def, kind, s, newLoadout);
        const payload = {
          kind,
          weaponDef: targetWeapon.def,
          weaponName: targetWeapon.name,
          team: targetWeapon.team,
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
          charm: supportsStickers ? charm : null,
        };
        
        let itemId: string;
        const identical = cur.items.find(i => 
          i.weaponDef === payload.weaponDef &&
          i.skinId === payload.skinId &&
          i.wear === payload.wear &&
          i.seed === payload.seed &&
          i.statTrak === payload.statTrak &&
          i.nameTag === payload.nameTag &&
          JSON.stringify(i.stickers) === JSON.stringify(payload.stickers) &&
          JSON.stringify(i.charm) === JSON.stringify(payload.charm)
        );

        if (identical) {
          itemId = identical.id;
        } else {
          itemId = newId();
          newItems = [{ id: itemId, uid: nextUid, createdAt: Date.now(), ...payload }, ...newItems];
          nextUid += 1;
        }

        if (!onlyVault) {
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
            if (s === "t") newLoadout.equippedT[targetWeapon.def] = itemId;
            else newLoadout.equippedCT[targetWeapon.def] = itemId;
          }
        }
      }
      
      const loadouts = cur.loadouts.map(l => l.id === newLoadout.id ? newLoadout : l);
      return { ...cur, items: newItems, loadouts, nextUid };
    });
    
    showToast(onlyVault ? `Added ${skinLabel(skin.name)} to Vault` : `Equipped ${skinLabel(skin.name)}`);
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
      return { ...cur, loadouts };
    });
  };

  /** Drop items no loadout references, to avoid orphan bloat. */
  const pruneItems = (s: InventoryStore): InventoryStore => {
    return s;
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
  const toggleFavoriteLoadout = (l: Loadout) => {
    setStore((c) => ({ ...c, loadouts: c.loadouts.map((x) => (x.id === l.id ? { ...x, favorite: !x.favorite } : x)) }));
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

  const sortedLoadouts = useMemo(() => {
    return [...store.loadouts].sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      const aDate = a.createdAt ?? 0;
      const bDate = b.createdAt ?? 0;
      return aDate - bDate; // Ascending by date created
    });
  }, [store.loadouts]);

  const visibleLoadouts = sortedLoadouts.slice(0, 4);
  const overflowLoadouts = sortedLoadouts.slice(4);

  const renderContext = (id: string) => {
    if (!contextMenu || contextMenu.id !== id || !mounted) return null;
    return (
      <div 
        className="inv4-context"
        style={{ 
          position: "absolute",
          right: 0, 
          bottom: 0,
          transform: "translateX(102%)",
          zIndex: 100
        }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="inv4-context-title" style={{ color: contextMenu.skin.rarity, paddingBottom: '8px', borderBottom: '1px solid var(--color-divider)' }}>
          {contextMenu.weapon.name} | {skinLabel(contextMenu.skin.name)}
        </div>
        {contextMenu.weapon.category !== "Agents" && (
          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid var(--color-divider)' }}>
            <label style={{ fontSize: '12px', display: 'flex', flexDirection: 'column' }}>
              Wear <strong>{wear.toFixed(3)}</strong>
              <input type="range" min={0} max={1} step={0.001} style={{ width: '100%' }} value={wear} onChange={(e) => setWear(Number(e.target.value))} />
            </label>
            <label style={{ fontSize: '12px', display: 'flex', flexDirection: 'column' }}>
              Pattern
              <input className="input" type="number" min={0} max={1000} style={{ width: '100%', padding: '2px 4px' }} value={seed} onChange={(e) => setSeed(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))} />
            </label>
          </div>
        )}
        {supportsStickers && (
          <button className="inv4-context-btn" onClick={() => {
            if (contextMenu.boardSlot) {
              openBoardSlot(contextMenu.boardSlot, contextMenu.side);
            } else {
              equipSkin(contextMenu.skin, contextMenu.side, true, contextMenu.weapon);
            }
            setEditor3dOpen(true);
            setContextMenu(null);
          }}>
            Edit (3D)
          </button>
        )}
        {contextMenu.weapon.category === "Agents" && (
          <button className="inv4-context-btn" onClick={() => {
            setRadioModalOpen(contextMenu.weapon);
            setContextMenu(null);
          }}>
            Radio Commands
          </button>
        )}
        {(contextMenu.weapon.team === "both" || contextMenu.weapon.team === "t") && (
          <button className="inv4-context-btn" onClick={() => { equipSkin(contextMenu.skin, "t", false, contextMenu.weapon); setContextMenu(null); }}>
            Equip (T)
          </button>
        )}
        {(contextMenu.weapon.team === "both" || contextMenu.weapon.team === "ct") && (
          <button className="inv4-context-btn" onClick={() => { equipSkin(contextMenu.skin, "ct", false, contextMenu.weapon); setContextMenu(null); }}>
            Equip (CT)
          </button>
        )}
        {contextMenu.weapon.team === "both" && (
          <button className="inv4-context-btn" onClick={() => { equipSkin(contextMenu.skin, "both", false, contextMenu.weapon); setContextMenu(null); }}>
            Equip (Both)
          </button>
        )}
        <button className="inv4-context-btn" onClick={() => {
          equipSkin(contextMenu.skin, contextMenu.weapon.team === "ct" ? "ct" : "t", true, contextMenu.weapon, true);
          setContextMenu(null);
        }}>
          Add to Vault
        </button>
      </div>
    );
  };

  // ---------- Render ----------
  return (
    <div className="inv4">
      {/* ===== Header: which loadout, how full, and what to do with it ===== */}
      <header className="inv4-bar">
        <div className="inv4-loadouts" role="tablist" aria-label={t("auto.inventorysimulator.loadouts")}>
          {visibleLoadouts.map((l, idx) => (
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
              {l.favorite ? '★ ' : ''}{l.name}
              <span className="inv4-lo-count">{loadoutSize(l)}</span>
            </button>
          ))}
          {overflowLoadouts.length > 0 && (
            <div className="inv4-lo-dropdown">
              <select className="inv4-lo-select" value={overflowLoadouts.find(l => l.id === store.activeLoadoutId) ? store.activeLoadoutId : ""} onChange={(e) => { if (e.target.value) setActiveLoadout(e.target.value); }}>
                <option value="" disabled>+{overflowLoadouts.length} More...</option>
                {overflowLoadouts.map(l => (
                  <option key={l.id} value={l.id}>{l.favorite ? '★ ' : ''}{l.name} ({loadoutSize(l)})</option>
                ))}
              </select>
            </div>
          )}
          <button className="btn btn-secondary inv4-lo-new" onClick={addLoadout} title={t("auto.inventorysimulator.new_loadout")}>
            {t("auto.inventorysimulator._new")}
                                </button>
          <button className="btn btn-secondary inv4-lo-new" onClick={() => {
            const url = window.prompt("Paste inventory.cstrike.app link or data:");
            if (url) importCstrike(url);
          }} title="Import from inventory.cstrike.app">
            Import CStrike
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

          <button
            className={`btn ${chooserTab === 'inventory' ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              if (chooserTab !== 'inventory') {
                setChooserTab('inventory');
                setWeapon(catalog ? catalog["Rifles"][0] : null); // Open chooser implicitly if not open
              } else {
                setChooserTab('catalog');
                closeChooser();
              }
            }}
          >
            Vault
          </button>

          <button className="btn btn-secondary" disabled={shareBusy || !activeLoadout} onClick={() => activeLoadout && shareLoadout(activeLoadout)}>
            {t("common.share")}
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
              placeholder="Borrow key or cstrike.app link"
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
                <button className={`btn btn-ghost ${activeLoadout.favorite ? 'on' : ''}`} title="Favorite" onClick={() => toggleFavoriteLoadout(activeLoadout)}>
                  {activeLoadout.favorite ? '★' : '☆'}
                </button>
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
                {(boardGroups.find(([g]) => g === openBoardType)?.[1] ?? []).map((slot) => {
                  const handleSlotContextMenu = (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!slot.item || !catalog) return;
                    const w = Object.values(catalog).flat().find((x) => x.def === slot.item!.weaponDef);
                    if (!w) return;
                    const itemSkin: Skin = {
                      id: slot.item.skinId,
                      def: slot.item.weaponDef,
                      paint: slot.item.paint,
                      name: slot.item.skinName,
                      image: slot.item.image,
                      rarity: slot.item.rarity || "default"
                    };
                    setContextMenu({ id: `board-${slot.key}`, skin: itemSkin, weapon: w, side, boardSlot: slot });
                  };
                  return (
                  <li key={slot.key} style={{ position: 'relative' }}>
                    <button
                      className={`inv4-slot ${slot.item ? "filled" : "empty"}`}
                      onClick={() => openBoardSlot(slot, side)}
                      onContextMenu={handleSlotContextMenu}
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
                    {renderContext(`board-${slot.key}`)}
                  </li>
                )})}
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
                {CATEGORY_ORDER.filter((c) => catalog[c]?.length).map((c) => {
                  const isSingleSlot = c === "Agents" || c === "Knives" || c === "Gloves" || c === "Patches" || c === "Charms";
                  const kind = kindOfCategory(c);
                  const weaponsToRender = isSingleSlot 
                    ? (() => {
                        const equippedItem = slotItemFor(catalog[c][0].def, kind, side); // The def doesn't matter for these kinds in slotItemFor
                        if (equippedItem) {
                          const w = catalog[c].find(x => x.def === equippedItem.weaponDef) || catalog[c][0];
                          return [w];
                        }
                        return [catalog[c][0]]; // Return a placeholder (e.g., first item) if none equipped, but we'll show it as unequipped
                      })()
                    : catalog[c];
                  
                  return (
                  <section key={c} className="inv4-preview-group">
                    <h3 className="inv4-preview-title">{c}</h3>
                    <div className="inv4-preview-row">
                      {weaponsToRender.map((w) => {
                        const item = slotItemFor(w.def, kind, side);
                        return (
                          <button
                            key={w.def}
                            className={`inv4-preview-cell ${item ? "has-skin" : ""}`}
                            style={item?.rarity ? ({ "--rarity": item.rarity } as React.CSSProperties) : undefined}
                            onClick={() => {
                              setPreviewMode(false);
                              if (isSingleSlot) chooseCategory(c); else openWeapon(w);
                            }}
                            title={item ? item.skinName : `${isSingleSlot ? c : w.name} — no skin`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item?.image ?? w.image} alt={w.name} loading="lazy" />
                            <span className="inv4-preview-name">{isSingleSlot && !item ? c : w.name}</span>
                            <span className="inv4-preview-skin">{item ? skinLabel(item.skinName) : "—"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )})}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        if (w.category === "Agents") {
                          const itemSkin: Skin = {
                            id: w.id,
                            def: w.id,
                            paint: 0,
                            name: w.name,
                            image: w.image,
                            rarity: w.rarity || "default"
                          };
                          setContextMenu({ id: `weapon-${w.def}`, skin: itemSkin, weapon: w, side });
                          return;
                        }
                        setPreviewMode(false);
                        openWeapon(w);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!item) return;
                        const itemSkin: Skin = {
                          id: item.skinId,
                          def: item.weaponDef,
                          paint: item.paint,
                          name: item.skinName,
                          image: item.image,
                          rarity: item.rarity || "default"
                        };
                        setContextMenu({ id: `weapon-${w.def}`, skin: itemSkin, weapon: w, side });
                      }}
                      style={(item?.rarity || w.rarity) ? ({ "--rarity": item?.rarity || w.rarity, position: "relative" } as React.CSSProperties) : { position: "relative" }}
                    >
                      <div className="inv4-weapon-img">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item?.image ?? w.image} alt={w.name} loading="lazy" />
                      </div>
                      <div className="inv4-weapon-name">{w.name}</div>
                      <div className="inv4-weapon-skin">{item ? skinLabel(item.skinName) : "Default"}</div>
                      {renderContext(`weapon-${w.def}`)}
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
                  <button className={`chip ${chooserTab === 'catalog' ? 'active' : ''}`} onClick={() => setChooserTab('catalog')}>
                    Catalog
                  </button>
                  <button className={`chip ${chooserTab === 'inventory' ? 'active' : ''}`} onClick={() => setChooserTab('inventory')}>
                    My Crafts
                  </button>

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

              {chooserTab === 'catalog' ? (
                <>
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
                    <button className="btn btn-secondary" style={{ marginLeft: 'auto', padding: '4px 8px', fontSize: '12px' }} disabled={selectedSkins.size === 0} onClick={() => {
                       selectedSkins.forEach(id => {
                         const skin = skins.find(s => s.id === id);
                         if (skin && weapon) equipSkin(skin, weapon.team === "ct" ? "ct" : "t", true, weapon, true);
                       });
                       setSelectedSkins(new Set());
                    }}>Add to Vault ({selectedSkins.size})</button>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} disabled={selectedSkins.size === 0} onClick={() => {
                       setStore(cur => {
                          const set = new Set(cur.favorites ?? []);
                          selectedSkins.forEach(id => {
                            const skin = skins.find(s => s.id === id);
                            if (skin) set.add(skinKey(skin.def, skin.paint));
                          });
                          return { ...cur, favorites: Array.from(set) };
                       });
                       setSelectedSkins(new Set());
                    }}>Fav Selected ({selectedSkins.size})</button>
                  </div>

                  <div className="inv4-config" style={{ display: 'none' }}>
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
                            style={{ "--rarity": s.rarity, position: "relative" } as React.CSSProperties}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({ id: `skin-${s.id}`, skin: s, weapon: weapon!, side });
                            }}
                          >
                            <input type="checkbox" style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }} checked={selectedSkins.has(s.id)} onChange={(e) => {
                              const n = new Set(selectedSkins);
                              if (e.target.checked) n.add(s.id); else n.delete(s.id);
                              setSelectedSkins(n);
                            }} />
                            <button className="inv4-skin-pick" onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({ id: `skin-${s.id}`, skin: s, weapon: weapon!, side });
                            }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={s.image} alt={s.name} loading="lazy" />
                              <span className="inv4-skin-name">{skinLabel(s.name)}</span>
                              <span className="inv4-skin-rarity">{rarityName(s.rarity)}</span>
                              <span className="inv4-skin-equip">Options</span>
                            </button>
                            <button
                              className={`inv4-heart ${fav ? "on" : ""}`}
                              title={fav ? "Remove from favorites" : "Add to favorites"}
                              aria-label={fav ? `Unfavorite ${skinLabel(s.name)}` : `Favorite ${skinLabel(s.name)}`}
                              onClick={() => toggleFavorite(s.def, s.paint)}
                            >
                              {fav ? "♥" : "♡"}
                            </button>
                            {renderContext(`skin-${s.id}`)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ padding: '0 0 12px 0', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="btn btn-secondary" disabled={selectedItems.size === 0} onClick={() => {
                      setStore(cur => ({ ...cur, items: cur.items.filter(i => !selectedItems.has(i.id)) }));
                      setSelectedItems(new Set());
                    }}>Delete Selected ({selectedItems.size})</button>
                    <button className="btn btn-primary" disabled={selectedItems.size === 0} onClick={() => {
                      const items = store.items.filter(i => selectedItems.has(i.id));
                      const defs = new Set(items.map(i => i.weaponDef));
                      if (defs.size !== items.length) {
                        showToast("Cannot equip multiple of the same weapon");
                        return;
                      }
                      setStore(cur => {
                        const loadout = cur.loadouts.find(l => l.id === cur.activeLoadoutId);
                        if (!loadout) return cur;
                        let newLoadout = { ...loadout, equippedCT: { ...loadout.equippedCT }, equippedT: { ...loadout.equippedT } };
                        items.forEach(item => {
                          const kind = item.kind;
                          const targetSides = (overrideSide === "both" ? ["t" as const, "ct" as const] : [overrideSide || side]).filter(s => item.team === "both" || item.team === s);
                          for (const s of targetSides) {
                            if (kind === "knife") { if (s === "t") newLoadout.knifeT = item.id; else newLoadout.knifeCT = item.id; }
                            else if (kind === "gloves") { if (s === "t") newLoadout.glovesT = item.id; else newLoadout.glovesCT = item.id; }
                            else if (kind === "agent") { if (s === "t") newLoadout.agentT = item.id; else newLoadout.agentCT = item.id; }
                            else { if (s === "t") newLoadout.equippedT[item.weaponDef] = item.id; else newLoadout.equippedCT[item.weaponDef] = item.id; }
                          }
                        });
                        return { ...cur, loadouts: cur.loadouts.map(l => l.id === newLoadout.id ? newLoadout : l) };
                      });
                      setSelectedItems(new Set());
                      showToast("Equipped selected items");
                    }}>Equip Selected ({selectedItems.size})</button>
                    <button className="btn btn-ghost" onClick={() => {
                      if (selectedItems.size === store.items.length) setSelectedItems(new Set());
                      else setSelectedItems(new Set(store.items.map(i => i.id)));
                    }}>Select All</button>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                    {(() => {
                      const loadout = store.loadouts.find(l => l.id === store.activeLoadoutId);
                      const equipped = new Set<string>();
                      if (loadout) {
                        if (loadout.knifeCT) equipped.add(loadout.knifeCT);
                        if (loadout.knifeT) equipped.add(loadout.knifeT);
                        if (loadout.glovesCT) equipped.add(loadout.glovesCT);
                        if (loadout.glovesT) equipped.add(loadout.glovesT);
                        if (loadout.agentCT) equipped.add(loadout.agentCT);
                        if (loadout.agentT) equipped.add(loadout.agentT);
                        Object.values(loadout.equippedCT ?? {}).forEach(id => equipped.add(id as string));
                        Object.values(loadout.equippedT ?? {}).forEach(id => equipped.add(id as string));
                      }
                      
                      const eq: InventoryItem[] = [];
                      const imp: InventoryItem[] = [];
                      const oth: InventoryItem[] = [];
                      
                      store.items.forEach(item => {
                        if (equipped.has(item.id)) {
                          eq.push(item);
                        } else if (item.source === 'cstrike') {
                          imp.push(item);
                        } else {
                          oth.push(item);
                        }
                      });

                      const renderCat = (title: string, itemsList: InventoryItem[], key: string) => {
                        if (itemsList.length === 0) return null;
                        const collapsed = vaultCatsCollapsed[key];
                        return (
                          <div key={key} style={{ marginBottom: '16px' }}>
                            <button 
                              onClick={() => setVaultCatsCollapsed(c => ({...c, [key]: !collapsed}))}
                              style={{ width: '100%', textAlign: 'left', padding: '8px 0', borderBottom: '1px solid var(--color-divider)', background: 'none', border: 'none', color: 'var(--color-text)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', outline: 'none' }}
                            >
                              <span>{title} ({itemsList.length})</span>
                              <span style={{ fontSize: '10px', transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
                            </button>
                            <div className="inv4-skins" style={{ 
                              display: collapsed ? 'none' : 'grid',
                              paddingTop: '12px'
                            }}>
                              {itemsList.map(item => (
                                <div 
                                  key={item.id}
                                  className={`inv4-skin ${equipped.has(item.id) ? "current" : ""}`}
                                  style={{ "--rarity": item.rarity, position: "relative" } as React.CSSProperties}
                                >
                                  <input type="checkbox" style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }} checked={selectedItems.has(item.id)} onChange={(e) => {
                                    const n = new Set(selectedItems);
                                    if (e.target.checked) n.add(item.id); else n.delete(item.id);
                                    setSelectedItems(n);
                                  }} />
                                  <button className="inv4-skin-pick" onClick={(e) => {
                                     const n = new Set(selectedItems);
                                     if (n.has(item.id)) n.delete(item.id); else n.add(item.id);
                                     setSelectedItems(n);
                                  }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={item.image} alt={item.skinName} loading="lazy" />
                                    <div style={{ position: 'absolute', bottom: 4, right: 4, display: 'flex', gap: 2, zIndex: 5, background: 'rgba(0,0,0,0.5)', padding: 2, borderRadius: 4 }}>
                                      {item.stickers?.filter(s => s).slice(0,6).map((st, i) => (
                                        <img key={i} src={st!.image} style={{ width: 16, height: 16 }} alt="" />
                                      ))}
                                      {item.charm && <img src={item.charm.image} style={{ width: 16, height: 16 }} alt="" />}
                                    </div>
                                    <span className="inv4-skin-name">{skinLabel(item.skinName)}</span>
                                    <span className="inv4-skin-rarity">{item.nameTag ? `"${item.nameTag}"` : rarityName(item.rarity || 'default')}</span>
                                    <span className="inv4-skin-equip">Select</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      };

                      return (
                        <>
                          {renderCat("Equipped", eq, "equipped")}
                          {renderCat("Imported", imp, "imported")}
                          {renderCat("Vault", oth, "other")}
                          {store.items.length === 0 && (
                            <p className="empty-hint">You have no crafted skins in your Vault.</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
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
                <code className="skin-path">/borrow {share.key}</code>
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
          itemKind={weapon.category === "Agents" ? "agent" : "weapon"}
          skinId={currentSkinId || weapon.id}
          wear={wear}
          seed={seed}
          statTrak={statTrak}
          nameTag={nameTag}
          initialStickers={stickers}
          initialCharm={charm}
          onSave={(newStickers, newCharm) => {
            setStickers(newStickers);
            setCharm(newCharm);
            setEditor3dOpen(false);
          }}
          onClose={() => setEditor3dOpen(false)}
        />
      )}
      
      {radioModalOpen && (
        <RadioCommandsModal 
          weapon={radioModalOpen} 
          onClose={() => setRadioModalOpen(null)} 
        />
      )}
    </div>
  );
}
