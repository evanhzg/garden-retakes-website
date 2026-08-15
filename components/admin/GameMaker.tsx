"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Crosshair, Bomb, Zap, Sparkles, Plus, Trash2, ChevronRight } from "lucide-react";
import ModeMaker from "@/components/admin/ModeMaker";
import "@/app/admin/game-maker.css";

// Game Maker — one authoring surface for the four modes whose spawns and
// strats used to live in per-map JSON on the game server, editable only
// through in-game admin commands and invisible from here.
//
// The four concrete tabs are the same editor with different vocabulary, because
// underneath they are the same table: a named set, some positioned spawns, and
// (for the two strat modes) some utility. What differs is which fields carry
// meaning, which is why MODE_SPEC below is data rather than four components.

export type GmSpawn = {
  Id: number;
  SetId: number;
  Side: "T" | "CT";
  Type: string;
  Label: string;
  X: number; Y: number; Z: number; Pitch: number; Yaw: number;
  Pairing: number | null;
  CanPlant: boolean;
  Active: boolean;
};

export type GmUtility = {
  Id: number;
  SetId: number;
  Type: "smoke" | "flash" | "he" | "molotov";
  Team: "T" | "CT";
  Delivery: "thrown" | "grounded";
  X: number; Y: number; Z: number;
  VelX: number; VelY: number; VelZ: number;
  DelaySeconds: number;
  Active: boolean;
};

export type GmSet = {
  Id: number;
  Mode: string;
  Map: string;
  Name: string;
  Site: "A" | "B" | null;
  Phase: "early" | "mid" | "end" | null;
  PhaseSeconds: number | null;
  Roles: string[];
  RoundTypes: string[];
  Votable: boolean;
  Weight: number;
  Active: boolean;
  Spawns: GmSpawn[];
  Utilities: GmUtility[];
};

type ModeId = "duels" | "retakes" | "executes" | "faststrat";

/**
 * What each mode means by a "set", and which of the shared fields it uses.
 *
 * `spawnTypes` is the per-mode category vocabulary the user asked for — Duels
 * arenas are typed by engagement (AK only, close range…), Retakes spawns by the
 * role that should hold them.
 */
const MODE_SPEC: Record<ModeId, {
  label: string;
  icon: typeof Swords;
  setNoun: string;
  blurb: string;
  usesSite: boolean;
  usesPhase: boolean;
  usesUtility: boolean;
  usesRoles: boolean;
  spawnTypes: { id: string; label: string }[];
}> = {
  duels: {
    label: "Duels",
    icon: Swords,
    setNoun: "arena",
    blurb: "Named arenas, each a pool of T and CT spawns. A duel pairs one of each — tag them by the engagement you want that pairing to produce.",
    usesSite: false,
    usesPhase: false,
    usesUtility: false,
    usesRoles: false,
    spawnTypes: [
      { id: "", label: "Any" },
      { id: "ak_only", label: "AK only" },
      { id: "awp_only", label: "AWP only" },
      { id: "close", label: "Close range" },
      { id: "long", label: "Long range" },
      { id: "pistol", label: "Pistol" },
　  ],
  },
  retakes: {
    label: "Competitive Retakes",
    icon: Crosshair,
    setNoun: "site setup",
    blurb: "Spawns grouped per bombsite. Tag a spawn with the role meant to hold it and the round types it applies to — the plugin biases placement toward them.",
    usesSite: true,
    usesPhase: false,
    usesUtility: false,
    usesRoles: true,
    spawnTypes: [
      { id: "", label: "Any" },
      { id: "sniper", label: "Sniper" },
      { id: "lurker", label: "Lurker" },
      { id: "rifler", label: "Rifler" },
      { id: "anchor", label: "Anchor" },
      { id: "rotator", label: "Rotator" },
    ],
  },
  executes: {
    label: "Executes",
    icon: Bomb,
    setNoun: "strat",
    blurb: "A full execute onto one site: where the Ts start, where the CTs set up, and the utility thrown at round start from its recorded lineup.",
    usesSite: true,
    usesPhase: false,
    usesUtility: true,
    usesRoles: false,
    spawnTypes: [
      { id: "", label: "Any" },
      { id: "entry", label: "Entry" },
      { id: "support", label: "Support" },
      { id: "planter", label: "Planter" },
      { id: "anchor", label: "Anchor" },
    ],
  },
  faststrat: {
    label: "Fast Strat",
    icon: Zap,
    setNoun: "play",
    blurb: "Both sides vote a play, and they need not concern the same site — so these are not site-bound. Pick the phase of the round the play opens in; its utility starts already on the ground rather than being thrown.",
    usesSite: false,
    usesPhase: true,
    usesUtility: true,
    usesRoles: false,
    spawnTypes: [
      { id: "", label: "Any" },
      { id: "entry", label: "Entry" },
      { id: "support", label: "Support" },
      { id: "anchor", label: "Anchor" },
      { id: "rotator", label: "Rotator" },
    ],
  },
};

const PHASES = [
  { id: "early", label: "Early round", seconds: 20 },
  { id: "mid", label: "Mid round", seconds: 55 },
  { id: "end", label: "End round", seconds: 90 },
] as const;

const ROUND_TYPES = [
  { id: "pistol", label: "Pistol" },
  { id: "half", label: "Half buy" },
  { id: "full", label: "Full buy" },
];

const UTILITY_TYPES = [
  { id: "smoke", label: "Smoke" },
  { id: "flash", label: "Flash" },
  { id: "he", label: "HE" },
  { id: "molotov", label: "Molotov" },
] as const;

/** The stock competitive pool; workshop maps come from the Maps tab's catalog. */
const STOCK_MAPS = [
  "de_mirage", "de_inferno", "de_nuke", "de_overpass", "de_vertigo",
  "de_ancient", "de_anubis", "de_dust2", "de_train", "de_cache",
];

type CatalogMap = { Id: number; Mode: string; MapName: string; WorkshopId: string | null };

const TABS: { id: ModeId | "modemaker"; label: string }[] = [
  { id: "duels", label: "Duels" },
  { id: "retakes", label: "Retakes" },
  { id: "executes", label: "Executes" },
  { id: "faststrat", label: "Fast Strat" },
  { id: "modemaker", label: "Mode Maker" },
];

export default function GameMaker({ adminKey }: { adminKey?: string }) {
  const [tab, setTab] = useState<ModeId | "modemaker">("duels");

  return (
    <div className="gm">
      <div className="gm-tabs" role="tablist">
        {TABS.map((t) => {
          const spec = t.id !== "modemaker" ? MODE_SPEC[t.id] : null;
          const Icon = spec?.icon ?? Sparkles;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              // The Mode Maker is the new idea rather than another editor, so
              // it gets the accent gradient and reads as a different kind of
              // thing in the strip.
              className={`gm-tab ${tab === t.id ? "on" : ""} ${t.id === "modemaker" ? "feature" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={15} />
              {t.label}
              {tab === t.id && (
                <motion.span className="gm-tab-underline" layoutId="gm-tab-underline" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {tab === "modemaker" ? (
          <motion.div key="modemaker" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            <ModeMaker adminKey={adminKey} />
          </motion.div>
        ) : (
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            <ModeEditor mode={tab} adminKey={adminKey} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModeEditor({ mode, adminKey }: { mode: ModeId; adminKey?: string }) {
  const spec = MODE_SPEC[mode];
  const [map, setMap] = useState(STOCK_MAPS[0]);
  const [customMap, setCustomMap] = useState("");
  const [catalog, setCatalog] = useState<CatalogMap[]>([]);
  const [sets, setSets] = useState<GmSet[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const qs = useCallback(
    (extra = "") => `${adminKey ? `key=${encodeURIComponent(adminKey)}&` : ""}${extra}`,
    [adminKey]
  );

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/admin/game-maker/sets?${qs(`mode=${mode}&map=${encodeURIComponent(map)}`)}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not load."); setSets([]); return; }
      setSets(json.sets ?? []);
    } catch {
      setError("Could not reach the server.");
      setSets([]);
    }
  }, [mode, map, qs]);

  useEffect(() => { setSets(null); setSelectedId(null); load(); }, [load]);

  // Workshop maps registered in the Maps tab become first-class options here,
  // so "add a map from the workshop" is one flow rather than typing its name
  // from memory into every tab.
  useEffect(() => {
    fetch(`/api/admin/maps?${qs()}`)
      .then((r) => (r.ok ? r.json() : { maps: [] }))
      .then((d) => setCatalog(d.maps ?? []))
      .catch(() => setCatalog([]));
  }, [qs]);

  const workshopMaps = useMemo(
    () => catalog.filter((m) => m.MapName && !STOCK_MAPS.includes(m.MapName)),
    [catalog]
  );

  const selected = useMemo(() => sets?.find((s) => s.Id === selectedId) ?? null, [sets, selectedId]);

  const createSet = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/game-maker/sets?${qs()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          map,
          name: newName.trim(),
          // Executes must name a site; the editor defaults it to A and the
          // admin can flip it once the set exists.
          site: spec.usesSite ? "A" : null,
          phase: spec.usesPhase ? "mid" : null,
          phaseSeconds: spec.usesPhase ? 55 : null,
          votable: mode === "faststrat",
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not create."); return; }
      setNewName("");
      setSets((prev) => [...(prev ?? []), json.set]);
      setSelectedId(json.set.Id);
    } finally {
      setBusy(false);
    }
  };

  const patchSet = async (id: number, patch: Record<string, unknown>) => {
    setSets((prev) => prev?.map((s) => (s.Id === id ? { ...s, ...renameKeys(patch) } : s)) ?? prev);
    await fetch(`/api/admin/game-maker/sets/${id}?${qs()}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  };

  const deleteSet = async (id: number) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/game-maker/sets/${id}?${qs()}`, { method: "DELETE" });
      setSets((prev) => prev?.filter((s) => s.Id !== id) ?? prev);
      if (selectedId === id) setSelectedId(null);
    } finally {
      setBusy(false);
    }
  };

  const addSpawn = async (side: "T" | "CT") => {
    if (!selected) return;
    const res = await fetch(`/api/admin/game-maker/spawns?${qs()}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setId: selected.Id, side, label: `${side} spawn`, type: "" }),
    });
    const json = await res.json();
    if (res.ok) {
      setSets((prev) => prev?.map((s) => (s.Id === selected.Id ? { ...s, Spawns: [...s.Spawns, json.spawn] } : s)) ?? prev);
    }
  };

  const patchSpawn = async (spawnId: number, patch: Record<string, unknown>) => {
    setSets((prev) =>
      prev?.map((s) => ({
        ...s,
        Spawns: s.Spawns.map((sp) => (sp.Id === spawnId ? { ...sp, ...renameKeys(patch) } : sp)),
      })) ?? prev
    );
    await fetch(`/api/admin/game-maker/spawns?${qs()}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: spawnId, ...patch }),
    });
  };

  const deleteSpawn = async (spawnId: number) => {
    await fetch(`/api/admin/game-maker/spawns?${qs(`id=${spawnId}`)}`, { method: "DELETE" });
    setSets((prev) => prev?.map((s) => ({ ...s, Spawns: s.Spawns.filter((sp) => sp.Id !== spawnId) })) ?? prev);
  };

  const addUtility = async () => {
    if (!selected) return;
    const res = await fetch(`/api/admin/game-maker/utilities?${qs()}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setId: selected.Id,
        type: "smoke",
        team: "T",
        // Fast Strat plays open with the smoke already down; an execute
        // throws it. The tab's own semantics pick the default.
        delivery: mode === "faststrat" ? "grounded" : "thrown",
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setSets((prev) => prev?.map((s) => (s.Id === selected.Id ? { ...s, Utilities: [...s.Utilities, json.utility] } : s)) ?? prev);
    }
  };

  const patchUtility = async (utilId: number, patch: Record<string, unknown>) => {
    setSets((prev) =>
      prev?.map((s) => ({
        ...s,
        Utilities: s.Utilities.map((u) => (u.Id === utilId ? { ...u, ...renameKeys(patch) } : u)),
      })) ?? prev
    );
    await fetch(`/api/admin/game-maker/utilities?${qs()}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: utilId, ...patch }),
    });
  };

  const deleteUtility = async (utilId: number) => {
    await fetch(`/api/admin/game-maker/utilities?${qs(`id=${utilId}`)}`, { method: "DELETE" });
    setSets((prev) => prev?.map((s) => ({ ...s, Utilities: s.Utilities.filter((u) => u.Id !== utilId) })) ?? prev);
  };

  return (
    <div className="gm-editor">
      <p className="gm-blurb">{spec.blurb}</p>

      <div className="gm-maprow">
        <label className="gm-field">
          <span>Map</span>
          <select
            className="input"
            value={STOCK_MAPS.includes(map) || workshopMaps.some((w) => w.MapName === map) ? map : "__custom"}
            onChange={(e) => {
              if (e.target.value === "__custom") { setMap(customMap.trim()); } else { setMap(e.target.value); }
            }}
          >
            <optgroup label="Stock">
              {STOCK_MAPS.map((m) => <option key={m} value={m}>{m}</option>)}
            </optgroup>
            {workshopMaps.length > 0 && (
              <optgroup label="Workshop">
                {workshopMaps.map((m) => (
                  <option key={m.Id} value={m.MapName}>
                    {m.MapName}{m.WorkshopId ? ` (${m.WorkshopId})` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="__custom">Other / type a name…</option>
          </select>
        </label>
        <label className="gm-field">
          <span>Any other map name</span>
          <input
            className="input"
            placeholder="e.g. de_cbble"
            value={customMap}
            onChange={(e) => setCustomMap(e.target.value)}
            onBlur={() => { if (customMap.trim()) setMap(customMap.trim()); }}
          />
        </label>
      </div>

      {error && <p className="gm-error">{error}</p>}

      <div className="gm-split">
        <aside className="gm-list">
          <div className="gm-list-head">
            <h3>{spec.setNoun}s on {map || "—"}</h3>
          </div>

          {sets === null ? (
            <p className="muted">Loading…</p>
          ) : sets.length === 0 ? (
            <p className="empty-hint">No {spec.setNoun}s here yet.</p>
          ) : (
            <ul className="gm-set-list">
              {sets.map((s) => (
                <li key={s.Id}>
                  <button
                    className={`gm-set-item ${selectedId === s.Id ? "on" : ""} ${s.Active ? "" : "off"}`}
                    onClick={() => setSelectedId(s.Id)}
                  >
                    <span className="gm-set-name">{s.Name}</span>
                    <span className="gm-set-meta">
                      {s.Site && <span className="gm-chip site">{s.Site}</span>}
                      {s.Phase && <span className="gm-chip phase">{s.Phase}</span>}
                      <span className="gm-chip">{s.Spawns.length} spawns</span>
                      {!s.Active && <span className="gm-chip off">inactive</span>}
                    </span>
                    <ChevronRight size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="gm-add">
            <input
              className="input"
              placeholder={`New ${spec.setNoun} name`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createSet(); }}
            />
            <button className="btn btn-primary" disabled={!newName.trim() || busy || !map} onClick={createSet}>
              <Plus size={15} /> Add
            </button>
          </div>
        </aside>

        <section className="gm-detail">
          {!selected ? (
            <p className="empty-hint">Pick a {spec.setNoun} to edit it.</p>
          ) : (
            <>
              <header className="gm-detail-head">
                <h3>{selected.Name}</h3>
                <div className="gm-detail-actions">
                  <button
                    className={`gm-toggle ${selected.Active ? "on" : ""}`}
                    onClick={() => patchSet(selected.Id, { active: !selected.Active })}
                  >
                    {selected.Active ? "Active" : "Inactive"}
                  </button>
                  <button className="btn btn-ghost gm-danger" onClick={() => deleteSet(selected.Id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </header>

              <div className="gm-opts">
                {spec.usesSite && (
                  <label className="gm-field">
                    <span>Bombsite</span>
                    <select className="input" value={selected.Site ?? "A"} onChange={(e) => patchSet(selected.Id, { site: e.target.value })}>
                      <option value="A">A</option>
                      <option value="B">B</option>
                    </select>
                  </label>
                )}

                {spec.usesPhase && (
                  <>
                    <label className="gm-field">
                      <span>Round phase</span>
                      <select
                        className="input"
                        value={selected.Phase ?? "mid"}
                        onChange={(e) => {
                          const p = PHASES.find((x) => x.id === e.target.value)!;
                          patchSet(selected.Id, { phase: p.id, phaseSeconds: p.seconds });
                        }}
                      >
                        {PHASES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </label>
                    <label className="gm-field">
                      <span>Opens at (s into round)</span>
                      <input
                        className="input"
                        type="number"
                        value={selected.PhaseSeconds ?? 0}
                        onChange={(e) => patchSet(selected.Id, { phaseSeconds: Number(e.target.value) })}
                      />
                    </label>
                  </>
                )}

                <label className="gm-field">
                  <span>Weight {selected.Weight === 0 && <em>(never random)</em>}</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={selected.Weight}
                    onChange={(e) => patchSet(selected.Id, { weight: Number(e.target.value) })}
                  />
                </label>

                {(mode === "faststrat" || mode === "executes") && (
                  <label className="gm-check">
                    <input
                      type="checkbox"
                      checked={selected.Votable}
                      onChange={(e) => patchSet(selected.Id, { votable: e.target.checked })}
                    />
                    In the Fast Strat vote pool
                  </label>
                )}
              </div>

              {spec.usesRoles && (
                <div className="gm-optgroup">
                  <span className="gm-optgroup-label">Round types</span>
                  <div className="gm-pills">
                    {ROUND_TYPES.map((rt) => {
                      const on = selected.RoundTypes.includes(rt.id);
                      return (
                        <button
                          key={rt.id}
                          className={`gm-pill ${on ? "on" : ""}`}
                          onClick={() =>
                            patchSet(selected.Id, {
                              roundTypes: on
                                ? selected.RoundTypes.filter((x) => x !== rt.id)
                                : [...selected.RoundTypes, rt.id],
                            })
                          }
                        >
                          {rt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="gm-optgroup">
                <div className="gm-optgroup-head">
                  <span className="gm-optgroup-label">Spawns</span>
                  <div className="gm-inline-actions">
                    <button className="btn btn-secondary" onClick={() => addSpawn("T")}><Plus size={13} /> T</button>
                    <button className="btn btn-secondary" onClick={() => addSpawn("CT")}><Plus size={13} /> CT</button>
                  </div>
                </div>
                <p className="gm-hint">
                  Coordinates are filled in game with <code>!maker</code> — add and name them here, then stand on the spot and capture it.
                </p>

                {selected.Spawns.length === 0 ? (
                  <p className="empty-hint">No spawns yet.</p>
                ) : (
                  <ul className="gm-spawn-list">
                    {selected.Spawns.map((sp) => (
                      <li key={sp.Id} className={`gm-spawn ${sp.Side.toLowerCase()} ${sp.Active ? "" : "off"}`}>
                        <span className={`gm-side ${sp.Side.toLowerCase()}`}>{sp.Side}</span>
                        <input
                          className="input gm-spawn-label"
                          value={sp.Label}
                          placeholder="Label, e.g. A Site"
                          onChange={(e) => patchSpawn(sp.Id, { label: e.target.value })}
                        />
                        <select className="input gm-spawn-type" value={sp.Type} onChange={(e) => patchSpawn(sp.Id, { type: e.target.value })}>
                          {spec.spawnTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                        <span className="gm-coords">
                          {sp.X === 0 && sp.Y === 0 && sp.Z === 0
                            ? "not placed"
                            : `${sp.X.toFixed(0)}, ${sp.Y.toFixed(0)}, ${sp.Z.toFixed(0)}`}
                        </span>
                        <button
                          className={`gm-toggle small ${sp.Active ? "on" : ""}`}
                          onClick={() => patchSpawn(sp.Id, { active: !sp.Active })}
                        >
                          {sp.Active ? "on" : "off"}
                        </button>
                        <button className="btn btn-ghost gm-danger" onClick={() => deleteSpawn(sp.Id)}>
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {spec.usesUtility && (
                <div className="gm-optgroup">
                  <div className="gm-optgroup-head">
                    <span className="gm-optgroup-label">Utility</span>
                    <button className="btn btn-secondary" onClick={addUtility}><Plus size={13} /> Add</button>
                  </div>
                  <p className="gm-hint">
                    {mode === "faststrat"
                      ? "Fast Strat utility starts already deployed on the ground — the round opens mid-execute rather than watching one happen."
                      : "Executes utility is thrown at round start from its recorded lineup. Capture the lineup in game with !maker."}
                  </p>

                  {selected.Utilities.length === 0 ? (
                    <p className="empty-hint">No utility yet.</p>
                  ) : (
                    <ul className="gm-util-list">
                      {selected.Utilities.map((u) => (
                        <li key={u.Id} className={u.Active ? "" : "off"}>
                          <select className="input" value={u.Type} onChange={(e) => patchUtility(u.Id, { type: e.target.value })}>
                            {UTILITY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                          <select className="input" value={u.Team} onChange={(e) => patchUtility(u.Id, { team: e.target.value })}>
                            <option value="T">T</option>
                            <option value="CT">CT</option>
                          </select>
                          <select className="input" value={u.Delivery} onChange={(e) => patchUtility(u.Id, { delivery: e.target.value })}>
                            <option value="thrown">Thrown at start</option>
                            <option value="grounded">Already on the ground</option>
                          </select>
                          <label className="gm-inline-field">
                            <span>delay</span>
                            <input
                              className="input"
                              type="number"
                              step="0.5"
                              value={u.DelaySeconds}
                              onChange={(e) => patchUtility(u.Id, { delaySeconds: Number(e.target.value) })}
                            />
                          </label>
                          <span className="gm-coords">
                            {u.X === 0 && u.Y === 0 && u.Z === 0
                              ? "not placed"
                              : `${u.X.toFixed(0)}, ${u.Y.toFixed(0)}, ${u.Z.toFixed(0)}`}
                          </span>
                          <button className="btn btn-ghost gm-danger" onClick={() => deleteUtility(u.Id)}>
                            <Trash2 size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** API bodies are camelCase, rows are PascalCase — map one onto the other for optimistic updates. */
function renameKeys(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    out[k.charAt(0).toUpperCase() + k.slice(1)] = v;
  }
  return out;
}
