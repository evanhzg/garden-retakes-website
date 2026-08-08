"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crosshair, Ghost, Target, Anchor, RotateCcw, Mic } from "lucide-react";
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
import "@/app/loadout/loadout.css";

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

export default function RetakeLoadoutPage({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();
  const [side, setSide] = useState<Side>("T");
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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
    <div className="lo">
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
          <section className="lo-panel">
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
              <label className={`lo-role ${loadout.isCaller ? "on" : ""}`} style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "8px", cursor: "pointer", justifyContent: "center", padding: "12px", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <Mic size={20} />
                <div style={{ display: "flex", flexDirection: "column", flex: 1, textAlign: "left" }}>
                   <span className="lo-role-name">Caller</span>
                   <span className="lo-role-desc">I will make the calls.</span>
                </div>
                <input type="checkbox" checked={loadout.isCaller} onChange={(e) => patch(l => ({ ...l, isCaller: e.target.checked }))} style={{ width: 18, height: 18, accentColor: "var(--color-accent)" }} />
              </label>
            </div>
          </section>

          <section className="lo-panel">
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
                          <button
                            className={`lo-pick ${value === null ? "on" : ""}`}
                            onClick={() => setWeapon(slot, null)}
                          >
                            {t("loadout.noPreference")}
                          </button>
                          {options.map((o) => (
                            <button
                              key={o.id}
                              className={`lo-pick ${value === o.id ? "on" : ""}`}
                              onClick={() => setWeapon(slot, o.id)}
                              title={o.name}
                              style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px", gap: "4px" }}
                            >
                              <img 
                                src={`/images/weapons/${o.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.svg`} 
                                alt={o.name} 
                                style={{ width: 40, height: "auto", objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  const span = e.currentTarget.nextElementSibling as HTMLSpanElement;
                                  if (span) span.style.display = "block";
                                }}
                              />
                              <span style={{ fontSize: "10px", display: "none" }}>{o.name}</span>
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
                        return (
                          <button
                            key={u}
                            className={`lo-pick util ${order >= 0 ? "on" : ""}`}
                            onClick={() => toggleUtility(kind, u)}
                          >
                            {order >= 0 && <span className="lo-order">{order + 1}</span>}
                            {t(`utility.type.${u}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="lo-panel">
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
          </section>

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
