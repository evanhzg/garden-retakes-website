"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Users, Package, StickyNote, Ban, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import BundlePicker from "@/components/retakes/BundlePicker";
import MapPreferences from "@/components/retakes/MapPreferences";
import RetakesIcon from "@/components/retakes/RetakesIcon";
import { ROLE_ICON } from "@/components/retakes/roleIcons";
import { RETAKES_MAPS, mapName } from "@/lib/maps";
import {
  ROLES,
  SLOT_FOR_ROUND,
  type BundleSelection,
  type RoundKind,
  type Side,
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

// Your Blitz loadout.
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
  /** The choice. Armour, grenades and the kit are read out of it server-side. */
  bundles: BundleSelection;
  /** Guns picked outside a bundle; they layer over it rather than replacing it. */
  weapons: WeaponPrefs;
  roleT: string;
  roleCt: string;
  isCaller: boolean;
  notes: string;
};

const EMPTY: Loadout = {
  bundles: {},
  weapons: {},
  roleT: "",
  roleCt: "",
  isCaller: false,
  notes: "",
};

const SIDES: Side[] = ["T", "CT"];

/**
 * `glyph` is one of the hand-drawn set, `Icon` a lucide fallback for the two
 * jobs nothing in that set covers — the existing rule of thumb, not a second
 * icon system.
 */
const TABS = [
  { id: "loadout", labelKey: "loadout.tab.loadout", glyph: "loadout", Icon: Package },
  { id: "maps", labelKey: "loadout.tab.maps", glyph: "maps", Icon: null },
  { id: "role", labelKey: "loadout.tab.role", glyph: null, Icon: Users },
  { id: "notes", labelKey: "loadout.tab.notes", glyph: null, Icon: StickyNote },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Only anchor/rotator hold a specific site — every other role is the same job map-wide. */
const SITE_ROLES = new Set(["anchor", "rotator"]);
const SITES = ["A", "B"] as const;

type MapRole = { map: string; side: Side; roleId: string; site: "A" | "B" | null };

/** The pool, as the map-role grid wants it. One table, in lib/maps. */
const MAP_POOL = RETAKES_MAPS.map((id) => ({ id, label: mapName(id) }));

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
                <img src={`/maps/${m.id}.webp`} alt="" loading="lazy" draggable={false} />
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
    // The tint used to be a hex written out here. It is a token now, so this
    // side and every other T/CT surface on the site move together.
    <div
      className="lo-side-col"
      style={{ ["--chip-tint" as string]: `var(--color-team-${side.toLowerCase()})` }}
    >
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

  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/loadout")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setLoadout(
          d
            ? {
                bundles: d.bundles ?? {},
                weapons: d.weapons ?? {},
                roleT: d.roleT,
                roleCt: d.roleCt,
                isCaller: d.isCaller ?? false,
                notes: d.notes,
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

  /** Choose (or clear) the option one side takes for one round type. */
  const setBundle = (side: Side, kind: RoundKind, bundleId: string | null) =>
    patch((l) => {
      const forSide = { ...(l.bundles[side] ?? {}) };
      if (bundleId) forSide[kind] = bundleId;
      else delete forSide[kind];
      return { ...l, bundles: { ...l.bundles, [side]: forSide } };
    });

  /**
   * A gun chosen outside any option.
   *
   * Layered over the option rather than replacing it: swapping the rifle in
   * "Rifle + full util" for an AUG should keep the armour and the grenades,
   * because that is what swapping one gun means. Clearing it hands the slot
   * back to whatever the option asked for.
   */
  const setWeaponOverride = (side: Side, kind: RoundKind, itemId: number | null) =>
    patch((l) => {
      const slot = SLOT_FOR_ROUND[kind];
      const forSide = { ...(l.weapons[side] ?? {}) };
      if (itemId === null) delete forSide[slot];
      else forSide[slot] = itemId;
      return { ...l, weapons: { ...l.weapons, [side]: forSide } };
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
          bundles: json.bundles ?? {},
          weapons: json.weapons ?? {},
          roleT: json.roleT,
          roleCt: json.roleCt,
          isCaller: json.isCaller ?? false,
          notes: json.notes,
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
            {TABS.map(({ id, labelKey, glyph, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={`lo-tab ${tab === id ? "on" : ""}`}
                onClick={() => setTab(id)}
              >
                {glyph ? <RetakesIcon id={glyph} size={15} /> : Icon ? <Icon size={15} /> : null}
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

            <BundlePicker
              selection={loadout.bundles}
              weapons={loadout.weapons}
              weaponIcons={icons.weapons}
              onPick={setBundle}
              onWeapon={setWeaponOverride}
            />
          </motion.section>
          )}

          {tab === "maps" && (
          <motion.section key="maps" className="lo-panel" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            <header className="lo-panel-head">
              <h2>{t("loadout.maps.title")}</h2>
              <span className="lo-tag game">{t("loadout.ingame")}</span>
            </header>
            <MapPreferences />
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

    </div>
  );
}
