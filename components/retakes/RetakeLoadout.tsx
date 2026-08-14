"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crosshair, Ghost, Target, Anchor, RotateCcw, Mic, Users, Package, StickyNote, Ban, X, ShieldPlus, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  DEFAULT_UTILITY,
  ITEMS,
  ROLES,
  ROUND_KINDS,
  SLOTS,
  UTILITY,
  choicesFor,
  type RoundKind,
  type Side,
  type Slot,
  type UtilityId,
  type UtilityPrefs,
  type WeaponPrefs,
} from "@/lib/retakeLoadout";
import "@/app/loadout/loadout.css";

/**
 * Icon URLs resolved on the server from the item catalog.
 *
 * Typed loosely on purpose — the shape comes from `getLoadoutIcons()` in a
 * server-only module, and importing that type here would drag the catalog into
 * the client bundle.
 */
type Icons = {
  weapons: Record<number, string>;
  utility: Record<Side, Record<string, string>>;
};

// Your competitive retakes loadout.
//
// Organised by round type rather than by weapon slot, because that is the
// decision people actually make — "on a full buy I want the AK" — and it puts
// the pistol round, the half buy and the full buy next to each other where they
// can be compared. T and CT sit side by side within each section rather than
// behind a side tab: setting up a loadout means touching both sides, and a tab
// just turned that into re-visiting every section twice.
//
// The page is explicit about which half of it the server obeys. Weapons are
// read by the allocator on every buy round; role, notes and the pistol-round
// kevlar preference are currently for your team to read, and saying so is
// better than implying the server is quietly ignoring you.

type Loadout = {
  weapons: WeaponPrefs;
  roleT: string;
  roleCt: string;
  isCaller: boolean;
  utility: UtilityPrefs;
  notes: string;
  kevlarPistolT: boolean;
  kevlarPistolCt: boolean;
};

const EMPTY: Loadout = {
  weapons: {},
  roleT: "",
  roleCt: "",
  isCaller: false,
  utility: DEFAULT_UTILITY,
  notes: "",
  kevlarPistolT: false,
  kevlarPistolCt: false,
};

const ROUND_SLOTS: Record<RoundKind, Slot[]> = {
  pistol: ["PistolRound"],
  half: ["HalfBuyPrimary", "Secondary"],
  full: ["FullBuyPrimary", "Secondary"],
};

const SIDES: Side[] = ["T", "CT"];

/** Side accent, used as the tint behind every buy-menu-style icon chip. */
const SIDE_TINT: Record<Side, string> = { T: "#e0a94a", CT: "#6aa9e0" };

const ROLE_ICON: Record<string, LucideIcon> = {
  sniper: Crosshair,
  lurker: Ghost,
  rifler: Target,
  anchor: Anchor,
  rotator: RotateCcw,
};

/** The cheap pistol-round buy for each side — the one a kevlar toggle makes sense next to. */
const CHEAP_PISTOL: Record<Side, number> = { T: ITEMS.Glock, CT: ITEMS.USPS };

/**
 * A pick button's face: the item's icon, or its name when there is no icon.
 *
 * The old version hid the image on error and left the button completely empty,
 * so a gun the icon source did not have was indistinguishable from no gun at
 * all. A button on a settings page must always say what it does, so the name is
 * the fallback rather than nothing.
 */
function PickIcon({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="lo-icon-chip">
      {!src || failed ? (
        <span className="lo-pick-name">{name}</span>
      ) : (
        <img
          src={src}
          alt={name}
          className="lo-weapon-img"
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

const TABS = [
  { id: "role", labelKey: "loadout.tab.role", Icon: Users },
  { id: "loadout", labelKey: "loadout.tab.loadout", Icon: Package },
  { id: "notes", labelKey: "loadout.tab.notes", Icon: StickyNote },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Only anchor/rotator hold a specific site — every other role is the same job map-wide. */
const SITE_ROLES = new Set(["anchor", "rotator"]);
const SITES = ["A", "B"] as const;

type MapRole = { map: string; side: Side; roleId: string; site: "A" | "B" | null };

/**
 * The ten-map competitive pool, mirrored from RetakesLobby's own MAP_LABEL —
 * duplicated rather than imported, the same trade that file already made:
 * a client component pulling from another page's component would drag its
 * whole socket-driven lobby bundle along for one lookup table.
 */
const MAP_POOL: { id: string; label: string }[] = [
  { id: "de_mirage", label: "Mirage" },
  { id: "de_inferno", label: "Inferno" },
  { id: "de_nuke", label: "Nuke" },
  { id: "de_overpass", label: "Overpass" },
  { id: "de_vertigo", label: "Vertigo" },
  { id: "de_ancient", label: "Ancient" },
  { id: "de_anubis", label: "Anubis" },
  { id: "de_dust2", label: "Dust II" },
  { id: "de_train", label: "Train" },
  { id: "de_cache", label: "Cache" },
];

/** Every selectable option for one side inside the bubble: a role, optionally split into its sites. */
type RoleOption = { roleId: string; site: "A" | "B" | null; label: string };

function bubbleOptions(side: Side): RoleOption[] {
  return ROLES.filter((r) => r.side === side || r.side === "both").flatMap((r): RoleOption[] =>
    SITE_ROLES.has(r.id)
      ? SITES.map((s) => ({ roleId: r.id, site: s, label: `${r.id} ${s}` }))
      : [{ roleId: r.id, site: null, label: r.id }]
  );
}

/**
 * The themed bubble a map card opens: T and CT role choices for that one map,
 * plus a barred circle to clear whichever side you clear. Setting both sides'
 * overrides for a map now takes one open, not two trips through a side tab.
 */
function RoleBubble({
  mapLabel,
  rows,
  onPick,
  onClose,
}: {
  mapLabel: string;
  rows: MapRole[];
  onPick: (side: Side, roleId: string, site: "A" | "B" | null) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="lo-bubble-scrim" onClick={onClose}>
      <motion.div
        className="lo-bubble"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.92, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 6 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
      >
        <div className="lo-bubble-head">
          <h4>{mapLabel}</h4>
          <button className="lo-bubble-close" onClick={onClose} aria-label={t("loadout.maprole.close")}>
            <X size={15} />
          </button>
        </div>

        {SIDES.map((side) => {
          const current = rows.find((r) => r.side === side);
          return (
            <div key={side} className="lo-bubble-side">
              <span className="lo-bubble-side-label">{t(`loadout.side.${side}`)}</span>
              <div className="lo-bubble-options">
                {bubbleOptions(side).map((opt) => {
                  const Icon = ROLE_ICON[opt.roleId];
                  const on = current?.roleId === opt.roleId && (current?.site ?? null) === opt.site;
                  return (
                    <button
                      key={opt.label}
                      className={`lo-bubble-option ${on ? "on" : ""}`}
                      onClick={() => onPick(side, opt.roleId, opt.site)}
                    >
                      <Icon size={14} />
                      {t(`loadout.role.${opt.roleId}`)}
                      {opt.site && ` ${opt.site}`}
                    </button>
                  );
                })}
                <button
                  className={`lo-bubble-option none ${!current ? "on" : ""}`}
                  onClick={() => onPick(side, "", null)}
                >
                  <Ban size={14} />
                  {t("loadout.maprole.none")}
                </button>
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

/**
 * Per-map role overrides, layered on top of the global role picked in the
 * Role tab above. A separate table behind a separate endpoint, so it gets
 * its own small save state rather than folding into the page's one dirty
 * flag — most players will never touch this, and making every visitor's
 * autosave wait on a table they don't use would be the wrong trade.
 */
function MapRoleOverrides() {
  const { t } = useI18n();
  const [rows, setRows] = useState<MapRole[] | null>(null);
  const [openMap, setOpenMap] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/loadout/map-role")
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => setRows(d.rows ?? []))
      .catch(() => setRows([]));
  }, []);

  const save = async (map: string, side: Side, roleId: string, site: "A" | "B" | null) => {
    setBusy(true);
    try {
      const res = await fetch("/api/loadout/map-role", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ map, side, roleId, site }),
      });
      if (!res.ok) return;
      setRows((prev) => {
        const rest = (prev ?? []).filter((x) => !(x.map === map && x.side === side));
        return roleId ? [...rest, { map, side, roleId, site }] : rest;
      });
    } finally {
      setBusy(false);
    }
  };

  const openCard = MAP_POOL.find((m) => m.id === openMap);
  const openRows = (rows ?? []).filter((r) => r.map === openMap);

  return (
    <div className="lo-maproles">
      <h3>{t("loadout.maprole.title")}</h3>
      <p className="lo-hint">{t("loadout.maprole.hint")}</p>

      <div className="lo-mapgrid">
        {MAP_POOL.map((m) => {
          const mapRows = (rows ?? []).filter((r) => r.map === m.id);
          const badge = mapRows[0];
          const Icon = badge ? ROLE_ICON[badge.roleId] : null;
          return (
            <button
              key={m.id}
              className={`lo-mapcard ${mapRows.length > 0 ? "has-override" : ""}`}
              onClick={() => setOpenMap(m.id)}
            >
              <span className="lo-mapcard-art">
                <img src={`/maps/${m.id}.png`} alt="" loading="lazy" draggable={false} />
                {Icon && (
                  <span className="lo-mapcard-badge">
                    <span className="lo-mapcard-badge-icon">
                      <Icon size={17} />
                    </span>
                    {mapRows.length > 1 && (
                      <span className="lo-mapcard-badge-site">{mapRows.length} sides set</span>
                    )}
                    {mapRows.length === 1 && badge.site && (
                      <span className="lo-mapcard-badge-site">{badge.side} · {badge.site}</span>
                    )}
                  </span>
                )}
              </span>
              <span className="lo-mapcard-name">{m.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {openCard && (
          <RoleBubble
            mapLabel={openCard.label}
            rows={openRows}
            onPick={(side, roleId, site) => {
              if (!busy) save(openCard.id, side, roleId, site);
            }}
            onClose={() => setOpenMap(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** One side's role picker, shown in a column next to the other side's — no tab between them. */
function RoleColumn({
  side,
  role,
  isCaller,
  onSetRole,
  onToggleCaller,
}: {
  side: Side;
  role: string;
  isCaller: boolean;
  onSetRole: (id: string) => void;
  onToggleCaller: () => void;
}) {
  const { t } = useI18n();
  const roles = useMemo(() => ROLES.filter((r) => r.side === side || r.side === "both"), [side]);

  return (
    <div className="lo-side-col" style={{ ["--chip-tint" as string]: SIDE_TINT[side] }}>
      <span className={`lo-side-col-label ${side.toLowerCase()}`}>{t(`loadout.side.${side}`)}</span>
      <div className="lo-roles">
        {roles.map((r) => {
          const Icon = ROLE_ICON[r.id];
          return (
            <button key={r.id} className={`lo-role ${role === r.id ? "on" : ""}`} onClick={() => onSetRole(role === r.id ? "" : r.id)}>
              <span className="lo-role-name">
                <Icon size={16} />
                {t(`loadout.role.${r.id}`)}
              </span>
              <span className="lo-role-desc">{t(`loadout.role.${r.id}.desc`)}</span>
            </button>
          );
        })}
        {/* isCaller is one flag, not per-side — shown once, in the T column,
            rather than as two buttons that would have to stay in sync. */}
        {side === "T" && (
          <button className={`lo-role ${isCaller ? "on" : ""}`} onClick={onToggleCaller}>
            <span className="lo-role-name">
              <Mic size={16} />
              {t("loadout.role.caller")}
            </span>
            <span className="lo-role-desc">{t("loadout.role.caller.desc")}</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function RetakeLoadoutPage({
  signedIn,
  icons = { weapons: {}, utility: { T: {}, CT: {} } },
}: {
  signedIn: boolean;
  icons?: Icons;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>("role");
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [hoveredItem, setHoveredItem] = useState<{ name: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/loadout")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setLoadout(
          d
            ? {
                weapons: d.weapons,
                roleT: d.roleT,
                roleCt: d.roleCt,
                isCaller: d.isCaller ?? false,
                utility: d.utility,
                notes: d.notes,
                kevlarPistolT: d.kevlarPistolT ?? false,
                kevlarPistolCt: d.kevlarPistolCt ?? false,
              }
            : EMPTY
        )
      )
      .catch(() => setLoadout(EMPTY));
  }, [signedIn]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  const patch = useCallback((fn: (l: Loadout) => Loadout) => {
    setLoadout((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
  }, []);

  const setWeapon = (side: Side, slot: Slot, itemId: number | null) =>
    patch((l) => ({
      ...l,
      weapons: {
        ...l.weapons,
        [side]: { ...(l.weapons[side] ?? {}), [slot]: itemId ?? undefined },
      },
    }));

  /** Click to add, click again to remove; order is the preference order. */
  const toggleUtility = (kind: RoundKind, id: UtilityId) =>
    patch((l) => {
      const current = l.utility[kind] ?? [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return { ...l, utility: { ...l.utility, [kind]: next } };
    });

  const save = async () => {
    if (!loadout || saving) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch("/api/loadout", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(loadout),
      });
      const json = await res.json();
      if (!res.ok) {
        setNote({ kind: "err", text: json.error ?? t("loadout.savefailed") });
      } else {
        setLoadout({
          weapons: json.weapons,
          roleT: json.roleT,
          roleCt: json.roleCt,
          isCaller: json.isCaller ?? false,
          utility: json.utility,
          notes: json.notes,
          kevlarPistolT: json.kevlarPistolT ?? false,
          kevlarPistolCt: json.kevlarPistolCt ?? false,
        });
        setDirty(false);
        setNote({ kind: "ok", text: t("loadout.saved") });
      }
    } catch {
      setNote({ kind: "err", text: t("loadout.savefailed") });
    } finally {
      setSaving(false);
    }
  };

  if (!signedIn) {
    return (
      <div className="lo">
        <section className="lo-gate">
          <span className="lo-kicker">{t("loadout.kicker")}</span>
          <h1>{t("loadout.title")}</h1>
          <p className="muted">{t("loadout.signinblurb")}</p>
          <a className="btn btn-primary" href="/api/auth/steam/login">
            {t("lobby.signin")}
          </a>
        </section>
      </div>
    );
  }

  return (
    <div className="lo">
      <section className="lo-hero">
        <span className="lo-kicker">{t("loadout.kicker")}</span>
        <h1>{t("loadout.title")}</h1>
        <p className="muted">{t("loadout.blurb")}</p>
      </section>

      {!loadout ? (
        <p className="muted lo-loading">{t("loadout.loading")}</p>
      ) : (
        <>
          <div className="lo-tabs" role="tablist">
            {TABS.map(({ id, labelKey, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={`lo-tab ${tab === id ? "on" : ""}`}
                onClick={() => setTab(id)}
              >
                <Icon size={15} />
                {t(labelKey)}
                {id === "role" && loadout.isCaller && <span className="lo-tab-badge">C</span>}
                {tab === id && (
                  <motion.span className="lo-tab-underline" layoutId="lo-tab-underline" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
          {tab === "role" && (
          <motion.section key="role" className="lo-panel" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            <header className="lo-panel-head">
              <h2>{t("loadout.role")}</h2>
              <span className="lo-tag web">{t("loadout.teamonly")}</span>
            </header>
            <p className="lo-hint">{t("loadout.rolehint")}</p>
            <div className="lo-side-grid">
              <RoleColumn
                side="T"
                role={loadout.roleT}
                isCaller={loadout.isCaller}
                onSetRole={(id) => patch((l) => ({ ...l, roleT: id }))}
                onToggleCaller={() => patch((l) => ({ ...l, isCaller: !l.isCaller }))}
              />
              <RoleColumn
                side="CT"
                role={loadout.roleCt}
                isCaller={loadout.isCaller}
                onSetRole={(id) => patch((l) => ({ ...l, roleCt: id }))}
                onToggleCaller={() => patch((l) => ({ ...l, isCaller: !l.isCaller }))}
              />
            </div>

            <MapRoleOverrides />
          </motion.section>
          )}

          {tab === "loadout" && (
          <motion.section key="loadout" className="lo-panel" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            <header className="lo-panel-head">
              <h2>{t("loadout.weapons")}</h2>
              <span className="lo-tag game">{t("loadout.ingame")}</span>
            </header>
            <p className="lo-hint">{t("loadout.weaponhint")}</p>

            <div className="lo-rounds">
              {ROUND_KINDS.map((kind) => (
                <div key={kind} className="lo-round">
                  <h3>{t(`loadout.round.${kind}`)}</h3>
                  <p className="lo-round-sub">{t(`loadout.round.${kind}.sub`)}</p>

                  <div className="lo-side-grid">
                    {SIDES.map((side) => (
                      <div key={side} className="lo-side-col" style={{ ["--chip-tint" as string]: SIDE_TINT[side] }}>
                        <span className={`lo-side-col-label ${side.toLowerCase()}`}>{t(`loadout.side.${side}`)}</span>

                        {ROUND_SLOTS[kind].map((slot) => {
                          const meta = SLOTS.find((s) => s.id === slot)!;
                          const options = choicesFor(slot, side);
                          const value = loadout.weapons[side]?.[slot] ?? null;
                          return (
                            <div key={slot} className="lo-slot">
                              <span className="lo-slot-label">{t(meta.labelKey)}</span>
                              <div className="lo-picks">
                                {options.map((o) => (
                                  <button
                                    key={o.id}
                                    className={`lo-pick weapon ${value === o.id ? "on" : ""}`}
                                    aria-label={o.name}
                                    aria-pressed={value === o.id}
                                    onClick={() => setWeapon(side, slot, o.id)}
                                    onMouseEnter={(e) => setHoveredItem({ name: o.name, x: e.clientX, y: e.clientY })}
                                    onMouseMove={(e) => setHoveredItem((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null))}
                                    onMouseLeave={() => setHoveredItem(null)}
                                  >
                                    <PickIcon src={icons.weapons[o.id]} name={o.name} />
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}

                        {kind === "pistol" && loadout.weapons[side]?.PistolRound === CHEAP_PISTOL[side] && (
                          <button
                            className={`lo-kevlar ${(side === "T" ? loadout.kevlarPistolT : loadout.kevlarPistolCt) ? "on" : ""}`}
                            onClick={() =>
                              patch((l) =>
                                side === "T"
                                  ? { ...l, kevlarPistolT: !l.kevlarPistolT }
                                  : { ...l, kevlarPistolCt: !l.kevlarPistolCt }
                              )
                            }
                          >
                            <ShieldPlus size={15} />
                            {t("loadout.kevlar")}
                          </button>
                        )}

                        <div className="lo-slot">
                          <span className="lo-slot-label">{t("loadout.utility")}</span>
                          <div className="lo-picks">
                            {UTILITY.map((u) => {
                              const order = (loadout.utility[kind] ?? []).indexOf(u);
                              const label = t(`utility.type.${u}`);
                              return (
                                <button
                                  key={u}
                                  className={`lo-pick util ${order >= 0 ? "on" : ""}`}
                                  aria-label={label}
                                  aria-pressed={order >= 0}
                                  onClick={() => toggleUtility(kind, u)}
                                  onMouseEnter={(e) => setHoveredItem({ name: label, x: e.clientX, y: e.clientY })}
                                  onMouseMove={(e) => setHoveredItem((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null))}
                                  onMouseLeave={() => setHoveredItem(null)}
                                >
                                  {order >= 0 && <span className="lo-order">{order + 1}</span>}
                                  <PickIcon src={icons.utility[side]?.[u]} name={label} />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
          )}

          {tab === "notes" && (
          <motion.section key="notes" className="lo-panel" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            <header className="lo-panel-head">
              <h2>{t("loadout.notes")}</h2>
              <span className="lo-tag web">{t("loadout.teamonly")}</span>
            </header>
            <textarea
              className="lo-notes"
              value={loadout.notes}
              maxLength={300}
              placeholder={t("loadout.notesplaceholder")}
              onChange={(e) => patch((l) => ({ ...l, notes: e.target.value }))}
            />
          </motion.section>
          )}
          </AnimatePresence>

          <div className="lo-save">
            <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
              {saving ? t("loadout.saving") : dirty ? t("loadout.save") : t("loadout.savedstate")}
            </button>
            {note && (
              <span className={`lo-note ${note.kind}`}>{note.text}</span>
            )}
          </div>
        </>
      )}

      {hoveredItem && (
        <div style={{ position: "fixed", top: hoveredItem.y + 15, left: hoveredItem.x + 15, background: "rgba(0,0,0,0.85)", color: "white", padding: "6px 10px", borderRadius: "6px", pointerEvents: "none", zIndex: 9999, fontSize: "14px", fontWeight: "bold", border: "1px solid rgba(255,255,255,0.1)", whiteSpace: "nowrap" }}>
          {hoveredItem.name}
        </div>
      )}
    </div>
  );
}
