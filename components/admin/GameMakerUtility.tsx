"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crosshair, Trash2, Check, RefreshCw, MapPin, Camera, AlertTriangle, Copy } from "lucide-react";
import {
  MAPS,
  THROW_TYPES,
  THROW_HINT,
  CLICK_LABEL,
  CLICK_HINT,
  PURPOSE_LABEL,
  UTILITIES,
  UTIL_COLOUR,
  RUNUP_THROWS,
  worldToPercent,
  percentToWorld,
  levelFor,
  radarUrl,
  type MapOverview,
} from "@/lib/utilityShared";

// The Utility tab of Game Maker.
//
// Authoring is split deliberately: the game owns the parts a browser cannot
// know — where you stood, what you were looking at, how you threw — and this
// owns the parts the game is bad at, which is everything with a name and a
// judgement in it. The radar can move the landing point because that is a
// position you can see on a map; it cannot set the stand point, because no
// click can tell you a pitch and a yaw.

type Draft = {
  SteamId: string;
  Map: string;
  Utility: string;
  Team: string;
  ThrowType: string;
  ClickType: string;
  StandX: number; StandY: number; StandZ: number;
  Pitch: number; Yaw: number;
  LandX: number | null; LandY: number | null; LandZ: number | null;
  MarkedStand: boolean;
  CapturedAt: string;
};

type Lineup = {
  Id: number;
  Map: string; Name: string; Area: string;
  Utility: string; Purpose: string; Team: string;
  ThrowType: string; ClickType: string;
  StandX: number; StandY: number; StandZ: number;
  Pitch: number; Yaw: number;
  LandX: number | null; LandY: number | null; LandZ: number | null;
  Notes: string | null;
  NeedsReview: boolean; NeedsShots: boolean; MarkedStand: boolean;
  ShotStand: string | null; ShotAim: string | null; ShotResult: string | null;
};

type QueueRow = { map: string; pending: number };

const POLL_MS = 2000;

export default function GameMakerUtility({ adminKey }: { adminKey?: string }) {
  const [map, setMap] = useState("de_mirage");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lineups, setLineups] = useState<Lineup[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Draft form state, seeded from the capture and then owned by the admin.
  const [form, setForm] = useState({
    name: "", area: "", purpose: "default", team: "",
    throwType: "stand", clickType: "left", notes: "",
  });
  const [landOverride, setLandOverride] = useState<{ x: number; y: number } | null>(null);
  const seededFor = useRef<string>("");

  const qs = useCallback(
    (extra = "") => `${adminKey ? `key=${encodeURIComponent(adminKey)}&` : ""}${extra}`,
    [adminKey]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/game-maker/utility?${qs(`map=${encodeURIComponent(map)}`)}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not load."); return; }
      setError("");
      setDraft(json.draft ?? null);
      setLineups(json.lineups ?? []);
      setQueue(json.queue ?? []);
    } catch {
      setError("Could not reach the server.");
    }
  }, [map, qs]);

  // Poll, so a throw in game shows up here without a refresh.
  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Seed the form once per capture. Re-seeding on every poll would overwrite
  // whatever the admin is halfway through typing.
  useEffect(() => {
    if (!draft) { seededFor.current = ""; return; }
    const key = `${draft.SteamId}:${draft.CapturedAt}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    setForm((f) => ({
      ...f,
      name: "",
      throwType: draft.ThrowType,
      clickType: draft.ClickType,
      team: draft.Team,
    }));
    setLandOverride(null);
  }, [draft]);

  const cfg: MapOverview | undefined = MAPS[draft?.Map ?? map];

  const validate = async () => {
    if (!draft || !form.name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/game-maker/utility?${qs()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          steamId: draft.SteamId,
          ...form,
          utility: draft.Utility,
          landX: landOverride?.x ?? undefined,
          landY: landOverride?.y ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not validate."); return; }
      setDraft(null);
      setForm((f) => ({ ...f, name: "", notes: "" }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!draft) return;
    await fetch(`/api/admin/game-maker/utility?${qs(`steamId=${draft.SteamId}`)}`, { method: "DELETE" });
    setDraft(null);
    load();
  };

  const patchLineup = async (id: number, patch: Record<string, unknown>) => {
    setLineups((prev) => prev.map((l) => (l.Id === id ? { ...l, ...renameKeys(patch) } : l)));
    await fetch(`/api/admin/game-maker/utility/${id}?${qs()}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  };

  const removeLineup = async (id: number) => {
    await fetch(`/api/admin/game-maker/utility/${id}?${qs()}`, { method: "DELETE" });
    setLineups((prev) => prev.filter((l) => l.Id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const needingReview = useMemo(() => lineups.filter((l) => l.NeedsReview).length, [lineups]);
  const pendingShots = queue.find((q) => q.map === map)?.pending ?? 0;
  const selected = lineups.find((l) => l.Id === selectedId) ?? null;

  return (
    <div className="gmu">
      <p className="gm-blurb">
        Throw the grenade in game with <code>!lineup arm</code> and it appears here. Throwing again replaces it —
        nothing is saved until you validate. For a run-up, bind <code>css_lineup mark</code> and mark where the run
        starts; without a mark the stand point falls back to the last ground you touched before the jump.
      </p>

      <div className="gmu-top">
        <label className="gm-field">
          <span>Map</span>
          <select className="input" value={map} onChange={(e) => { setMap(e.target.value); setSelectedId(null); }}>
            {Object.entries(MAPS).map(([id, m]) => (
              <option key={id} value={id}>{m.label}</option>
            ))}
          </select>
        </label>

        <div className="gmu-stats">
          <span className="gm-chip">{lineups.length} lineup(s)</span>
          {needingReview > 0 && (
            <span className="gm-chip warn">
              <AlertTriangle size={11} /> {needingReview} need review
            </span>
          )}
          {pendingShots > 0 && (
            <span className="gm-chip shots">
              <Camera size={11} /> {pendingShots} awaiting shots
            </span>
          )}
          <button className="btn btn-ghost gmu-refresh" onClick={load} title="Refresh now">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && <p className="gm-error">{error}</p>}

      <div className="gmu-split">
        <section className="gmu-radar-pane">
          <RadarPane
            cfg={cfg}
            map={draft?.Map ?? map}
            draft={draft}
            lineups={lineups}
            landOverride={landOverride}
            selectedId={selectedId}
            onPickLand={(x, y) => setLandOverride({ x, y })}
            onSelect={setSelectedId}
          />
        </section>

        <section className="gmu-side">
          <AnimatePresence mode="wait">
            {draft ? (
              <motion.div
                key="draft"
                className="gmu-draft"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <header className="gmu-draft-head">
                  <span className="gmu-live">
                    <span className="gmu-dot" /> Captured
                  </span>
                  <span className="gm-chip" style={{ color: UTIL_COLOUR[draft.Utility] }}>
                    {UTILITIES.find((u) => u.id === draft.Utility)?.label ?? draft.Utility}
                  </span>
                </header>

                <p className="gmu-provenance">
                  {draft.MarkedStand
                    ? "Stand point from your mark."
                    : "Stand point from the last ground you touched — mark it next time for an exact run-up."}
                </p>

                <div className="gmu-coords">
                  <span>stand {draft.StandX.toFixed(0)}, {draft.StandY.toFixed(0)}, {draft.StandZ.toFixed(0)}</span>
                  <span>view {draft.Pitch.toFixed(1)} / {draft.Yaw.toFixed(1)}</span>
                </div>

                <label className="gm-field">
                  <span>Name</span>
                  <input
                    className="input"
                    autoFocus
                    placeholder="e.g. Window smoke from T spawn"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") validate(); }}
                  />
                </label>

                <label className="gm-field">
                  <span>Area thrown from</span>
                  <input
                    className="input"
                    placeholder="e.g. T Spawn"
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                  />
                </label>

                <div className="gmu-row">
                  <label className="gm-field">
                    <span>Throw</span>
                    <select className="input" value={form.throwType} onChange={(e) => setForm({ ...form, throwType: e.target.value })}>
                      {THROW_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </label>
                  <label className="gm-field">
                    <span>Click</span>
                    <select className="input" value={form.clickType} onChange={(e) => setForm({ ...form, clickType: e.target.value })}>
                      {Object.entries(CLICK_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </label>
                </div>

                <p className="gmu-hint">{THROW_HINT[form.throwType]} · {CLICK_HINT[form.clickType]}</p>
                {RUNUP_THROWS.has(form.throwType) && !draft.MarkedStand && (
                  <p className="gmu-warn">
                    <AlertTriangle size={12} /> A run-up throw without a mark — check the stand point on the radar before validating.
                  </p>
                )}

                <div className="gmu-row">
                  <label className="gm-field">
                    <span>Purpose</span>
                    <select className="input" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}>
                      {Object.entries(PURPOSE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </label>
                  <label className="gm-field">
                    <span>Side</span>
                    <select className="input" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}>
                      <option value="">Either</option>
                      <option value="T">T</option>
                      <option value="CT">CT</option>
                    </select>
                  </label>
                </div>

                <label className="gm-field">
                  <span>Notes</span>
                  <textarea
                    className="input gmu-notes"
                    placeholder="Anything the coordinates do not say."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </label>

                <p className="gmu-hint">
                  {landOverride
                    ? `Landing point set from the radar (${landOverride.x.toFixed(0)}, ${landOverride.y.toFixed(0)}).`
                    : "Click the radar to mark where it lands."}
                </p>

                <div className="gmu-actions">
                  <button className="btn btn-primary" disabled={!form.name.trim() || busy} onClick={validate}>
                    <Check size={15} /> {busy ? "Saving…" : "Validate"}
                  </button>
                  <button className="btn btn-ghost gm-danger" onClick={discard}>Discard</button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="waiting" className="gmu-waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Crosshair size={22} />
                <p><strong>Waiting for a throw.</strong></p>
                <p className="muted">
                  Run <code>!lineup arm</code> in game, then throw. It shows up here within a couple of seconds.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {selected && (
            <div className="gmu-edit">
              <header className="gmu-edit-head">
                <h4>{selected.Name}</h4>
                <button className="btn btn-ghost gm-danger" onClick={() => removeLineup(selected.Id)}>
                  <Trash2 size={13} />
                </button>
              </header>
              {selected.NeedsReview && (
                <p className="gmu-warn">
                  <AlertTriangle size={12} /> Throw type was guessed by the migration — set it to clear this.
                </p>
              )}
              <div className="gmu-row">
                <label className="gm-field">
                  <span>Throw</span>
                  <select
                    className="input"
                    value={selected.ThrowType}
                    onChange={(e) => patchLineup(selected.Id, { throwType: e.target.value })}
                  >
                    {THROW_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
                <label className="gm-field">
                  <span>Click</span>
                  <select
                    className="input"
                    value={selected.ClickType}
                    onChange={(e) => patchLineup(selected.Id, { clickType: e.target.value })}
                  >
                    {Object.entries(CLICK_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
              </div>
              <p className="gmu-hint">
                {selected.NeedsShots ? "Waiting for screenshots." : "Screenshots attached."}
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="gmu-queue">
        <h4><Camera size={14} /> Screenshot queue</h4>
        <p className="gm-hint">
          Screenshots need a rendering client, and a dedicated server has none — so this queue is handed to you
          rather than run for you. Nothing is hand-picked or hand-matched: the three commands below cover a map end
          to end, and <code>ingest</code> clears it from this list.
        </p>
        {queue.length === 0 ? (
          <p className="empty-hint">Nothing waiting — every lineup has its shots.</p>
        ) : (
          <ul className="gmu-queue-list">
            {queue.map((q) => (
              <li key={q.map} className={q.map === map ? "on" : ""}>
                <button className="gmu-queue-map" onClick={() => setMap(q.map)}>
                  {MAPS[q.map]?.label ?? q.map}
                </button>
                <span className="gm-chip shots"><Camera size={11} /> {q.pending}</span>
                <div className="gmu-cmds">
                  {captureCommands(q.map).map((c) => (
                    <CopyLine key={c.cmd} label={c.label} cmd={c.cmd} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The three commands that take one map's pending lineups to finished shots.
 *
 * `--pending` matters: without it the second run of a map re-photographs every
 * lineup on it to add the three validated since the first, which is twenty
 * minutes of driving a client for three pictures.
 */
function captureCommands(map: string) {
  return [
    { label: "1 · config", cmd: `node tools/lineup-capture/generate.mjs --map ${map} --pending` },
    { label: "2 · capture", cmd: `pwsh -File tools/lineup-capture/drive.ps1 -Map ${map} -Detonate` },
    { label: "3 · ingest", cmd: `node tools/lineup-capture/ingest.mjs --map ${map} --throw` },
  ];
}

function CopyLine({ label, cmd }: { label: string; cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`gmu-cmd ${copied ? "copied" : ""}`}
      title="Copy"
      onClick={() => {
        navigator.clipboard?.writeText(cmd);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      <span className="gmu-cmd-label">{label}</span>
      <code>{cmd}</code>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

/** The radar: existing lineups as faint arcs, the capture as a live one. */
function RadarPane({
  cfg, map, draft, lineups, landOverride, selectedId, onPickLand, onSelect,
}: {
  cfg: MapOverview | undefined;
  map: string;
  draft: Draft | null;
  lineups: Lineup[];
  landOverride: { x: number; y: number } | null;
  selectedId: number | null;
  onPickLand: (x: number, y: number) => void;
  onSelect: (id: number | null) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  if (!cfg) {
    return <p className="empty-hint">No radar calibration for this map.</p>;
  }

  const level = levelFor(cfg, draft?.StandZ ?? 0);

  const click = (e: React.MouseEvent) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const left = ((e.clientX - box.left) / box.width) * 100;
    const top = ((e.clientY - box.top) / box.height) * 100;
    const world = percentToWorld(cfg, left, top);
    if (world) onPickLand(world.x, world.y);
  };

  const pt = (x: number, y: number) => worldToPercent(cfg, x, y);
  const draftStand = draft ? pt(draft.StandX, draft.StandY) : null;
  const draftLand = landOverride
    ? pt(landOverride.x, landOverride.y)
    : draft?.LandX != null && draft.LandY != null
      ? pt(draft.LandX, draft.LandY)
      : null;

  return (
    <div className="gmu-radar" ref={boxRef} onClick={click}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={radarUrl(map, level)} alt="" draggable={false} />

      <svg className="gmu-arcs" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {lineups.map((l) => {
          if (l.LandX == null || l.LandY == null) return null;
          const a = pt(l.StandX, l.StandY);
          const b = pt(l.LandX, l.LandY);
          if (!a || !b) return null;
          const on = l.Id === selectedId;
          return (
            <line
              key={l.Id}
              x1={a.left} y1={a.top} x2={b.left} y2={b.top}
              stroke={UTIL_COLOUR[l.Utility] ?? "#888"}
              strokeWidth={on ? 0.7 : 0.28}
              opacity={on ? 0.95 : 0.3}
            />
          );
        })}
        {draftStand && draftLand && (
          <line
            x1={draftStand.left} y1={draftStand.top}
            x2={draftLand.left} y2={draftLand.top}
            stroke="#6fcf7f" strokeWidth={0.8} strokeDasharray="2 1.4"
          />
        )}
      </svg>

      {lineups.map((l) => {
        const a = pt(l.StandX, l.StandY);
        if (!a) return null;
        return (
          <button
            key={l.Id}
            className={`gmu-pin ${l.Id === selectedId ? "on" : ""} ${l.NeedsReview ? "review" : ""}`}
            style={{ left: `${a.left}%`, top: `${a.top}%`, ["--pin" as string]: UTIL_COLOUR[l.Utility] ?? "#888" }}
            title={`${l.Name}${l.NeedsReview ? " — needs review" : ""}`}
            onClick={(e) => { e.stopPropagation(); onSelect(l.Id === selectedId ? null : l.Id); }}
          />
        );
      })}

      {draftStand && (
        <span className="gmu-pin draft stand" style={{ left: `${draftStand.left}%`, top: `${draftStand.top}%` }} />
      )}
      {draftLand && (
        <span className="gmu-pin draft land" style={{ left: `${draftLand.left}%`, top: `${draftLand.top}%` }}>
          <MapPin size={11} />
        </span>
      )}
    </div>
  );
}

function renameKeys(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) out[k.charAt(0).toUpperCase() + k.slice(1)] = v;
  return out;
}
