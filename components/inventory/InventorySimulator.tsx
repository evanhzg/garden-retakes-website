"use client";

/*
 * The inventory workspace.
 *
 * Three columns, each answering one question:
 *
 *   Loadouts   — which set am I editing?          (list, always visible)
 *   Board      — what does it look like, both sides at once?
 *   Armory     — what can I put in a slot?        (opens beside the board)
 *
 * The previous page asked all three through tabs: a strip of four loadout tabs
 * plus an overflow panel, a nine-row type rail that showed one side's slots for
 * one type at a time, a Catalog / My Crafts switch inside the skin drawer, and
 * a breadcrumb that duplicated the rail. Seeing a whole loadout meant clicking
 * through nine types twice. Here the board is the loadout — T and CT side by
 * side — and every tile on it is a link into the armory for that slot.
 *
 * The armory is one scroll with a jump bar rather than a set of tabs: every
 * type is on the page, the chips just move you through it. Picking a weapon
 * opens its skins in place; Back returns to the exact scroll position.
 */

import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Dices,
  Download,
  Ellipsis,
  Gamepad2,
  GripVertical,
  Heart,
  Link as LinkIcon,
  LoaderCircle,
  Music,
  Pencil,
  Plus,
  Radio,
  Search,
  Share2,
  Shuffle,
  Sparkles,
  Star,
  Sticker,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
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
  Side,
  TOTAL_SIGNATURE_SLOTS,
  Team,
  charmSeed,
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
import { useI18n } from "@/components/I18nProvider";
import InventoryIcon, { categoryIconId } from "@/components/inventory/InventoryIcon";
import RadioCommandsModal from "@/components/inventory/RadioCommandsModal";
import { importSnapshot, type LoadoutSnapshot } from "@/lib/share";

// Loaded on demand, and never on the server.
//
// This is what /inventory had been 500ing on. The editor pulls in the 3D
// viewer, which pulls in @ianlucas/cs2-lib for its `instanceof` checks, and
// that chain would not build into the page's client chunk on a COLD compile —
// so the client reference for this whole page resolved to `undefined` and React
// reported "Element type is invalid ... got: undefined" from a stack that names
// none of it. Warm rebuilds succeeded, which is why it looked fine in dev after
// any edit and died on every restart and every deploy.
const SkinEditor3D = dynamic(() => import("./SkinEditor3D"), { ssr: false });

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
type Catalog = Record<string, WeaponEntry[]>;
type Session = { authenticated: boolean; steamId?: string; name?: string | null; avatar?: string | null; adminLevel?: number };
type SkinSort = "name" | "quality" | "newest" | "fav";
type SlotKind = Exclude<ItemKind, "patch" | "charm">;

/**
 * GET /api/stattrak — this season's counters.
 *
 * `itemKills` is keyed by the item's plugin uid, as a string, because that is
 * what JSON object keys are. Only items with at least one kill appear.
 */
type SeasonStats = {
  season: string | null;
  seasonId: number | null;
  seasonKills: number;
  itemKills: Record<string, number>;
};

/** One tile on the board. */
type BoardSlot = {
  key: string;
  def: number;
  kind: SlotKind;
  label: string;
  item?: InventoryItem;
  /** The CT rifle tile, which toggles between M4A4 and M4A1-S. */
  m4?: boolean;
  /** Outside the signature set — appended so nothing equipped is hidden. */
  extra?: boolean;
};

/** What the item menu is pointed at: an owned item, or a catalog skin not yet crafted. */
type MenuTarget = {
  skin: Skin;
  weapon: WeaponEntry;
  side: Side;
  item?: InventoryItem;
  x: number;
  y: number;
};

const CATEGORY_ORDER = ["Rifles", "Snipers", "SMGs", "Pistols", "Heavy", "Knives", "Gloves", "Agents", "Music Kits"];
const SIDES: Side[] = ["t", "ct"];

/**
 * The weapon each type is drawn as, in the jump bar and section headings.
 *
 * The glyph is the catalog's own render used as a mask, so it is a real
 * silhouette in whatever colour the chip is — not a hand-drawn approximation,
 * and not a copy of Valve's art in this repo. The CDN serves it with an open
 * CORS header, which a CSS mask needs.
 */
const GLYPH_DEF: Record<string, number> = {
  Rifles: 7,
  Snipers: 9,
  SMGs: 34,
  Pistols: 1,
  Heavy: 35,
  Knives: 507,
  Gloves: 5030,
};

/** Types with one slot per side, rather than one per weapon. */
const SINGLE_SLOT = new Set(["Knives", "Gloves", "Agents", "Music Kits"]);

/** Sections longer than this start folded; the jump bar and search unfold them. */
const SECTION_PREVIEW = 18;

function wearLabel(wear: number): string {
  if (wear < 0.07) return "Factory New";
  if (wear < 0.15) return "Minimal Wear";
  if (wear < 0.38) return "Field-Tested";
  if (wear < 0.45) return "Well-Worn";
  return "Battle-Scarred";
}
const wearShort = (wear: number) =>
  wearLabel(wear).split(/[\s-]/).map((w) => w[0]).join("").toUpperCase();
const WEAR_STOPS = [
  { at: 0, label: "FN" },
  { at: 0.07, label: "MW" },
  { at: 0.15, label: "FT" },
  { at: 0.38, label: "WW" },
  { at: 0.45, label: "BS" },
];

const skinLabel = (name: string) => name.split(" | ")[1] ?? name;

/**
 * Stand-in art for a side with no agent chosen.
 *
 * The game's default T and CT models (item defs 5036 and 5037) are not
 * tradeable, so they are not in the item catalog and have no CDN image. An
 * unset agent is still somebody in game, so the slot shows a body, not a hole.
 */
const DEFAULT_AGENT_ART = "/default_character.PNG";

function kindOfCategory(category: string): SlotKind {
  if (category === "Knives") return "knife";
  if (category === "Gloves") return "gloves";
  if (category === "Agents") return "agent";
  if (category === "Music Kits") return "musickit";
  return "weapon";
}

function categoryOfKind(kind: SlotKind): string | null {
  if (kind === "knife") return "Knives";
  if (kind === "gloves") return "Gloves";
  if (kind === "agent") return "Agents";
  if (kind === "musickit") return "Music Kits";
  return null;
}

const SINGLE_FIELD: Record<Exclude<SlotKind, "weapon">, Record<Side, keyof Loadout>> = {
  knife: { t: "knifeT", ct: "knifeCT" },
  gloves: { t: "glovesT", ct: "glovesCT" },
  agent: { t: "agentT", ct: "agentCT" },
  musickit: { t: "musicKitT", ct: "musicKitCT" },
};

/** The item id a loadout holds in one slot. */
function slotRef(l: Loadout, kind: SlotKind, s: Side, def: number): string | undefined {
  if (kind === "weapon") return (s === "t" ? l.equippedT : l.equippedCT)[def];
  return l[SINGLE_FIELD[kind][s]] as string | undefined;
}

/** A copy of the loadout with one slot set (or cleared, for `id` undefined). */
function withSlot(l: Loadout, kind: SlotKind, s: Side, def: number, id: string | undefined): Loadout {
  if (kind === "weapon") {
    const key = s === "t" ? "equippedT" : "equippedCT";
    const map = { ...l[key] };
    if (id) map[def] = id;
    else delete map[def];
    return { ...l, [key]: map };
  }
  return { ...l, [SINGLE_FIELD[kind][s]]: id };
}

/** Every item id a loadout references. */
function loadoutRefs(l: Loadout): Set<string> {
  const ids = [
    l.knifeT, l.knifeCT, l.glovesT, l.glovesCT, l.agentT, l.agentCT, l.musicKitT, l.musicKitCT,
    ...Object.values(l.equippedT ?? {}),
    ...Object.values(l.equippedCT ?? {}),
  ];
  return new Set(ids.filter((x): x is string => !!x));
}

const sidesOf = (target: Side | "both"): Side[] => (target === "both" ? ["t", "ct"] : [target]);
const canHold = (team: Team, s: Side) => team === "both" || team === s;

export default function InventorySimulator() {
  const { t } = useI18n();

  const [store, setStore] = useState<InventoryStore>(defaultStore());
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session>({ authenticated: false });
  const [origin, setOrigin] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  /**
   * This season's StatTrak figures, or null until they load (and for a
   * signed-out visitor). `itemKills` is per item — what CS2 paints on the gun.
   * `seasonKills` is the player's kills with anything, which no weapon shows.
   */
  const [seasonStats, setSeasonStats] = useState<SeasonStats | null>(null);

  // ---- armory ----
  const [armoryOpen, setArmoryOpen] = useState(false);
  const [armoryMode, setArmoryMode] = useState<"catalog" | "vault">("catalog");
  /** The side the armory shows and equips to. */
  const [side, setSide] = useState<Side>("t");
  /** Equip to both sides at once (where the weapon allows it). */
  const [bothSides, setBothSides] = useState(false);
  const [weaponQuery, setWeaponQuery] = useState("");
  const [activeSection, setActiveSection] = useState<string>(CATEGORY_ORDER[0]);
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({});
  const armoryScroll = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const savedScroll = useRef(0);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // ---- weapon view ----
  const [weapon, setWeapon] = useState<WeaponEntry | null>(null);
  const [skins, setSkins] = useState<Skin[]>([]);
  const [skinsLoading, setSkinsLoading] = useState(false);
  const [skinSearch, setSkinSearch] = useState("");
  const [skinSort, setSkinSort] = useState<SkinSort>("quality");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [favOnly, setFavOnly] = useState(false);

  // The finish the next equip uses — and, via Apply, the equipped item's.
  const [wear, setWear] = useState(0);
  const [seed, setSeed] = useState(0);
  const [statTrak, setStatTrak] = useState(false);
  const [nameTag, setNameTag] = useState("");
  const [stickers, setStickers] = useState<(PlacedSticker | null)[]>(defaultStickerSlots());
  const [charm, setCharm] = useState<PlacedSticker | null>(null);
  const [editor3dOpen, setEditor3dOpen] = useState(false);

  // ---- vault ----
  const [vaultQuery, setVaultQuery] = useState("");
  const [vaultType, setVaultType] = useState<string>("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedSkins, setSelectedSkins] = useState<Set<number>>(new Set());

  // ---- menus & dialogs ----
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [radioFor, setRadioFor] = useState<WeaponEntry | null>(null);
  const [loSwitcherOpen, setLoSwitcherOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [share, setShare] = useState<{ key: string; name: string } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [equipState, setEquipState] = useState<"idle" | "busy" | "done">("idle");

  const dragId = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const builderKind: SlotKind = weapon ? kindOfCategory(weapon.category) : "weapon";
  const supportsStickers = builderKind === "weapon" || builderKind === "agent";
  const supportsCharms = builderKind === "weapon";
  const supportsStatTrak = builderKind !== "gloves" && builderKind !== "agent";
  const supportsWear = builderKind === "weapon" || builderKind === "knife" || builderKind === "gloves";
  const supportsNameTag = builderKind === "weapon" || builderKind === "knife";

  // Full-height page: hide the global footer so the workspace never scrolls.
  useEffect(() => {
    document.body.classList.add("inv-fullscreen");
    return () => document.body.classList.remove("inv-fullscreen");
  }, []);

  // Any click outside a popover closes it.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest(".iv-menu")) setMenu(null);
      if (!el.closest(".iv-pop, [data-pop-anchor]")) {
        setColorOpen(false);
        setImportOpen(false);
        setLoSwitcherOpen(false);
      }
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
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
        /* guest */
      }
      setSession(sess);
      if (sess.authenticated) {
        try {
          setStore(normaliseStore(await fetch("/api/inventory").then((r) => r.json())));
        } catch {
          setStore(loadStore());
        }
        // Separate from the store on purpose: this changes on every kill, the
        // store only when somebody edits. A failure costs the counters only.
        fetch("/api/stattrak")
          .then((r) => (r.ok ? r.json() : null))
          .then((s: SeasonStats | null) => setSeasonStats(s))
          .catch(() => {});
      } else {
        setStore(loadStore());
      }
      setHydrated(true);
    })();
  }, []);

  // ---------- Persist ----------
  const postStore = useCallback(
    (next: InventoryStore) =>
      fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      }),
    [],
  );
  useEffect(() => {
    if (!hydrated) return;
    saveStore(store);
    if (!session.authenticated) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      postStore(store).catch(() => {});
    }, 600);
  }, [store, hydrated, session.authenticated, postStore]);

  const storeRef = useRef(store);
  storeRef.current = store;

  const activeLoadout = useMemo(
    () => store.loadouts.find((l) => l.id === store.activeLoadoutId) ?? store.loadouts[0],
    [store],
  );
  const itemsById = useMemo(() => new Map(store.items.map((i) => [i.id, i])), [store.items]);
  const itemById = useCallback((id?: string) => (id ? itemsById.get(id) : undefined), [itemsById]);
  const favorites = useMemo(() => new Set(store.favorites ?? []), [store.favorites]);
  const allWeapons = useMemo(() => Object.values(catalog ?? {}).flat(), [catalog]);
  const weaponByDef = useCallback(
    (def: number): WeaponEntry | null => allWeapons.find((w) => w.def === def) ?? null,
    [allWeapons],
  );
  const categoryOfDef = useCallback(
    (def: number): string => {
      for (const [c, list] of Object.entries(catalog ?? {})) if (list.some((w) => w.def === def)) return c;
      return "Other";
    },
    [catalog],
  );

  // ---------- URL state ----------
  //
  // history.replaceState rather than the Next router: this is a client
  // workspace on a force-dynamic route, so router.replace would round trip to
  // the server on every click.
  const writeUrl = useCallback((patch: Record<string, string | null>, push = false) => {
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") q.delete(k);
      else q.set(k, v);
    }
    const url = `${window.location.pathname}${q.toString() ? `?${q}` : ""}`;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  // ---------- Slot lookups ----------
  const itemIn = useCallback(
    (kind: SlotKind, s: Side, def: number, loadout: Loadout | undefined = activeLoadout) =>
      loadout ? itemById(slotRef(loadout, kind, s, def)) : undefined,
    [activeLoadout, itemById],
  );

  /** The item in the slot a catalog entry would go into — for a knife, whatever knife is equipped. */
  const itemForEntry = useCallback(
    (w: WeaponEntry, s: Side) => itemIn(kindOfCategory(w.category), s, w.def),
    [itemIn],
  );

  /** The item a catalog tile shows: only if it is this exact weapon (not just "a knife"). */
  const itemOnTile = useCallback(
    (w: WeaponEntry, s: Side) => {
      const item = itemForEntry(w, s);
      return item?.weaponDef === w.def ? item : undefined;
    },
    [itemForEntry],
  );

  /** Kills with one item this season; null when the item does not count. */
  const killsFor = useCallback(
    (item: InventoryItem | undefined): number | null => {
      if (!item?.statTrak || !seasonStats) return null;
      return seasonStats.itemKills[String(item.uid)] ?? 0;
    },
    [seasonStats],
  );

  // ---------- The board ----------
  const boardFor = useCallback(
    (s: Side): BoardSlot[] => {
      if (!activeLoadout) return [];
      const preferredM4 = activeLoadout.preferredM4 ?? M4A4;
      const guns: BoardSlot[] = SIGNATURE_SLOTS[s].map((slot) => {
        const def = slot.m4 ? preferredM4 : slot.def;
        return {
          key: `${s}-${slot.label}`,
          def,
          kind: "weapon",
          label: slot.m4 ? (preferredM4 === M4A1S ? "M4A1-S" : "M4A4") : slot.label,
          item: itemIn("weapon", s, def),
          m4: slot.m4,
        };
      });
      const covered = new Set(guns.map((g) => g.def));
      const extras: BoardSlot[] = Object.entries(s === "t" ? activeLoadout.equippedT : activeLoadout.equippedCT)
        .filter(([def]) => !covered.has(Number(def)))
        .map(([def, id]) => ({
          key: `${s}-extra-${def}`,
          def: Number(def),
          kind: "weapon" as const,
          label: weaponByDef(Number(def))?.name ?? `Weapon ${def}`,
          item: itemById(id),
          extra: true,
        }))
        .sort((a, b) => CATEGORY_ORDER.indexOf(categoryOfDef(a.def)) - CATEGORY_ORDER.indexOf(categoryOfDef(b.def)));
      const single = (kind: Exclude<SlotKind, "weapon">, label: string): BoardSlot => {
        const item = itemIn(kind, s, -1);
        return { key: `${s}-${kind}`, def: item?.weaponDef ?? -1, kind, label, item };
      };
      return [
        single("knife", "Knife"),
        single("gloves", "Gloves"),
        ...guns,
        ...extras,
        single("musickit", "Music Kit"),
      ];
    },
    [activeLoadout, itemIn, itemById, weaponByDef, categoryOfDef],
  );
  const boardT = useMemo(() => boardFor("t"), [boardFor]);
  const boardCT = useMemo(() => boardFor("ct"), [boardFor]);

  /** Filled signature slots (guns + knife + gloves) out of both sides' total. */
  const completeness = useMemo(() => {
    const counts = (b: BoardSlot[]) =>
      b.filter((x) => !x.extra && x.kind !== "musickit" && x.item).length;
    const filled = counts(boardT) + counts(boardCT);
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

  // ---------- Opening things ----------

  /** Load an item's finish into the builder, or reset it for a fresh pick. */
  const loadFinish = useCallback((item: InventoryItem | undefined) => {
    setWear(item?.wear ?? 0);
    setSeed(item?.seed ?? 0);
    setStatTrak(item?.statTrak ?? false);
    setNameTag(item?.nameTag ?? "");
    setStickers(item?.stickers?.length ? [...item.stickers] : defaultStickerSlots());
    setCharm(item?.charm ?? null);
  }, []);

  /**
   * Scroll the armory (and only the armory) to a type's section, clear of the
   * sticky toolbar. scrollIntoView also scrolls every ancestor, and lost its
   * target when the unfold re-rendered the section mid-animation.
   */
  const jumpTo = useCallback((name: string, smooth = true) => {
    const sc = armoryScroll.current;
    const el = sectionRefs.current[name];
    if (!sc || !el) return;
    const sticky = sc.querySelector<HTMLElement>(".iv-armory-tools")?.offsetHeight ?? 0;
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - sticky;
    sc.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
  }, []);

  const openArmory = useCallback(
    (opts: { mode?: "catalog" | "vault"; section?: string } = {}) => {
      setArmoryOpen(true);
      setArmoryMode(opts.mode ?? "catalog");
      writeUrl({ armory: opts.mode === "vault" ? "vault" : "1", cat: opts.section ?? null });
      if (opts.section) {
        const target = opts.section;
        setUnfolded((u) => ({ ...u, [target]: true }));
        // After the armory has rendered (it may have just opened).
        window.setTimeout(() => {
          jumpTo(target);
        }, 40);
      }
    },
    [writeUrl, jumpTo],
  );

  /**
   * Open a weapon's skins.
   *
   * `item` preloads the builder with a specific item's finish. It exists
   * because callers that equip and then open in the same tick would otherwise
   * read the slot back from a store React has not flushed yet — which is how
   * the old editor came to open showing the previous item's stickers.
   */
  const openWeapon = useCallback(
    (w: WeaponEntry, s: Side = side, item?: InventoryItem) => {
      if (!weapon && armoryScroll.current) savedScroll.current = armoryScroll.current.scrollTop;
      setArmoryOpen(true);
      setArmoryMode("catalog");
      setSide(s);
      setWeapon(w);
      setSkinSearch("");
      setCollectionFilter("");
      setSelectedSkins(new Set());
      setEditor3dOpen(false);
      loadFinish(item ?? itemForEntry(w, s));
      writeUrl({ armory: "1", w: String(w.def), side: s, cat: null }, true);
    },
    [side, weapon, itemForEntry, loadFinish, writeUrl],
  );

  const closeWeapon = useCallback(() => {
    setWeapon(null);
    setSkins([]);
    setSelectedSkins(new Set());
    writeUrl({ w: null }, true);
    // Back to where the list was.
    window.setTimeout(() => {
      if (armoryScroll.current) armoryScroll.current.scrollTop = savedScroll.current;
    }, 0);
  }, [writeUrl]);

  const closeArmory = useCallback(() => {
    setArmoryOpen(false);
    setWeapon(null);
    setEditor3dOpen(false);
    writeUrl({ armory: null, w: null, cat: null });
  }, [writeUrl]);

  /** A board tile → that slot in the armory. */
  const openSlot = useCallback(
    (slot: BoardSlot, s: Side) => {
      const entry = slot.item ? weaponByDef(slot.item.weaponDef) : slot.def > 0 ? weaponByDef(slot.def) : null;
      if (entry) return openWeapon(entry, s, slot.item);
      // An empty knife / gloves / agent / kit slot has no weapon yet: show the type.
      setSide(s);
      setWeapon(null);
      openArmory({ section: categoryOfKind(slot.kind) ?? CATEGORY_ORDER[0] });
    },
    [weaponByDef, openWeapon, openArmory],
  );

  // Restore from the URL once the catalog is in (a ?w= needs it to resolve).
  const applyUrl = useCallback(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("side");
    if (s === "t" || s === "ct") setSide(s);
    const lo = q.get("lo");
    if (lo) setStore((cur) => (cur.loadouts.some((l) => l.id === lo) ? { ...cur, activeLoadoutId: lo } : cur));
    const armory = q.get("armory");
    const cat = q.get("cat");
    const w = q.get("w");
    // ?view=preview and a bare ?cat= are links from the old page; both meant
    // "show me the catalog", which is the armory now.
    const wantsArmory = !!(armory || w || cat || q.get("view") === "preview");
    setArmoryOpen(wantsArmory);
    setArmoryMode(armory === "vault" ? "vault" : "catalog");
    const entry = w ? allWeapons.find((e) => e.def === Number(w)) : undefined;
    setWeapon(entry ?? null);
    if (entry) {
      const side0: Side = s === "ct" ? "ct" : "t";
      const cur = storeRef.current;
      const l = cur.loadouts.find((x) => x.id === (lo ?? cur.activeLoadoutId)) ?? cur.loadouts[0];
      const ref = l ? slotRef(l, kindOfCategory(entry.category), side0, entry.def) : undefined;
      loadFinish(cur.items.find((i) => i.id === ref));
    }
    if (cat && CATEGORY_ORDER.includes(cat) && !entry) {
      setUnfolded((u) => ({ ...u, [cat]: true }));
      window.setTimeout(() => jumpTo(cat, false), 60);
    }
  }, [allWeapons, loadFinish, jumpTo]);

  const bootedUrl = useRef(false);
  useEffect(() => {
    if (!hydrated || !catalog || bootedUrl.current) return;
    bootedUrl.current = true;
    applyUrl();
  }, [hydrated, catalog, applyUrl]);

  useEffect(() => {
    const onPop = () => applyUrl();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [applyUrl]);

  // ---------- Skins fetch ----------
  useEffect(() => {
    if (!weapon) return;
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

  // ---------- Scrollspy for the jump bar ----------
  useEffect(() => {
    const root = armoryScroll.current;
    if (!armoryOpen || weapon || armoryMode !== "catalog" || !root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const name = visible[0]?.target.getAttribute("data-section");
        if (name) setActiveSection(name);
      },
      { root, rootMargin: "0px 0px -70% 0px" },
    );
    for (const el of Object.values(sectionRefs.current)) if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [armoryOpen, weapon, armoryMode, catalog, weaponQuery]);

  // ---------- Equip / clear ----------

  /** The side(s) an equip lands on, filtered to what the weapon's team can hold. */
  const equipSides = useCallback(
    (team: Team, target?: Side | "both"): Side[] =>
      sidesOf(target ?? (bothSides ? "both" : side)).filter((s) => canHold(team, s)),
    [bothSides, side],
  );

  /**
   * Put a catalog skin in a slot, crafted with the builder's finish.
   *
   * An identical item already in the vault is reused rather than duplicated,
   * so equipping the same thing twice does not grow the inventory.
   */
  const equipSkin = (skin: Skin, w: WeaponEntry, target?: Side | "both", onlyVault = false) => {
    const kind = kindOfCategory(w.category);
    const sides = onlyVault ? [w.team === "ct" ? "ct" as const : "t" as const] : equipSides(w.team, target);
    if (sides.length === 0) {
      showToast(t("inv.toast.wrongTeam"));
      return;
    }
    const payload = {
      kind,
      weaponDef: w.def,
      weaponName: w.name,
      team: w.team,
      skinId: skin.id,
      skinName: skin.name,
      paint: skin.paint,
      image: skin.image,
      rarity: skin.rarity,
      wear: supportsWearFor(kind) ? wear : 0,
      seed: supportsWearFor(kind) ? seed : 0,
      statTrak: kind !== "gloves" && kind !== "agent" ? statTrak : false,
      nameTag: kind === "weapon" || kind === "knife" ? nameTag : "",
      stickers: kind === "weapon" || kind === "agent" ? stickers : defaultStickerSlots(),
      charm: kind === "weapon" ? charm : null,
    };
    setStore((cur) => {
      const loadout = cur.loadouts.find((l) => l.id === cur.activeLoadoutId);
      if (!loadout) return cur;
      let items = cur.items;
      let nextUid = cur.nextUid;
      const identical = cur.items.find(
        (i) =>
          i.weaponDef === payload.weaponDef &&
          i.skinId === payload.skinId &&
          i.wear === payload.wear &&
          i.seed === payload.seed &&
          i.statTrak === payload.statTrak &&
          i.nameTag === payload.nameTag &&
          JSON.stringify(i.stickers) === JSON.stringify(payload.stickers) &&
          JSON.stringify(i.charm) === JSON.stringify(payload.charm),
      );
      let itemId = identical?.id;
      if (!itemId) {
        itemId = newId();
        items = [{ id: itemId, uid: nextUid, createdAt: Date.now(), ...payload }, ...items];
        nextUid += 1;
      }
      if (onlyVault) return { ...cur, items, nextUid };
      let next = loadout;
      for (const s of sides) next = withSlot(next, kind, s, w.def, itemId);
      return { ...cur, items, nextUid, loadouts: cur.loadouts.map((l) => (l.id === next.id ? next : l)) };
    });
    showToast(
      onlyVault
        ? t("inv.toast.vaulted", { name: skinLabel(skin.name) })
        : t("inv.toast.equipped", { name: skinLabel(skin.name), side: sides.map((s) => s.toUpperCase()).join(" + ") }),
    );
  };

  /** Put an item that already exists into slots, as itself — no re-crafting. */
  const assignItem = (item: InventoryItem, target: Side | "both") => {
    const sides = sidesOf(target).filter((s) => canHold(item.team, s));
    if (!sides.length) return showToast(t("inv.toast.wrongTeam"));
    const kind = item.kind as SlotKind;
    setStore((cur) => ({
      ...cur,
      loadouts: cur.loadouts.map((l) => {
        if (l.id !== cur.activeLoadoutId) return l;
        let next = l;
        for (const s of sides) next = withSlot(next, kind, s, item.weaponDef, item.id);
        return next;
      }),
    }));
    showToast(t("inv.toast.equipped", { name: skinLabel(item.skinName), side: sides.map((s) => s.toUpperCase()).join(" + ") }));
  };

  const clearSlot = (def: number, kind: SlotKind, target: Side | "both") => {
    setStore((cur) => ({
      ...cur,
      loadouts: cur.loadouts.map((l) => {
        if (l.id !== cur.activeLoadoutId) return l;
        let next = l;
        for (const s of sidesOf(target)) next = withSlot(next, kind, s, def, undefined);
        return next;
      }),
    }));
  };

  /** Delete items outright, and drop every loadout's reference to them. */
  const deleteItems = (ids: Set<string>) => {
    setStore((cur) => ({
      ...cur,
      items: cur.items.filter((i) => !ids.has(i.id)),
      loadouts: cur.loadouts.map((l) => {
        let next = l;
        for (const kind of ["knife", "gloves", "agent", "musickit"] as const)
          for (const s of SIDES) if (ids.has(slotRef(next, kind, s, -1) ?? "")) next = withSlot(next, kind, s, -1, undefined);
        for (const s of SIDES)
          for (const [def, id] of Object.entries(s === "t" ? next.equippedT : next.equippedCT))
            if (ids.has(id)) next = withSlot(next, "weapon", s, Number(def), undefined);
        return next;
      }),
    }));
  };

  /**
   * Write the 3D editor's result into the saved item.
   *
   * Editing targets the item already in the slot, so there is nothing to write
   * to when the slot is empty — a sticker needs a skin to sit on.
   */
  const commitStickerEdit = (nextStickers: (PlacedSticker | null)[], nextCharm: PlacedSticker | null) => {
    if (!weapon) return;
    const target = itemForEntry(weapon, side);
    if (!target) return showToast(t("inventory.editor.needSkin"));
    setStore((cur) => ({
      ...cur,
      items: cur.items.map((i) =>
        i.id === target.id
          ? {
              ...i,
              stickers: supportsStickers ? nextStickers : defaultStickerSlots(),
              charm: supportsCharms ? nextCharm : null,
            }
          : i,
      ),
    }));
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

  const setPreferredM4 = (def: number) =>
    setStore((cur) => ({
      ...cur,
      loadouts: cur.loadouts.map((l) => (l.id === cur.activeLoadoutId ? { ...l, preferredM4: def } : l)),
    }));

  // ---------- Loadouts ----------
  const patchLoadout = (id: string, patch: Partial<Loadout>) =>
    setStore((c) => ({ ...c, loadouts: c.loadouts.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const setActiveLoadout = (id: string) => {
    setStore((c) => ({ ...c, activeLoadoutId: id }));
    setConfirmDelete(null);
    writeUrl({ lo: id });
  };
  const addLoadout = () => {
    const l = emptyLoadout(`Loadout ${store.loadouts.length + 1}`);
    setStore((c) => ({ ...c, loadouts: [...c.loadouts, l], activeLoadoutId: l.id }));
    setRenaming(l.id);
    writeUrl({ lo: l.id });
  };
  const duplicateLoadout = (src: Loadout) => {
    const copy: Loadout = {
      ...src,
      id: newId(),
      name: `${src.name} copy`,
      favorite: false,
      createdAt: Date.now(),
      equippedCT: { ...src.equippedCT },
      equippedT: { ...src.equippedT },
    };
    setStore((c) => {
      const at = c.loadouts.findIndex((x) => x.id === src.id);
      const loadouts = [...c.loadouts];
      loadouts.splice(at + 1, 0, copy);
      return { ...c, loadouts, activeLoadoutId: copy.id };
    });
    writeUrl({ lo: copy.id });
    showToast(t("inv.toast.duplicated", { name: src.name }));
  };
  const deleteLoadout = (l: Loadout) => {
    if (store.loadouts.length <= 1) return showToast(t("inv.toast.keepOne"));
    setStore((c) => {
      const loadouts = c.loadouts.filter((x) => x.id !== l.id);
      return { ...c, loadouts, activeLoadoutId: c.activeLoadoutId === l.id ? loadouts[0].id : c.activeLoadoutId };
    });
    setConfirmDelete(null);
    showToast(t("inv.toast.deleted", { name: l.name }));
  };

  /** Reorder by id, not by index — the list is shown favourites-first. */
  const onLoDrop = (targetId: string) => {
    const from = dragId.current;
    setDragOver(null);
    dragId.current = null;
    if (!from || from === targetId) return;
    setStore((c) => {
      const arr = [...c.loadouts];
      const fromIdx = arr.findIndex((x) => x.id === from);
      const toIdx = arr.findIndex((x) => x.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return c;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return { ...c, loadouts: arr };
    });
  };

  /** Favourites first, then the order the player dragged them into. */
  const sortedLoadouts = useMemo(
    () => [...store.loadouts].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite)),
    [store.loadouts],
  );

  // ---------- Share / borrow / import ----------
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      showToast(t("inv.toast.clipboard"));
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
      if (!res.ok || !j.key) return showToast(j.error ?? t("inv.toast.shareFailed"));
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
      if (!res.ok || !j.loadout) return showToast(j.error ?? t("inv.toast.importFailed"));
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
      setImportOpen(false);
      showToast(t("inv.toast.importedCstrike"));
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
          showToast(j.error === "not found" ? t("inv.toast.noKey") : j.error ?? t("inv.toast.importFailed"));
          return;
        }
        setStore((cur) => importSnapshot(cur, j.snapshot as LoadoutSnapshot));
        setImportKey("");
        setImportOpen(false);
        showToast(t("inv.toast.borrowed", { name: j.name }));
      } finally {
        setShareBusy(false);
      }
    },
    [showToast, t],
  );

  /** Which of the two imports the pasted text is — decided once, so the button can say so. */
  const importSource: "cstrike" | "key" =
    importKey.includes("cstrike.app") || importKey.trim().startsWith("[") ? "cstrike" : "key";

  // A shared link lands here as ?borrow=<key> and imports itself.
  const borrowed = useRef(false);
  useEffect(() => {
    if (!hydrated || borrowed.current) return;
    const key = new URLSearchParams(window.location.search).get("borrow");
    if (!key) return;
    borrowed.current = true;
    importByKey(key).finally(() => writeUrl({ borrow: null }));
  }, [hydrated, importByKey, writeUrl]);

  const equipInGame = async () => {
    setEquipState("busy");
    try {
      await postStore(store); // the server reads the saved store, so save first
      const res = await fetch("/api/loadout/equip-rcon", { method: "POST" });
      if (!res.ok) throw new Error((await res.text()) || t("inv.toast.equipFailed"));
      setEquipState("done");
      window.setTimeout(() => setEquipState("idle"), 2200);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("inv.toast.equipFailed"));
      setEquipState("idle");
    }
  };

  // ---------- Weapon view: derived ----------
  const collections = useMemo(() => {
    const set = new Set<string>();
    for (const s of skins) if (s.collection) set.add(s.collection);
    return Array.from(set).sort();
  }, [skins]);

  const currentItem = weapon ? itemForEntry(weapon, side) : undefined;
  const currentOnThisWeapon = currentItem && weapon && currentItem.weaponDef === weapon.def ? currentItem : undefined;
  const currentSkinId = currentOnThisWeapon?.skinId;

  const shownSkins = useMemo(() => {
    const q = skinSearch.trim().toLowerCase();
    let list = skins.filter((s) => skinLabel(s.name).toLowerCase().includes(q));
    if (collectionFilter) list = list.filter((s) => s.collection === collectionFilter);
    if (favOnly) list = list.filter((s) => favorites.has(skinKey(s.def, s.paint)));
    if (skinSort === "quality")
      list.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || skinLabel(a.name).localeCompare(skinLabel(b.name)));
    else if (skinSort === "newest") list.sort((a, b) => b.paint - a.paint);
    else if (skinSort === "fav")
      list.sort((a, b) => Number(favorites.has(skinKey(b.def, b.paint))) - Number(favorites.has(skinKey(a.def, a.paint))));
    else list.sort((a, b) => skinLabel(a.name).localeCompare(skinLabel(b.name)));
    return list;
  }, [skins, skinSearch, collectionFilter, favOnly, favorites, skinSort]);

  /** Items already crafted for this weapon — equippable as they are. */
  const craftsForWeapon = useMemo(
    () => (weapon ? store.items.filter((i) => i.weaponDef === weapon.def) : []),
    [store.items, weapon],
  );

  /** Has the builder's finish drifted from the equipped item's? */
  const finishDirty =
    !!currentOnThisWeapon &&
    (currentOnThisWeapon.wear !== wear ||
      currentOnThisWeapon.seed !== seed ||
      !!currentOnThisWeapon.statTrak !== statTrak ||
      (currentOnThisWeapon.nameTag ?? "") !== nameTag);

  const surpriseMe = () => {
    if (!weapon) return;
    const pool = shownSkins.filter((s) => s.id !== currentSkinId);
    if (!pool.length) return showToast(t("inv.toast.nothingToRoll"));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (supportsWear) {
      setWear(Math.round(Math.random() * 0.45 * 1000) / 1000);
      setSeed(Math.floor(Math.random() * 1001));
    }
    // State updates above land on the next render; equip with the new values
    // by deferring a tick.
    window.setTimeout(() => equipSkinRef.current(pick, weapon), 0);
  };
  const equipSkinRef = useRef(equipSkin);
  equipSkinRef.current = equipSkin;

  // ---------- Armory: derived ----------
  const weaponMatches = useCallback(
    (w: WeaponEntry) => {
      const q = weaponQuery.trim().toLowerCase();
      if (!q) return true;
      const item = itemOnTile(w, side);
      return w.name.toLowerCase().includes(q) || (item ? item.skinName.toLowerCase().includes(q) : false);
    },
    [weaponQuery, itemOnTile, side],
  );

  const sections = useMemo(
    () =>
      CATEGORY_ORDER.filter((c) => catalog?.[c]?.length).map((c) => {
        const list = (catalog![c] ?? []).filter((w) => canHold(w.team, side) || w.team === "both");
        const matching = list.filter(weaponMatches);
        // What is equipped first: that is the tile you came to change.
        matching.sort((a, b) => Number(!!itemOnTile(b, side)) - Number(!!itemOnTile(a, side)));
        return { name: c, all: list, matching };
      }),
    [catalog, side, weaponMatches, itemOnTile],
  );

  /** Per type, how many of this side's slots are dressed. */
  const typeFill = useMemo(() => {
    const board = side === "t" ? boardT : boardCT;
    const m = new Map<string, { filled: number; total: number }>();
    for (const slot of board) {
      const g = categoryOfKind(slot.kind) ?? categoryOfDef(slot.def);
      const cur = m.get(g) ?? { filled: 0, total: 0 };
      cur.total += 1;
      if (slot.item) cur.filled += 1;
      m.set(g, cur);
    }
    return m;
  }, [side, boardT, boardCT, categoryOfDef]);

  // ---------- Vault: derived ----------
  const equippedIds = useMemo(() => (activeLoadout ? loadoutRefs(activeLoadout) : new Set<string>()), [activeLoadout]);
  const vaultItems = useMemo(() => {
    const q = vaultQuery.trim().toLowerCase();
    return store.items.filter((i) => {
      if (vaultType && categoryOfKind(i.kind as SlotKind) !== vaultType && categoryOfDef(i.weaponDef) !== vaultType) return false;
      if (!q) return true;
      return `${i.weaponName} ${i.skinName} ${i.nameTag ?? ""}`.toLowerCase().includes(q);
    });
  }, [store.items, vaultQuery, vaultType, categoryOfDef]);
  const vaultTypes = useMemo(() => {
    const present = new Set(store.items.map((i) => categoryOfKind(i.kind as SlotKind) ?? categoryOfDef(i.weaponDef)));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [store.items, categoryOfDef]);
  const [vaultFolded, setVaultFolded] = useState<Record<string, boolean>>({});

  // ---------- Keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (e.key === "Escape") {
        if (editor3dOpen || radioFor) return; // those dialogs own Escape
        if (menu) return setMenu(null);
        if (share) return setShare(null);
        if (typing) return (el as HTMLElement).blur();
        if (selectedItems.size || selectedSkins.size) {
          setSelectedItems(new Set());
          setSelectedSkins(new Set());
          return;
        }
        if (weapon && armoryMode === "catalog") return closeWeapon();
        if (armoryOpen) return closeArmory();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "t") setSide("t");
      if (k === "c") setSide("ct");
      if (k === "/" || k === "f") {
        e.preventDefault();
        if (!armoryOpen) openArmory();
        window.setTimeout(() => searchRef.current?.focus(), 30);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Item menu ----------
  const asSkin = (item: InventoryItem): Skin => ({
    id: item.skinId,
    def: item.weaponDef,
    paint: item.paint,
    name: item.skinName,
    image: item.image,
    rarity: item.rarity || "default",
  });

  const openMenu = (e: React.MouseEvent, target: Omit<MenuTarget, "x" | "y">) => {
    e.preventDefault();
    e.stopPropagation();
    const fromPointer = e.type === "contextmenu";
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ ...target, x: fromPointer ? e.clientX : box.right, y: fromPointer ? e.clientY : box.bottom + 4 });
  };

  /** Right-click anywhere on a tile, or its ⋯ button — the same menu either way. */
  const menuProps = (target: Omit<MenuTarget, "x" | "y"> | null) =>
    target ? { onContextMenu: (e: React.MouseEvent) => openMenu(e, target) } : {};

  const MenuButton = ({ target, label }: { target: Omit<MenuTarget, "x" | "y"> | null; label: string }) =>
    target ? (
      <button type="button" className="iv-dots" aria-label={t("inv.menu.optionsFor", { name: label })} onClick={(e) => openMenu(e, target)}>
        <Ellipsis size={16} />
      </button>
    ) : null;

  const renderMenu = () => {
    if (!menu || !mounted || !activeLoadout) return null;
    const { skin, weapon: w, item } = menu;
    const kind = kindOfCategory(w.category);
    const isAgent = kind === "agent";
    const fav = favorites.has(skinKey(w.def, skin.paint));
    const onSide = (s: Side) => (item ? slotRef(activeLoadout, kind, s, w.def) === item.id : false);
    const eqT = onSide("t");
    const eqCT = onSide("ct");

    const MENU_W = 240;
    const MENU_H = 360;
    const left = Math.min(Math.max(8, menu.x - MENU_W), window.innerWidth - MENU_W - 8);
    const top = Math.min(Math.max(8, menu.y), Math.max(8, window.innerHeight - MENU_H - 8));
    const act = (fn: () => void) => () => {
      fn();
      setMenu(null);
    };
    const equip = (target: Side | "both") => (item ? assignItem(item, target) : equipSkin(skin, w, target));

    return createPortal(
      <div
        className="iv-menu"
        role="menu"
        style={{ left, top, width: MENU_W, "--rarity": skin.rarity } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="iv-menu-head">
          <span className="iv-menu-weapon">{w.name}</span>
          <span className="iv-menu-skin">{skinLabel(skin.name)}</span>
        </div>

        {(supportsStickerKind(kind)) && (
          <button
            role="menuitem"
            className="iv-menu-item"
            onClick={act(() => {
              // Make sure the item is in the slot the editor writes to, then
              // open the weapon with that item's finish preloaded.
              const s = menu.side;
              if (item && !onSide(s)) assignItem(item, s);
              else if (!item) equipSkin(skin, w, s);
              openWeapon(w, s, item);
              setEditor3dOpen(true);
            })}
          >
            <Sticker size={15} /> {isAgent ? t("inv.menu.patches") : t("inv.menu.stickers")}
          </button>
        )}
        {isAgent && (
          <button role="menuitem" className="iv-menu-item" onClick={act(() => setRadioFor(w))}>
            <Radio size={15} /> {t("inv.menu.radio")}
          </button>
        )}

        <div className="iv-menu-sep" />
        {SIDES.filter((s) => canHold(w.team, s)).map((s) => {
          const on = s === "t" ? eqT : eqCT;
          return (
            <button
              key={s}
              role="menuitem"
              className={`iv-menu-item side-${s}`}
              onClick={act(() => (on ? clearSlot(w.def, kind, s) : equip(s)))}
            >
              <span className={`iv-side-tag ${s}`}>{s.toUpperCase()}</span>
              {on ? t("inv.menu.unequip") : t("inv.menu.equip")}
              {on && <Check size={14} className="iv-menu-check" />}
            </button>
          );
        })}
        {w.team === "both" && (
          <button
            role="menuitem"
            className="iv-menu-item"
            onClick={act(() => (eqT && eqCT ? clearSlot(w.def, kind, "both") : equip("both")))}
          >
            <ArrowLeftRight size={15} /> {eqT && eqCT ? t("inv.menu.unequipBoth") : t("inv.menu.equipBoth")}
          </button>
        )}

        <div className="iv-menu-sep" />
        {item ? (
          <button
            role="menuitem"
            className="iv-menu-item danger"
            onClick={act(() => deleteItems(new Set([item.id])))}
          >
            <Trash2 size={15} /> {t("inv.menu.deleteItem")}
          </button>
        ) : (
          <button role="menuitem" className="iv-menu-item" onClick={act(() => equipSkin(skin, w, undefined, true))}>
            <Archive size={15} /> {t("inv.menu.addToVault")}
          </button>
        )}
        <button role="menuitem" className="iv-menu-item" onClick={act(() => toggleFavorite(w.def, skin.paint))}>
          <Heart size={15} className={fav ? "iv-fav-on" : ""} /> {fav ? t("inv.menu.unfavourite") : t("inv.menu.favourite")}
        </button>
      </div>,
      document.body,
    );
  };

  // ---------- Pieces ----------

  /** The real weapon, as a flat glyph in currentColor. */
  const Glyph = ({ category, size = 22 }: { category: string; size?: number }) => {
    if (category === "Music Kits") return <Music size={size - 4} aria-hidden />;
    const w =
      category === "Agents"
        ? null
        : weaponByDef(GLYPH_DEF[category] ?? -1) ?? catalog?.[category]?.[0] ?? null;
    if (category === "Agents") return <span className="iv-glyph agent" style={{ width: size, height: size }} aria-hidden />;
    if (!w) return <InventoryIcon id={categoryIconId(category)} size={size} />;
    return (
      <span
        className="iv-glyph"
        aria-hidden
        style={{ width: size * 1.9, height: size, WebkitMaskImage: `url(${w.image})`, maskImage: `url(${w.image})` }}
      />
    );
  };

  const StatBadges = ({ item }: { item?: InventoryItem }) => {
    if (!item) return null;
    const kills = killsFor(item);
    const stickerCount = item.stickers?.filter(Boolean).length ?? 0;
    const kind = item.kind as SlotKind;
    return (
      <span className="iv-badges">
        {supportsWearFor(kind) && <span className="iv-badge num" title={wearLabel(item.wear)}>{wearShort(item.wear)}</span>}
        {kills !== null && (
          <span className="iv-badge st num" title={t("inv.stattrakTitle")}>
            ST {kills.toLocaleString()}
          </span>
        )}
        {stickerCount > 0 && (
          <span className="iv-badge" title={t("inv.stickerCount", { n: stickerCount })}>
            <Sticker size={11} /> {stickerCount}
          </span>
        )}
        {item.nameTag && <span className="iv-badge tag">“{item.nameTag}”</span>}
      </span>
    );
  };

  const isActiveSlot = (slot: BoardSlot, s: Side) =>
    armoryOpen && !!weapon && side === s && (slot.item ? slot.item.weaponDef === weapon.def : slot.def === weapon.def);

  const SlotTile = ({ slot, s }: { slot: BoardSlot; s: Side }) => {
    const w = slot.item ? weaponByDef(slot.item.weaponDef) : null;
    const target = slot.item && w ? { skin: asSkin(slot.item), weapon: w, side: s, item: slot.item } : null;
    const emptyIcon = categoryOfKind(slot.kind) ?? categoryOfDef(slot.def);
    return (
      <li
        key={slot.key}
        className={`iv-slot ${slot.item ? "filled" : "empty"} ${isActiveSlot(slot, s) ? "active" : ""}`}
        style={slot.item?.rarity ? ({ "--rarity": slot.item.rarity } as React.CSSProperties) : undefined}
      >
        <button className="iv-slot-main" onClick={() => openSlot(slot, s)} {...menuProps(target)}>
          <span className="iv-slot-art">
            {slot.item ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slot.item.image} alt="" loading="lazy" />
            ) : (
              <span className="iv-slot-empty-glyph">
                {Glyph({ category: emptyIcon, size: 16 })}
              </span>
            )}
          </span>
          <span className="iv-slot-text">
            <span className="iv-slot-label">{slot.label}</span>
            <span className="iv-slot-skin">{slot.item ? skinLabel(slot.item.skinName) : t("inv.slot.default")}</span>
            {StatBadges({ item: slot.item })}
          </span>
          {!slot.item && <Plus size={14} className="iv-slot-plus" aria-hidden />}
        </button>
        {slot.m4 && (
          <button
            className="iv-m4"
            title={t("inv.slot.m4Title")}
            onClick={() => setPreferredM4(slot.def === M4A1S ? M4A4 : M4A1S)}
          >
            <ArrowLeftRight size={12} /> {slot.def === M4A1S ? "M4A4" : "M4A1-S"}
          </button>
        )}
        {MenuButton({ target: target, label: slot.item ? skinLabel(slot.item.skinName) : slot.label })}
      </li>
    );
  };

  const AgentCard = ({ s }: { s: Side }) => {
    if (!activeLoadout) return null;
    const agent = itemIn("agent", s, -1);
    const w = agent ? weaponByDef(agent.weaponDef) : null;
    const target = agent && w ? { skin: asSkin(agent), weapon: w, side: s, item: agent } : null;
    const patches = agent?.stickers.filter(Boolean).length ?? 0;
    return (
      <div className="iv-agent" style={agent?.rarity ? ({ "--rarity": agent.rarity } as React.CSSProperties) : undefined}>
        <button
          className="iv-agent-main"
          onClick={() => openSlot({ key: `${s}-agent`, kind: "agent", def: agent?.weaponDef ?? -1, label: "Agent", item: agent }, s)}
          {...menuProps(target)}
        >
          <span className="iv-agent-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={agent?.image || DEFAULT_AGENT_ART}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.src = DEFAULT_AGENT_ART;
              }}
            />
          </span>
          <span className="iv-agent-text">
            <span className="iv-slot-label">{t("inv.slot.agent")}</span>
            <span className="iv-agent-name">{agent ? skinLabel(agent.skinName || agent.weaponName) : t("inv.slot.defaultAgent")}</span>
            {patches > 0 && <span className="iv-badge"><Sticker size={11} /> {t("inv.patchCount", { n: patches })}</span>}
          </span>
        </button>
        <div className="iv-agent-actions">
          {w && (
            <button className="iv-icon-btn" title={t("inv.menu.radio")} aria-label={t("inv.menu.radio")} onClick={() => setRadioFor(w)}>
              <Radio size={15} />
            </button>
          )}
          {MenuButton({ target: target, label: agent ? skinLabel(agent.skinName) : "Agent" })}
        </div>
      </div>
    );
  };

  const SideColumn = ({ s, board }: { s: Side; board: BoardSlot[] }) => {
    const gear = board.filter((x) => x.kind === "knife" || x.kind === "gloves");
    const guns = board.filter((x) => x.kind === "weapon" && !x.extra);
    const extras = board.filter((x) => x.extra);
    const kit = board.filter((x) => x.kind === "musickit");
    const filled = board.filter((x) => x.item).length;
    return (
      <section className={`iv-side ${s}`} aria-label={s === "t" ? t("inv.side.t") : t("inv.side.ct")}>
        <header className="iv-side-head">
          <span className={`iv-side-tag ${s}`}>{s.toUpperCase()}</span>
          <h3>{s === "t" ? t("inv.side.t") : t("inv.side.ct")}</h3>
          <span className="iv-side-count num">{filled}/{board.length}</span>
          <button
            className="iv-ghost-btn"
            onClick={() => {
              setSide(s);
              openArmory();
            }}
            title={t("inv.side.browse")}
          >
            <Plus size={14} /> {t("inv.side.add")}
          </button>
        </header>
        {AgentCard({ s })}
        <div className="iv-group">
          <h4>{t("inv.group.gear")}</h4>
          <ul className="iv-slots">{gear.map((x) => SlotTile({ slot: x, s }))}</ul>
        </div>
        <div className="iv-group">
          <h4>{t("inv.group.signature")}</h4>
          <ul className="iv-slots">{guns.map((x) => SlotTile({ slot: x, s }))}</ul>
        </div>
        {extras.length > 0 && (
          <div className="iv-group">
            <h4>{t("inv.group.extras")} <span className="num">{extras.length}</span></h4>
            <ul className="iv-slots">{extras.map((x) => SlotTile({ slot: x, s }))}</ul>
          </div>
        )}
        <div className="iv-group">
          <h4>{t("inv.group.music")}</h4>
          <ul className="iv-slots">{kit.map((x) => SlotTile({ slot: x, s }))}</ul>
        </div>
      </section>
    );
  };

  const LoadoutList = ({ compact = false }: { compact?: boolean }) => (
    <div className={`iv-lolist ${compact ? "compact" : ""}`}>
      <div className="iv-lolist-head">
        <h2>{t("auto.inventorysimulator.loadouts")}</h2>
        <span className="num iv-muted">{store.loadouts.length}</span>
        <button className="iv-icon-btn" onClick={addLoadout} title={t("auto.inventorysimulator.new_loadout")} aria-label={t("auto.inventorysimulator.new_loadout")}>
          <Plus size={16} />
        </button>
      </div>
      <ul className="iv-lolist-items" role="listbox" aria-label={t("auto.inventorysimulator.loadouts")}>
        {sortedLoadouts.map((l) => {
          const active = l.id === store.activeLoadoutId;
          return (
            <li
              key={l.id}
              role="option"
              aria-selected={active}
              className={`iv-lo ${active ? "active" : ""} ${dragOver === l.id ? "dragover" : ""}`}
              style={{ "--lo": l.color ?? "var(--color-neutral-500)" } as React.CSSProperties}
              draggable={renaming !== l.id}
              onDragStart={() => (dragId.current = l.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(l.id);
              }}
              onDragLeave={() => setDragOver((d) => (d === l.id ? null : d))}
              onDrop={() => onLoDrop(l.id)}
              onDragEnd={() => {
                setDragOver(null);
                dragId.current = null;
              }}
            >
              <GripVertical size={14} className="iv-lo-grip" aria-hidden />
              {renaming === l.id ? (
                <form
                  className="iv-lo-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
                    if (name) patchLoadout(l.id, { name });
                    setRenaming(null);
                  }}
                >
                  <input
                    name="name"
                    className="iv-input"
                    defaultValue={l.name}
                    autoFocus
                    maxLength={32}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                    onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                    aria-label={t("inv.lo.nameLabel")}
                  />
                </form>
              ) : (
                <button
                  className="iv-lo-pick"
                  onClick={() => {
                    setActiveLoadout(l.id);
                    setLoSwitcherOpen(false);
                  }}
                  onDoubleClick={() => setRenaming(l.id)}
                >
                  <span className="iv-lo-name">{l.name}</span>
                  <span className="iv-lo-meta num">{t("inv.lo.items", { n: loadoutSize(l) })}</span>
                </button>
              )}
              {confirmDelete === l.id ? (
                <span className="iv-lo-confirm">
                  <button className="iv-mini danger" onClick={() => deleteLoadout(l)}>{t("auto.inventorysimulator.delete")}</button>
                  <button className="iv-mini" onClick={() => setConfirmDelete(null)}>{t("inv.cancel")}</button>
                </span>
              ) : (
                <span className="iv-lo-acts">
                  <button
                    className={`iv-lo-act ${l.favorite ? "on" : ""}`}
                    title={t("inventory.loadouts.favourite")}
                    aria-label={`${t("inventory.loadouts.favourite")}: ${l.name}`}
                    aria-pressed={!!l.favorite}
                    onClick={() => patchLoadout(l.id, { favorite: !l.favorite })}
                  >
                    <Star size={14} />
                  </button>
                  <button className="iv-lo-act" title={t("auto.inventorysimulator.rename")} aria-label={`${t("auto.inventorysimulator.rename")}: ${l.name}`} onClick={() => setRenaming(l.id)}>
                    <Pencil size={14} />
                  </button>
                  <button className="iv-lo-act" title={t("auto.inventorysimulator.duplicate")} aria-label={`${t("auto.inventorysimulator.duplicate")}: ${l.name}`} onClick={() => duplicateLoadout(l)}>
                    <Copy size={14} />
                  </button>
                  {store.loadouts.length > 1 && (
                    <button className="iv-lo-act" title={t("auto.inventorysimulator.delete")} aria-label={`${t("auto.inventorysimulator.delete")}: ${l.name}`} onClick={() => setConfirmDelete(l.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="iv-lolist-foot">
        <button className="iv-btn wide" onClick={addLoadout}>
          <Plus size={15} /> {t("auto.inventorysimulator.new_loadout")}
        </button>
        <div className="iv-pop-wrap">
          <button
            className="iv-btn wide"
            data-pop-anchor
            aria-expanded={importOpen}
            onClick={(e) => {
              e.stopPropagation();
              setImportOpen((v) => !v);
            }}
          >
            <Download size={15} /> {t("inv.import.title")}
          </button>
          {importOpen && (
            <div className="iv-pop iv-import" onClick={(e) => e.stopPropagation()}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (importSource === "cstrike") importCstrike(importKey);
                  else importByKey(importKey);
                }}
              >
                <label className="iv-field-label" htmlFor="iv-import">{t("inventory.import.label")}</label>
                <input
                  id="iv-import"
                  className="iv-input"
                  placeholder={t("inventory.import.placeholder")}
                  value={importKey}
                  spellCheck={false}
                  autoFocus
                  onChange={(e) => setImportKey(e.target.value)}
                />
                <button className="iv-btn primary wide" type="submit" disabled={shareBusy || !importKey.trim()}>
                  {shareBusy ? <LoaderCircle size={15} className="iv-spin" /> : <Download size={15} />}
                  {importSource === "cstrike" ? t("inventory.import.fromCstrike") : t("inventory.import.fromKey")}
                </button>
              </form>
              {session.steamId && (
                <>
                  <div className="iv-or">{t("inv.or")}</div>
                  <button
                    className="iv-btn wide"
                    disabled={shareBusy}
                    onClick={() => importCstrike(`https://inventory.cstrike.app/api/inventory/${session.steamId}.json`)}
                  >
                    <Sparkles size={15} /> {t("inv.import.mine")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ---------- Armory views ----------
  const WeaponTile = ({ w, s }: { w: WeaponEntry; s: Side }) => {
    const item = itemOnTile(w, s);
    const skin: Skin | null = item
      ? asSkin(item)
      : w.category === "Agents"
        ? { id: w.id, def: w.def, paint: 0, name: w.name, image: w.image, rarity: w.rarity || "default" }
        : null;
    const target = skin ? { skin, weapon: w, side: s, item } : null;
    return (
      <div
        key={w.def}
        className={`iv-tile ${item ? "equipped" : ""}`}
        style={(item?.rarity || w.rarity) ? ({ "--rarity": item?.rarity || w.rarity } as React.CSSProperties) : undefined}
      >
        <button className="iv-tile-main" onClick={() => openWeapon(w, s)} {...menuProps(target)}>
          <span className="iv-tile-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item?.image ?? w.image} alt="" loading="lazy" />
          </span>
          <span className="iv-tile-name">{w.name}</span>
          <span className="iv-tile-sub">{item ? skinLabel(item.skinName) : SINGLE_SLOT.has(w.category) ? "" : t("inv.slot.default")}</span>
          {item && <span className="iv-tile-flag" title={t("inv.equippedOn", { side: s.toUpperCase() })}><Check size={12} /></span>}
        </button>
        {MenuButton({ target: target, label: w.name })}
      </div>
    );
  };

  const CatalogView = () => (
    <>
      <div className="iv-armory-tools">
        <label className="iv-search">
          <Search size={15} aria-hidden />
          <input
            ref={searchRef}
            className="iv-input"
            placeholder={t("inv.armory.searchWeapons")}
            value={weaponQuery}
            onChange={(e) => setWeaponQuery(e.target.value)}
            aria-label={t("inv.armory.searchWeapons")}
          />
          {weaponQuery && (
            <button className="iv-icon-btn" onClick={() => setWeaponQuery("")} aria-label={t("inv.clear")}>
              <X size={14} />
            </button>
          )}
        </label>
        <nav className="iv-jump" aria-label={t("inv.armory.types")}>
          {sections.map(({ name, matching }) => {
            const fill = typeFill.get(name);
            return (
              <button
                key={name}
                className={`iv-jump-chip ${activeSection === name ? "on" : ""}`}
                disabled={matching.length === 0}
                onClick={() => {
                  setUnfolded((u) => ({ ...u, [name]: true }));
                  setActiveSection(name);
                  // After the unfold has rendered, so the section has its full height.
                  window.setTimeout(() => jumpTo(name), 0);
                }}
                title={name}
              >
                {Glyph({ category: name, size: 16 })}
                <span className="iv-jump-name">{name}</span>
                {fill && fill.filled > 0 && <span className="iv-jump-count num">{fill.filled}</span>}
              </button>
            );
          })}
        </nav>
      </div>
      {!catalog ? (
        <div className="iv-grid">{Array.from({ length: 12 }, (_, i) => <div key={i} className="iv-tile skeleton" />)}</div>
      ) : (
        sections.map(({ name, matching }) => {
          if (!matching.length) return null;
          const folded = !unfolded[name] && !weaponQuery && matching.length > SECTION_PREVIEW;
          const list = folded ? matching.slice(0, SECTION_PREVIEW) : matching;
          return (
            <section
              key={name}
              className="iv-section"
              data-section={name}
              ref={(el) => {
                sectionRefs.current[name] = el;
              }}
            >
              <h3 className="iv-section-title">
                {Glyph({ category: name, size: 18 })}
                {name}
                <span className="num iv-muted">{matching.length}</span>
              </h3>
              <div className="iv-grid">{list.map((w) => WeaponTile({ w, s: side }))}</div>
              {folded && (
                <button className="iv-more" onClick={() => setUnfolded((u) => ({ ...u, [name]: true }))}>
                  <ChevronDown size={14} /> {t("inv.armory.showAll", { n: matching.length })}
                </button>
              )}
            </section>
          );
        })
      )}
      {catalog && sections.every((x) => !x.matching.length) && (
        <p className="iv-empty">{t("inv.armory.noWeapons", { q: weaponQuery })}</p>
      )}
    </>
  );

  const WeaponView = ({ w }: { w: WeaponEntry }) => {
    const current = currentItem;
    const currentTarget = current ? { skin: asSkin(current), weapon: weaponByDef(current.weaponDef) ?? w, side, item: current } : null;
    const equipTo = equipSides(w.team);
    const equipLabel = equipTo.map((s) => s.toUpperCase()).join(" + ") || "—";
    return (
      <div className="iv-wv">
        <div className="iv-wv-head">
          <button className="iv-ghost-btn" onClick={closeWeapon}>
            <ChevronLeft size={16} /> {t("inv.armory.back")}
          </button>
          <h3>
            {Glyph({ category: w.category, size: 16 })}
            {w.name}
          </h3>
        </div>

        {/* What is in this slot now, and what to do with it. */}
        <div
          className={`iv-current ${current ? "" : "empty"}`}
          style={current?.rarity ? ({ "--rarity": current.rarity } as React.CSSProperties) : undefined}
          {...menuProps(currentTarget)}
        >
          <span className="iv-current-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current?.image ?? w.image} alt="" />
          </span>
          <div className="iv-current-text">
            <span className="iv-slot-label">
              <span className={`iv-side-tag ${side}`}>{side.toUpperCase()}</span> {t("inv.wv.inSlot")}
            </span>
            <strong>{current ? current.skinName : t("inv.wv.nothing")}</strong>
            {current && <span className="iv-muted">{rarityName(current.rarity)}</span>}
            {StatBadges({ item: current })}
            {current && (current.stickers?.some(Boolean) || current.charm) && (
              <span className="iv-applied">
                {current.stickers.filter(Boolean).map((st, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={st!.image} alt="" />
                ))}
                {current.charm && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current.charm.image} alt="" />
                )}
              </span>
            )}
          </div>
          {current && (
            <div className="iv-current-acts">
              {supportsStickers && (
                <button className="iv-btn" onClick={() => setEditor3dOpen(true)}>
                  <Sticker size={15} /> {builderKind === "agent" ? t("inv.menu.patches") : t("inv.menu.stickers")}
                </button>
              )}
              {builderKind === "agent" && (
                <button className="iv-btn" onClick={() => setRadioFor(weaponByDef(current.weaponDef) ?? w)}>
                  <Radio size={15} /> {t("inv.menu.radio")}
                </button>
              )}
              <button
                className="iv-btn"
                onClick={() => {
                  clearSlot(current.weaponDef, builderKind, side);
                  loadFinish(undefined);
                }}
              >
                <X size={15} /> {t("auto.inventorysimulator.remove_skin")}
              </button>
            </div>
          )}
        </div>

        {/* The finish. Applies to the next pick, and to the equipped item via Apply. */}
        {(supportsWear || supportsStatTrak || supportsNameTag) && (
          <div className="iv-finish">
            {supportsWear && (
              <div className="iv-field wear">
                <div className="iv-field-row">
                  <label className="iv-field-label" htmlFor="iv-wear">{t("auto.inventorysimulator.wear")}</label>
                  <span className="num iv-wear-val">{wear.toFixed(3)} <em>{wearLabel(wear)}</em></span>
                </div>
                <input
                  id="iv-wear"
                  type="range"
                  className="iv-range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={wear}
                  onChange={(e) => setWear(Number(e.target.value))}
                />
                <div className="iv-wear-stops">
                  {WEAR_STOPS.map((st) => (
                    <button
                      key={st.label}
                      className={wearShort(wear) === st.label ? "on" : ""}
                      style={{ left: `${st.at * 100}%` }}
                      onClick={() => setWear(st.at === 0 ? 0 : st.at + 0.001)}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {supportsWear && (
              <div className="iv-field">
                <label className="iv-field-label" htmlFor="iv-seed">{t("inv.wv.pattern")}</label>
                <div className="iv-inline">
                  <input
                    id="iv-seed"
                    className="iv-input num"
                    type="number"
                    min={0}
                    max={1000}
                    value={seed}
                    onChange={(e) => setSeed(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
                  />
                  <button className="iv-icon-btn" title={t("inv.wv.randomPattern")} aria-label={t("inv.wv.randomPattern")} onClick={() => setSeed(Math.floor(Math.random() * 1001))}>
                    <Dices size={15} />
                  </button>
                </div>
              </div>
            )}
            {supportsNameTag && (
              <div className="iv-field">
                <label className="iv-field-label" htmlFor="iv-tag">{t("auto.inventorysimulator.name_tag")}</label>
                <input id="iv-tag" className="iv-input" maxLength={20} value={nameTag} placeholder={t("auto.inventorysimulator.none")} onChange={(e) => setNameTag(e.target.value)} />
              </div>
            )}
            {supportsStatTrak && (
              <label className="iv-toggle">
                <input type="checkbox" checked={statTrak} onChange={(e) => setStatTrak(e.target.checked)} />
                <span className="iv-toggle-ui" aria-hidden />
                StatTrak™
              </label>
            )}
            {finishDirty && current && (
              <button
                className="iv-btn primary"
                onClick={() => {
                  // Re-craft onto every side that holds the item now, not just this one.
                  const other: Side = side === "t" ? "ct" : "t";
                  const onOther = !!activeLoadout && slotRef(activeLoadout, builderKind, other, current.weaponDef) === current.id;
                  equipSkin(asSkin(current), w, onOther ? "both" : side);
                }}
              >
                <Check size={15} /> {t("inv.wv.apply")}
              </button>
            )}
          </div>
        )}

        {/* Things already made for this weapon, equippable as they are. */}
        {craftsForWeapon.length > 0 && (
          <div className="iv-crafts">
            <h4>{t("inv.wv.crafts")} <span className="num iv-muted">{craftsForWeapon.length}</span></h4>
            <div className="iv-crafts-row">
              {craftsForWeapon.map((item) => {
                const on = item.id === current?.id;
                return (
                  <button
                    key={item.id}
                    className={`iv-craft ${on ? "on" : ""}`}
                    style={{ "--rarity": item.rarity } as React.CSSProperties}
                    title={`${item.skinName} · ${wearShort(item.wear)}${item.statTrak ? " · ST" : ""}`}
                    onClick={() => {
                      assignItem(item, bothSides ? "both" : side);
                      loadFinish(item);
                    }}
                    {...menuProps({ skin: asSkin(item), weapon: w, side, item })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image} alt="" loading="lazy" />
                    <span className="num">{wearShort(item.wear)}{item.statTrak ? " ST" : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="iv-filters">
          <label className="iv-search">
            <Search size={15} aria-hidden />
            <input
              ref={searchRef}
              className="iv-input"
              placeholder={t("auto.inventorysimulator.search_skins")}
              value={skinSearch}
              onChange={(e) => setSkinSearch(e.target.value)}
              aria-label={t("auto.inventorysimulator.search_skins")}
            />
          </label>
          <select className="iv-input iv-select" value={skinSort} onChange={(e) => setSkinSort(e.target.value as SkinSort)} aria-label={t("auto.inventorysimulator.sort_skins")}>
            <option value="quality">{t("auto.inventorysimulator.quality")}</option>
            <option value="name">{t("auto.inventorysimulator.name_a_z")}</option>
            <option value="newest">{t("auto.inventorysimulator.newest")}</option>
            <option value="fav">{t("auto.inventorysimulator.favorites_first")}</option>
          </select>
          {collections.length > 1 && (
            <select className="iv-input iv-select" value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)} aria-label={t("auto.inventorysimulator.collection")}>
              <option value="">{t("auto.inventorysimulator.all_collections")}</option>
              {collections.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <button className={`iv-chip ${favOnly ? "on" : ""}`} aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)}>
            <Heart size={14} /> {t("inv.favourites")}
          </button>
          <button className="iv-chip" onClick={surpriseMe} disabled={skinsLoading} title={t("auto.inventorysimulator.roll_a_random_skin_from_the_cu")}>
            <Shuffle size={14} /> {t("inv.random")}
          </button>
        </div>

        <p className="iv-hint">
          {t("inv.wv.clickHint", { side: equipLabel })}
        </p>

        {skinsLoading ? (
          <div className="iv-grid skins">{Array.from({ length: 9 }, (_, i) => <div key={i} className="iv-tile skeleton" />)}</div>
        ) : shownSkins.length === 0 ? (
          <p className="iv-empty">{t("inv.wv.noSkins")}</p>
        ) : (
          <div className="iv-grid skins">
            {shownSkins.map((s) => {
              const fav = favorites.has(skinKey(s.def, s.paint));
              const on = s.id === currentSkinId;
              const picked = selectedSkins.has(s.id);
              return (
                <div
                  key={s.id}
                  className={`iv-tile skin ${on ? "equipped" : ""} ${picked ? "picked" : ""}`}
                  style={{ "--rarity": s.rarity } as React.CSSProperties}
                >
                  <button
                    className="iv-tile-main"
                    onClick={() => equipSkin(s, w)}
                    {...menuProps({ skin: s, weapon: w, side })}
                    title={on ? t("inv.equippedOn", { side: side.toUpperCase() }) : t("inv.equipTo", { side: equipLabel })}
                  >
                    <span className="iv-tile-art">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.image} alt="" loading="lazy" />
                    </span>
                    <span className="iv-tile-name">{skinLabel(s.name)}</span>
                    <span className="iv-tile-sub">{rarityName(s.rarity)}</span>
                    {on && <span className="iv-tile-flag"><Check size={12} /></span>}
                  </button>
                  <input
                    type="checkbox"
                    className="iv-pick"
                    checked={picked}
                    aria-label={t("inv.select", { name: skinLabel(s.name) })}
                    onChange={(e) => {
                      const n = new Set(selectedSkins);
                      if (e.target.checked) n.add(s.id);
                      else n.delete(s.id);
                      setSelectedSkins(n);
                    }}
                  />
                  <button
                    className={`iv-heart ${fav ? "on" : ""}`}
                    aria-pressed={fav}
                    aria-label={fav ? t("inv.menu.unfavourite") : t("inv.menu.favourite")}
                    onClick={() => toggleFavorite(s.def, s.paint)}
                  >
                    <Heart size={14} />
                  </button>
                  {MenuButton({ target: { skin: s, weapon: w, side }, label: skinLabel(s.name) })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const VaultView = () => {
    const groups: { key: string; title: string; items: InventoryItem[] }[] = [
      { key: "equipped", title: t("inv.vault.equipped"), items: vaultItems.filter((i) => equippedIds.has(i.id)) },
      { key: "imported", title: t("inv.vault.imported"), items: vaultItems.filter((i) => !equippedIds.has(i.id) && i.source === "cstrike") },
      { key: "other", title: t("inv.vault.stored"), items: vaultItems.filter((i) => !equippedIds.has(i.id) && i.source !== "cstrike") },
    ];
    return (
      <>
        <div className="iv-armory-tools">
          <label className="iv-search">
            <Search size={15} aria-hidden />
            <input
              ref={searchRef}
              className="iv-input"
              placeholder={t("inv.vault.search")}
              value={vaultQuery}
              onChange={(e) => setVaultQuery(e.target.value)}
              aria-label={t("inv.vault.search")}
            />
          </label>
          <nav className="iv-jump" aria-label={t("inv.armory.types")}>
            <button className={`iv-jump-chip ${vaultType === "" ? "on" : ""}`} onClick={() => setVaultType("")}>
              <span className="iv-jump-name">{t("inventory.rail.allTypes")}</span>
              <span className="iv-jump-count num">{store.items.length}</span>
            </button>
            {vaultTypes.map((c) => (
              <button key={c} className={`iv-jump-chip ${vaultType === c ? "on" : ""}`} onClick={() => setVaultType(vaultType === c ? "" : c)} title={c}>
                {Glyph({ category: c, size: 16 })}
                <span className="iv-jump-name">{c}</span>
              </button>
            ))}
          </nav>
        </div>
        {store.items.length === 0 ? (
          <div className="iv-empty big">
            <Archive size={28} />
            <p>{t("inv.vault.empty")}</p>
            <button className="iv-btn" onClick={() => setArmoryMode("catalog")}>{t("inv.vault.browse")}</button>
          </div>
        ) : (
          groups.map((g) =>
            g.items.length === 0 ? null : (
              <section key={g.key} className="iv-section">
                <button className="iv-section-title fold" aria-expanded={!vaultFolded[g.key]} onClick={() => setVaultFolded((f) => ({ ...f, [g.key]: !f[g.key] }))}>
                  <ChevronDown size={14} className="iv-fold-caret" />
                  {g.title}
                  <span className="num iv-muted">{g.items.length}</span>
                </button>
                {!vaultFolded[g.key] && (
                  <div className="iv-grid">
                    {g.items.map((item) => {
                      const w = weaponByDef(item.weaponDef);
                      const picked = selectedItems.has(item.id);
                      const target = w ? { skin: asSkin(item), weapon: w, side, item } : null;
                      return (
                        <div
                          key={item.id}
                          className={`iv-tile ${equippedIds.has(item.id) ? "equipped" : ""} ${picked ? "picked" : ""}`}
                          style={{ "--rarity": item.rarity } as React.CSSProperties}
                        >
                          <button
                            className="iv-tile-main"
                            onClick={() => (w ? openWeapon(w, canHold(item.team, side) ? side : (item.team as Side), item) : undefined)}
                            {...menuProps(target)}
                          >
                            <span className="iv-tile-art">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.image} alt="" loading="lazy" />
                            </span>
                            <span className="iv-tile-name">{item.weaponName}</span>
                            <span className="iv-tile-sub">{skinLabel(item.skinName)}</span>
                            {StatBadges({ item })}
                          </button>
                          <input
                            type="checkbox"
                            className="iv-pick"
                            checked={picked}
                            aria-label={t("inv.select", { name: item.skinName })}
                            onChange={(e) => {
                              const n = new Set(selectedItems);
                              if (e.target.checked) n.add(item.id);
                              else n.delete(item.id);
                              setSelectedItems(n);
                            }}
                          />
                          {MenuButton({ target: target, label: item.skinName })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ),
          )
        )}
      </>
    );
  };

  /** Bulk actions, only once something is selected. */
  const SelectionBar = () => {
    if (armoryMode === "vault" && selectedItems.size > 0) {
      const items = store.items.filter((i) => selectedItems.has(i.id));
      return (
        <div className="iv-selbar">
          <span className="num">{t("inv.sel.count", { n: selectedItems.size })}</span>
          <button
            className="iv-btn primary"
            onClick={() => {
              const defs = new Set(items.map((i) => `${i.kind}:${i.kind === "weapon" ? i.weaponDef : ""}`));
              if (defs.size !== items.length) return showToast(t("inv.toast.sameSlot"));
              setStore((cur) => ({
                ...cur,
                loadouts: cur.loadouts.map((l) => {
                  if (l.id !== cur.activeLoadoutId) return l;
                  let next = l;
                  for (const item of items)
                    for (const s of equipSides(item.team)) next = withSlot(next, item.kind as SlotKind, s, item.weaponDef, item.id);
                  return next;
                }),
              }));
              setSelectedItems(new Set());
              showToast(t("inv.toast.equippedMany", { n: items.length }));
            }}
          >
            <Check size={15} /> {t("inv.sel.equip", { side: bothSides ? "T + CT" : side.toUpperCase() })}
          </button>
          <button
            className="iv-btn danger"
            onClick={() => {
              deleteItems(new Set(selectedItems));
              setSelectedItems(new Set());
            }}
          >
            <Trash2 size={15} /> {t("auto.inventorysimulator.delete")}
          </button>
          <button className="iv-ghost-btn" onClick={() => setSelectedItems(new Set(vaultItems.map((i) => i.id)))}>{t("inv.sel.all")}</button>
          <button className="iv-icon-btn" onClick={() => setSelectedItems(new Set())} aria-label={t("inv.clear")}><X size={15} /></button>
        </div>
      );
    }
    if (armoryMode === "catalog" && weapon && selectedSkins.size > 0) {
      const picked = skins.filter((s) => selectedSkins.has(s.id));
      return (
        <div className="iv-selbar">
          <span className="num">{t("inv.sel.count", { n: selectedSkins.size })}</span>
          <button
            className="iv-btn"
            onClick={() => {
              for (const s of picked) equipSkin(s, weapon, undefined, true);
              setSelectedSkins(new Set());
            }}
          >
            <Archive size={15} /> {t("inv.menu.addToVault")}
          </button>
          <button
            className="iv-btn"
            onClick={() => {
              setStore((cur) => {
                const set = new Set(cur.favorites ?? []);
                for (const s of picked) set.add(skinKey(s.def, s.paint));
                return { ...cur, favorites: Array.from(set) };
              });
              setSelectedSkins(new Set());
            }}
          >
            <Heart size={15} /> {t("inv.menu.favourite")}
          </button>
          <button className="iv-ghost-btn" onClick={() => setSelectedSkins(new Set(shownSkins.map((s) => s.id)))}>{t("inv.sel.all")}</button>
          <button className="iv-icon-btn" onClick={() => setSelectedSkins(new Set())} aria-label={t("inv.clear")}><X size={15} /></button>
        </div>
      );
    }
    return null;
  };

  const borrowUrl = share && origin ? `${origin}/inventory?borrow=${share.key}` : "";
  const lo = activeLoadout;

  // ---------- Render ----------
  return (
    <div className={`iv ${armoryOpen ? "armory-open" : ""}`}>
      {/* ===== Loadouts ===== */}
      <aside className="iv-col iv-col-lo">
        {LoadoutList({})}
      </aside>

      {/* ===== Board ===== */}
      <main className="iv-col iv-col-board">
        {lo && (
          <header className="iv-head" style={{ "--lo": lo.color ?? "var(--color-neutral-500)" } as React.CSSProperties}>
            <div className="iv-head-id">
              <div className="iv-pop-wrap iv-lo-switch">
                <button
                  className="iv-btn"
                  data-pop-anchor
                  aria-expanded={loSwitcherOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLoSwitcherOpen((v) => !v);
                  }}
                >
                  {t("auto.inventorysimulator.loadouts")} <span className="num">{store.loadouts.length}</span>
                  <ChevronDown size={14} />
                </button>
                {loSwitcherOpen && (
                  <div className="iv-pop iv-pop-lo" onClick={(e) => e.stopPropagation()}>
                    {LoadoutList({ compact: true })}
                  </div>
                )}
              </div>

              <div className="iv-pop-wrap">
                <button
                  className="iv-swatch"
                  data-pop-anchor
                  style={{ background: lo.color ?? "var(--color-neutral-500)" }}
                  aria-label={t("inv.lo.colour")}
                  title={t("inv.lo.colour")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setColorOpen((v) => !v);
                  }}
                />
                {colorOpen && (
                  <div className="iv-pop iv-colors" onClick={(e) => e.stopPropagation()}>
                    {LOADOUT_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        className={`iv-swatch ${lo.color === c.hex ? "on" : ""}`}
                        style={{ background: c.hex }}
                        title={c.name}
                        aria-label={c.name}
                        onClick={() => {
                          patchLoadout(lo.id, { color: c.hex });
                          setColorOpen(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {renaming === `head-${lo.id}` ? (
                <form
                  className="iv-head-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
                    if (name) patchLoadout(lo.id, { name });
                    setRenaming(null);
                  }}
                >
                  <input
                    name="name"
                    className="iv-input iv-title-input"
                    defaultValue={lo.name}
                    autoFocus
                    maxLength={32}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                    onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                    aria-label={t("inv.lo.nameLabel")}
                  />
                </form>
              ) : (
                <h1 className="iv-title">
                  <button onClick={() => setRenaming(`head-${lo.id}`)} title={t("auto.inventorysimulator.rename")}>
                    {lo.name}
                    <Pencil size={14} className="iv-title-pen" aria-hidden />
                  </button>
                </h1>
              )}
              <button
                className={`iv-icon-btn star ${lo.favorite ? "on" : ""}`}
                aria-pressed={!!lo.favorite}
                title={t("inventory.loadouts.favourite")}
                aria-label={t("inventory.loadouts.favourite")}
                onClick={() => patchLoadout(lo.id, { favorite: !lo.favorite })}
              >
                <Star size={16} />
              </button>
              <span className="iv-hint-cmd" title={t("inv.lo.cmdTitle")}>
                <Terminal size={12} /> /loadout {lo.name}
              </span>
            </div>

            <div className="iv-head-stats">
              <div className="iv-meter" title={t("inv.meterTitle", { n: completeness.filled, total: completeness.total })}>
                <span className="iv-meter-label">
                  <span className="num">{completeness.filled}/{completeness.total}</span> {t("auto.inventorysimulator.dressed")}
                </span>
                <span className="iv-meter-track">
                  <span className="iv-meter-fill" style={{ width: `${completeness.pct}%` }} />
                </span>
              </div>
              {rarityBreakdown.length > 0 && (
                <div className="iv-rarities" aria-label={t("inv.rarities")}>
                  {rarityBreakdown.map((r) => (
                    <span key={r.hex} className="iv-rarity" title={`${r.count} × ${r.name}`} style={{ "--rarity": r.hex } as React.CSSProperties}>
                      <span className="num">{r.count}</span>
                    </span>
                  ))}
                </div>
              )}
              {seasonStats?.season && (
                <div className="iv-season" title={seasonStats.season}>
                  <span className="num">{seasonStats.seasonKills.toLocaleString()}</span>
                  <span>{t("auto.inventorysimulator.season_kills")} · {seasonStats.season}</span>
                </div>
              )}
            </div>

            <div className="iv-head-acts">
              <button className="iv-btn" disabled={shareBusy} onClick={() => shareLoadout(lo)}>
                {shareBusy ? <LoaderCircle size={15} className="iv-spin" /> : <Share2 size={15} />}
                {t("common.share")}
              </button>
              {session.authenticated && (
                <button className={`iv-btn primary ${equipState}`} disabled={equipState === "busy"} onClick={equipInGame}>
                  {equipState === "busy" ? <LoaderCircle size={15} className="iv-spin" /> : equipState === "done" ? <Check size={15} /> : <Gamepad2 size={15} />}
                  {equipState === "done" ? t("inv.equipped") : t("inv.equipInGame")}
                </button>
              )}
              {!armoryOpen && (
                <button className="iv-btn accent" onClick={() => openArmory()}>
                  <Search size={15} /> {t("inv.armory.open")}
                </button>
              )}
            </div>
          </header>
        )}

        <div className="iv-board">
          {SideColumn({ s: "t", board: boardT })}
          {SideColumn({ s: "ct", board: boardCT })}
        </div>

        {hydrated && !session.authenticated && (
          <div className="iv-guest">
            {t("auto.inventorysimulator.guest_saved_on_this_device")}{" "}
            <a href="/api/auth/steam/login">{t("auto.inventorysimulator.sign_in")}</a>{" "}
            {t("auto.inventorysimulator.to_sync_in_game")}
          </div>
        )}
      </main>

      {/* ===== Armory ===== */}
      {armoryOpen && (
        <section className="iv-col iv-col-armory" aria-label={t("inv.armory.title")}>
          <header className="iv-armory-head">
            <div className="iv-seg" role="tablist">
              <button role="tab" aria-selected={armoryMode === "catalog"} className={armoryMode === "catalog" ? "on" : ""} onClick={() => { setArmoryMode("catalog"); writeUrl({ armory: "1" }); }}>
                <Search size={14} /> {t("inv.armory.catalog")}
              </button>
              <button role="tab" aria-selected={armoryMode === "vault"} className={armoryMode === "vault" ? "on" : ""} onClick={() => { setArmoryMode("vault"); writeUrl({ armory: "vault" }); }}>
                <Archive size={14} /> {t("inv.armory.vault")} <span className="num">{store.items.length}</span>
              </button>
            </div>
            <div className="iv-target" role="group" aria-label={t("inv.armory.equipTo")}>
              <span className="iv-target-label">{t("inv.armory.equipTo")}</span>
              {SIDES.map((s) => (
                <button key={s} className={`iv-side-btn ${s} ${side === s ? "on" : ""}`} aria-pressed={side === s} onClick={() => { setSide(s); writeUrl({ side: s }); if (weapon) loadFinish(itemForEntry(weapon, s)); }}>
                  {s.toUpperCase()}
                </button>
              ))}
              <button className={`iv-side-btn both ${bothSides ? "on" : ""}`} aria-pressed={bothSides} title={t("inv.armory.bothTitle")} onClick={() => setBothSides((v) => !v)}>
                <LinkIcon size={12} /> {t("inv.armory.both")}
              </button>
            </div>
            <button className="iv-icon-btn" onClick={closeArmory} aria-label={t("inv.armory.close")} title={t("inv.armory.close")}>
              <X size={16} />
            </button>
          </header>
          <div className="iv-armory-scroll" ref={armoryScroll}>
            {armoryMode === "vault" ? VaultView() : weapon ? WeaponView({ w: weapon }) : CatalogView()}
          </div>
          {SelectionBar()}
        </section>
      )}

      {/* ===== Dialogs ===== */}
      {share && (
        <div className="iv-modal" role="dialog" aria-modal="true" aria-labelledby="iv-share-title" onClick={() => setShare(null)}>
          <div className="iv-modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="iv-modal-head">
              <Share2 size={18} aria-hidden />
              <h2 id="iv-share-title">
                {t("auto.inventorysimulator.share")} <span className="iv-modal-sub">{share.name}</span>
              </h2>
              <button className="iv-icon-btn" onClick={() => setShare(null)} aria-label={t("auto.inventorysimulator.done")}>
                <X size={16} />
              </button>
            </header>
            <p className="iv-muted">{t("auto.inventorysimulator.anyone_with_this_key_can_borro")}</p>
            <div className="iv-share-key num">{share.key}</div>
            <div className="iv-share-rows">
              {[
                { id: "link", label: t("auto.inventorysimulator.link"), value: borrowUrl, icon: <LinkIcon size={14} /> },
                { id: "cmd", label: t("auto.inventorysimulator.in_game"), value: `/borrow ${share.key}`, icon: <Terminal size={14} /> },
              ].map((row) => (
                <div key={row.id} className="iv-share-row">
                  <span className="iv-field-label">{row.icon} {row.label}</span>
                  <code>{row.value}</code>
                  <button className="iv-btn" onClick={() => copy(row.value, row.id)}>
                    {copied === row.id ? <Check size={14} /> : <Copy size={14} />}
                    {copied === row.id ? t("inv.copied") : t("inv.copy")}
                  </button>
                </div>
              ))}
            </div>
            <div className="iv-modal-foot">
              <button className="iv-btn primary" onClick={() => setShare(null)}>{t("auto.inventorysimulator.done")}</button>
            </div>
          </div>
        </div>
      )}

      {renderMenu()}

      {toast && <div className="iv-toast" role="status">{toast}</div>}

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
          charmSeed={currentOnThisWeapon ? charmSeed(currentOnThisWeapon) : undefined}
          onSave={(nextStickers, nextCharm) => {
            setStickers(nextStickers);
            setCharm(nextCharm);
            commitStickerEdit(nextStickers, nextCharm);
            setEditor3dOpen(false);
          }}
          onClose={() => setEditor3dOpen(false)}
        />
      )}

      {radioFor && <RadioCommandsModal agentId={radioFor.id} agentName={radioFor.name} onClose={() => setRadioFor(null)} />}
    </div>
  );
}

function supportsWearFor(kind: SlotKind) {
  return kind === "weapon" || kind === "knife" || kind === "gloves";
}
function supportsStickerKind(kind: SlotKind) {
  return kind === "weapon" || kind === "agent";
}
