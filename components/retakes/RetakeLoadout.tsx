"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crosshair, Ghost, Target, Anchor, RotateCcw, Mic, Users, Package, StickyNote } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  DEFAULT_UTILITY,
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
import { MAPS } from "@/lib/utilityShared";
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
// can be compared.
//
// The page is explicit about which half of it the server obeys. Weapons are
// read by the allocator on every buy round; role and utility preference are
// currently for your team to read, and saying so is better than implying the
// server is quietly ignoring you.

type Loadout = {
  weapons: WeaponPrefs;
  roleT: string;
  roleCt: string;
  isCaller: boolean;
  utility: UtilityPrefs;
  notes: string;
};

const EMPTY: Loadout = { weapons: {}, roleT: "", roleCt: "", isCaller: false, utility: DEFAULT_UTILITY, notes: "" };

const ROUND_SLOTS: Record<RoundKind, Slot[]> = {
  pistol: ["PistolRound"],
  half: ["HalfBuyPrimary", "Secondary"],
  full: ["FullBuyPrimary", "Secondary"],
};

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

/** Side accent, used as the tint behind every buy-menu-style icon chip. */
const SIDE_TINT: Record<Side, string> = { T: "#e0a94a", CT: "#6aa9e0" };

/** Only anchor/rotator hold a specific site — every other role is the same job map-wide. */
const SITE_ROLES = new Set(["anchor", "rotator"]);
const SITES = ["A", "B"] as const;

type MapRole = { map: string; side: Side; roleId: string; site: "A" | "B" | null };

/**
 * Per-map role overrides, layered on top of the global role picked above.
 *
 * A separate table behind a separate endpoint, so it gets its own small save
 * state rather than folding into the page's one dirty flag — most players
 * will never touch this, and making every visitor's autosave wait on a table
 * they don't use would be the wrong trade.
 */
function MapRoleOverrides({ side }: { side: Side }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<MapRole[] | null>(null);
  const [map, setMap] = useState("");
  const [roleId, setRoleId] = useState("");
  const [site, setSite] = useState<"A" | "B" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/loadout/map-role")
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => setRows(d.rows ?? []))
      .catch(() => setRows([]));
  }, []);

  const sideRoles = ROLES.filter((r) => r.side === side || r.side === "both");
  const sideRows = (rows ?? []).filter((r) => r.side === side);

  const save = async (m: string, s: Side, r: string, st: "A" | "B" | null) => {
    setBusy(true);
    try {
      const res = await fetch("/api/loadout/map-role", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ map: m, side: s, roleId: r, site: st }),
      });
      if (!res.ok) return;
      setRows((prev) => {
        const rest = (prev ?? []).filter((x) => !(x.map === m && x.side === s));
        return r ? [...rest, { map: m, side: s, roleId: r, site: st }] : rest;
      });
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    if (!map || !roleId) return;
    save(map, side, roleId, SITE_ROLES.has(roleId) ? site : null);
    setMap("");
    setRoleId("");
    setSite(null);
  };

  return (
    <div className="lo-maproles">
      <h3>{t("loadout.maprole.title")}</h3>
      <p className="lo-hint">{t("loadout.maprole.hint")}</p>

      {sideRows.length > 0 && (
        <ul className="lo-maprole-list">
          {sideRows.map((r) => (
            <li key={r.map}>
              <span className="lo-maprole-map">{MAPS[r.map]?.label ?? r.map}</span>
              <span className="lo-maprole-role">
                {t(`loadout.role.${r.roleId}`)}
                {r.site && <span className="lo-maprole-site">{r.site}</span>}
              </span>
              <button
                className="btn btn-ghost lo-maprole-remove"
                disabled={busy}
                onClick={() => save(r.map, side, "", null)}
              >
                {t("loadout.maprole.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="lo-maprole-add">
        <select value={map} onChange={(e) => setMap(e.target.value)} className="input">
          <option value="">{t("loadout.maprole.pickmap")}</option>
          {Object.entries(MAPS)
            .filter(([id]) => !sideRows.some((r) => r.map === id))
            .map(([id, m]) => (
              <option key={id} value={id}>{m.label}</option>
            ))}
        </select>
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="input">
          <option value="">{t("loadout.maprole.pickrole")}</option>
          {sideRoles.map((r) => (
            <option key={r.id} value={r.id}>{t(`loadout.role.${r.id}`)}</option>
          ))}
        </select>
        {roleId && SITE_ROLES.has(roleId) && (
          <div className="lo-maprole-sites">
            {SITES.map((s) => (
              <button
                key={s}
                type="button"
                className={`lo-maprole-sitebtn ${site === s ? "on" : ""}`}
                onClick={() => setSite(site === s ? null : s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <button className="btn btn-secondary" disabled={!map || !roleId || busy} onClick={add}>
          {t("loadout.maprole.add")}
        </button>
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
  const [side, setSide] = useState<Side>("T");
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
      .then((d) => setLoadout(d ? { weapons: d.weapons, roleT: d.roleT, roleCt: d.roleCt, isCaller: d.isCaller ?? false, utility: d.utility, notes: d.notes } : EMPTY))
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

  const setWeapon = (slot: Slot, itemId: number | null) =>
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
        setLoadout({ weapons: json.weapons, roleT: json.roleT, roleCt: json.roleCt, isCaller: json.isCaller ?? false, utility: json.utility, notes: json.notes });
        setDirty(false);
        setNote({ kind: "ok", text: t("loadout.saved") });
      }
    } catch {
      setNote({ kind: "err", text: t("loadout.savefailed") });
    } finally {
      setSaving(false);
    }
  };

  const roles = useMemo(() => ROLES.filter((r) => r.side === side || r.side === "both"), [side]);
  const role = side === "T" ? loadout?.roleT : loadout?.roleCt;
  const setRole = (id: string) =>
    patch((l) => (side === "T" ? { ...l, roleT: id } : { ...l, roleCt: id }));

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
    <div className="lo" style={{ ["--chip-tint" as string]: SIDE_TINT[side] }}>
      <section className="lo-hero">
        <span className="lo-kicker">{t("loadout.kicker")}</span>
        <h1>{t("loadout.title")}</h1>
        <p className="muted">{t("loadout.blurb")}</p>
      </section>

      <div className="lo-sidebar-tabs" role="tablist">
        {(["T", "CT"] as Side[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={side === s}
            className={`lo-sidetab ${s.toLowerCase()} ${side === s ? "on" : ""}`}
            onClick={() => setSide(s)}
          >
            {t(`loadout.side.${s}`)}
          </button>
        ))}
      </div>

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
            <div className="lo-roles">
              {roles.map((r) => (
                <button
                  key={r.id}
                  className={`lo-role ${role === r.id ? "on" : ""}`}
                  onClick={() => setRole(role === r.id ? "" : r.id)}
                >
                  <span className="lo-role-name">
                    {r.id === 'sniper' && <Crosshair size={16} style={{marginRight: 6, verticalAlign: 'middle'}}/>}
                    {r.id === 'lurker' && <Ghost size={16} style={{marginRight: 6, verticalAlign: 'middle'}}/>}
                    {r.id === 'rifler' && <Target size={16} style={{marginRight: 6, verticalAlign: 'middle'}}/>}
                    {r.id === 'anchor' && <Anchor size={16} style={{marginRight: 6, verticalAlign: 'middle'}}/>}
                    {r.id === 'rotator' && <RotateCcw size={16} style={{marginRight: 6, verticalAlign: 'middle'}}/>}
                    {t(`loadout.role.${r.id}`)}
                  </span>
                  <span className="lo-role-desc">{t(`loadout.role.${r.id}.desc`)}</span>
                </button>
              ))}
              <button
                className={`lo-role ${loadout.isCaller ? "on" : ""}`}
                onClick={() => patch(l => ({ ...l, isCaller: !l.isCaller }))}
              >
                <span className="lo-role-name">
                  <Mic size={16} style={{marginRight: 6, verticalAlign: 'middle'}}/>
                  {t("loadout.role.caller")}
                </span>
                <span className="lo-role-desc">{t("loadout.role.caller.desc")}</span>
              </button>
            </div>

            <MapRoleOverrides side={side} />
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
                              onClick={() => setWeapon(slot, o.id)}
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
