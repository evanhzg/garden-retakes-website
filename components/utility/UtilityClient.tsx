"use client";

import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  MAPS,
  POOLS,
  UTILITIES,
  UTIL_COLOUR,
  THROW_TYPES,
  THROW_SHORT,
  THROW_LABEL,
  PURPOSE_LABEL,
  SOURCE_KINDS,
  SOURCE_LABEL,
  levelFor,
  playableMaps,
  radarUrl,
  clusterByStand,
  compareLineups,
  displayLineupName,
  matchesQuery,
  hasShots,
  type Lineup,
} from "@/lib/utilityShared";
import UtilityRadar from "./UtilityRadar";
import UtilityDetail from "./UtilityDetail";

// The lineup browser.
//
// Three columns, in the order a question gets narrowed: what you are looking
// for (the rail), where it is (the stage), which one it is (the list). The rail
// is a rail rather than a row of dropdowns because the counts beside each
// option are half the value — "there are no molotovs on this map" is an answer,
// and a closed dropdown cannot give it.
//
// Every count is faceted: it shows what you would get if you ticked that one
// option, with the rest of the filters still applied. Counting the unfiltered
// set instead produces the familiar and useless rail where every number stays
// the same and several of them lead to an empty list.

type Filters = {
  search: string;
  utility: Set<string>;
  throwType: Set<string>;
  team: string;
  purpose: string;
  area: string;
  sourceKind: string;
  withShots: boolean;
  showUnverified: boolean;
};

const EMPTY: Filters = {
  search: "",
  utility: new Set(),
  throwType: new Set(),
  team: "",
  purpose: "",
  area: "",
  sourceKind: "",
  withShots: false,
  showUnverified: false,
};

/** How close a lineup has to land to a clicked point to count as an answer. */
const FIND_RADIUS = 300;

/**
 * three.js, the R3F reconciler and drei are a few hundred kilobytes, and most
 * visits to this page never open the 3D tab. Split out so they are downloaded
 * by the people who ask for them.
 */
const Utility3D = lazy(() => import("@/components/utility/Utility3D"));

export default function UtilityPage({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();

  const maps = useMemo(() => playableMaps(), []);
  const [map, setMap] = useState("de_mirage");
  const [pool, setPool] = useState<string>("active");
  const [lineups, setLineups] = useState<Lineup[] | null>(null);
  const [selected, setSelected] = useState<Lineup | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [level, setLevel] = useState("default");
  const [stage, setStage] = useState<"map" | "3d" | "list" | "resources">("map");

  const [f, setF] = useState<Filters>(EMPTY);
  const [findMode, setFindMode] = useState(false);
  const [findAt, setFindAt] = useState<{ x: number; y: number } | null>(null);

  const [testing, setTesting] = useState(false);
  const [favourites, setFavourites] = useState<number[]>([]);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const cfg = MAPS[map];
  const levels = cfg?.levels ?? null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("map");
    if (m && MAPS[m]) setMap(m);
    const v = params.get("view");
    if (v === "map" || v === "list" || v === "resources") setStage(v);
    try {
      const saved = localStorage.getItem("favorites");
      if (saved) setFavourites(JSON.parse(saved));
    } catch {
      /* private mode */
    }
  }, []);

  const toggleFavourite = (id: number) => {
    setFavourites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem("favorites", JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  };

  const load = useCallback(async () => {
    setLineups(null);
    setSelected(null);
    try {
      const res = await fetch(`/api/utility?map=${map}`, { cache: "no-store" });
      const json = await res.json();
      setLineups(json.lineups ?? []);
    } catch {
      setLineups([]);
    }
  }, [map]);

  useEffect(() => {
    load();
  }, [load]);

  // A filter set for one map means nothing on the next — areas are per-map, and
  // a level called "lower" does not exist everywhere.
  useEffect(() => {
    setLevel("default");
    setF((prev) => ({ ...prev, area: "" }));
    setFindAt(null);
    setFindMode(false);
  }, [map]);

  // Deep link into one lineup, once its map has loaded.
  useEffect(() => {
    if (!lineups) return;
    const id = new URLSearchParams(window.location.search).get("lineup");
    if (!id) return;
    const l = lineups.find((x) => x.id === Number(id));
    if (l) setSelected(l);
  }, [lineups]);

  const writeParams = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const handleSelect = (l: Lineup | null) => {
    setSelected(l);
    writeParams({ lineup: l ? String(l.id) : null });
  };

  const handleStage = (v: "map" | "3d" | "list" | "resources") => {
    setStage(v);
    writeParams({ view: v });
  };

  const handleMap = (id: string) => {
    setMap(id);
    writeParams({ map: id, lineup: null });
  };

  const handleUpdate = (updated: Lineup) => {
    setLineups((prev) => (prev ? prev.map((l) => (l.id === updated.id ? updated : l)) : null));
    setSelected(updated);
  };

  /**
   * One predicate, with the ability to skip a facet.
   *
   * `skip` is what makes the counts honest: counting "smoke" means asking how
   * many lineups pass every filter *except* the utility one and are smokes.
   */
  const passes = useCallback(
    (l: Lineup, skip?: keyof Filters | "find" | "level") => {
      if (!cfg) return false;
      if (skip !== "showUnverified" && !f.showUnverified && !l.verified) return false;
      if (skip !== "utility" && f.utility.size && !f.utility.has(l.utility)) return false;
      if (skip !== "throwType" && f.throwType.size && !f.throwType.has(l.throwType)) return false;
      if (skip !== "team" && f.team && l.team !== f.team) return false;
      if (skip !== "purpose" && f.purpose && l.purpose !== f.purpose) return false;
      if (skip !== "area" && f.area && l.area !== f.area) return false;
      if (skip !== "sourceKind" && f.sourceKind && (l.sourceKind ?? "ingame") !== f.sourceKind) return false;
      if (skip !== "withShots" && f.withShots && !hasShots(l)) return false;
      if (skip !== "search" && f.search && !matchesQuery(l, f.search)) return false;
      if (skip !== "level" && levels && levelFor(cfg, l.stand.z) !== level) return false;
      if (skip !== "find" && findAt) {
        if (!l.land) return false;
        if (Math.hypot(l.land.x - findAt.x, l.land.y - findAt.y) > FIND_RADIUS) return false;
      }
      return true;
    },
    [cfg, f, levels, level, findAt]
  );

  const visible = useMemo(
    () => (lineups ?? []).filter((l) => passes(l)).sort(compareLineups),
    [lineups, passes]
  );

  const count = useCallback(
    (facet: keyof Filters, match: (l: Lineup) => boolean) =>
      (lineups ?? []).filter((l) => passes(l, facet) && match(l)).length,
    [lineups, passes]
  );

  const areas = useMemo(() => {
    const tally = new Map<string, number>();
    for (const l of lineups ?? []) {
      if (!passes(l, "area")) continue;
      // Lineups with no callout do not get a chip. They used to get one each,
      // because Area was the whole of their unique name — a facet with forty
      // one-result chips in it is a facet nobody can use.
      if (!l.area) continue;
      tally.set(l.area, (tally.get(l.area) ?? 0) + 1);
    }
    return Array.from(tally.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [lineups, passes]);

  const unverified = (lineups ?? []).filter((l) => !l.verified).length;
  const withPictures = (lineups ?? []).filter(hasShots).length;
  const active =
    f.utility.size + f.throwType.size +
    Number(Boolean(f.team)) + Number(Boolean(f.purpose)) + Number(Boolean(f.area)) +
    Number(Boolean(f.sourceKind)) +
    Number(f.withShots) + Number(Boolean(f.search)) + Number(Boolean(findAt));

  const toggleIn = (key: "utility" | "throwType", id: string) =>
    setF((prev) => {
      const next = new Set(prev[key]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [key]: next };
    });

  const clearAll = () => {
    setF({ ...EMPTY, showUnverified: f.showUnverified });
    setFindAt(null);
    setFindMode(false);
  };

  const testLineup = async (lineup: Lineup) => {
    if (testing) return;
    setTesting(true);
    setNote(null);
    try {
      const res = await fetch("/api/utility/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: lineup.id }),
      });
      const json = await res.json();
      setNote(res.ok ? { kind: "ok", text: json.message ?? "Set up." } : { kind: "err", text: json.error ?? "Failed." });
    } catch {
      setNote({ kind: "err", text: t("utility.unreachable") });
    } finally {
      setTesting(false);
    }
  };

  const handleNote = (n: { kind: "ok" | "err"; text: string }) => {
    setNote(n);
    setTimeout(() => setNote(null), 3000);
  };

  const shownMaps = maps.filter(([, c]) => c.pools.includes(pool));

  return (
    <div className="ux">
      <header className="ux-hero">
        <div>
          <span className="kicker">{t("auto.utilityclient.utility")}</span>
          <h1>{t("utility.title")}</h1>
          <p className="muted">{t("auto.utilityclient.every_saved_smoke_flash_molly")}</p>
        </div>

        <div className="ux-mapping">
          <div className="ux-pools">
            {POOLS.map((p) => (
              <button
                key={p.id}
                className={`chip ${pool === p.id ? "active" : ""}`}
                onClick={() => {
                  setPool(p.id);
                  const first = maps.find(([, c]) => c.pools.includes(p.id));
                  if (first && !MAPS[map]?.pools.includes(p.id)) handleMap(first[0]);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="ux-maps">
            {shownMaps.map(([id, c]) => (
              <button key={id} className={`ux-map ${map === id ? "on" : ""}`} onClick={() => handleMap(id)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="ux-layout">
        {/* ----------------------------------------------------- filter rail */}
        <aside className="ux-rail">
          <input
            className="input ux-search"
            type="search"
            placeholder={t("utility.searchplaceholder")}
            value={f.search}
            onChange={(e) => setF({ ...f, search: e.target.value })}
          />

          <div className="ux-facet">
            <h3>{t("utility.facet.grenade")}</h3>
            {UTILITIES.map((u) => {
              const n = count("utility", (l) => l.utility === u.id);
              return (
                <button
                  key={u.id}
                  className={`ux-opt ${f.utility.has(u.id) ? "on" : ""} ${n === 0 ? "empty" : ""}`}
                  style={{ ["--tint" as string]: UTIL_COLOUR[u.id] }}
                  disabled={n === 0 && !f.utility.has(u.id)}
                  onClick={() => toggleIn("utility", u.id)}
                >
                  <span className="ux-opt-dot" />
                  <span className="ux-opt-label">{t(`utility.type.${u.id}`)}</span>
                  <span className="ux-opt-n">{n}</span>
                </button>
              );
            })}
          </div>

          <div className="ux-facet">
            <h3>{t("utility.facet.throw")}</h3>
            {THROW_TYPES.map((ty) => {
              const n = count("throwType", (l) => l.throwType === ty.id);
              if (n === 0 && !f.throwType.has(ty.id)) return null;
              return (
                <button
                  key={ty.id}
                  className={`ux-opt ${f.throwType.has(ty.id) ? "on" : ""}`}
                  onClick={() => toggleIn("throwType", ty.id)}
                  title={ty.hint}
                >
                  <span className="ux-opt-label">{ty.label}</span>
                  <span className="ux-opt-n">{n}</span>
                </button>
              );
            })}
          </div>

          <div className="ux-facet">
            <h3>{t("utility.facet.source")}</h3>
            {SOURCE_KINDS.map((src) => {
              const n = count("sourceKind", (l) => (l.sourceKind ?? "ingame") === src.id);
              if (n === 0 && f.sourceKind !== src.id) return null;
              return (
                <button
                  key={src.id}
                  className={`ux-opt ${f.sourceKind === src.id ? "on" : ""}`}
                  title={src.hint}
                  onClick={() => setF({ ...f, sourceKind: f.sourceKind === src.id ? "" : src.id })}
                >
                  <span className="ux-opt-label">{src.label}</span>
                  <span className="ux-opt-n">{n}</span>
                </button>
              );
            })}
          </div>

          <div className="ux-facet">
            <h3>{t("utility.facet.side")}</h3>
            <div className="ux-seg">
              {[
                { id: "", label: t("utility.side.any") },
                { id: "T", label: "T" },
                { id: "CT", label: "CT" },
              ].map((s) => (
                <button
                  key={s.id || "any"}
                  className={`ux-segbtn ${f.team === s.id ? "on" : ""} ${s.id.toLowerCase()}`}
                  onClick={() => setF({ ...f, team: s.id })}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ux-facet">
            <h3>{t("utility.facet.purpose")}</h3>
            <div className="ux-chips">
              {Object.entries(PURPOSE_LABEL).map(([id, label]) => {
                const n = count("purpose", (l) => l.purpose === id);
                if (n === 0) return null;
                return (
                  <button
                    key={id}
                    className={`chip ${f.purpose === id ? "active" : ""}`}
                    onClick={() => setF({ ...f, purpose: f.purpose === id ? "" : id })}
                  >
                    {label} <span className="num">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {areas.length > 1 && (
            <div className="ux-facet">
              <h3>{t("utility.facet.area")}</h3>
              <div className="ux-chips">
                {areas.map(([a, n]) => (
                  <button
                    key={a || "none"}
                    className={`chip ${f.area === a ? "active" : ""}`}
                    onClick={() => setF({ ...f, area: f.area === a ? "" : a })}
                  >
                    {a || "—"} <span className="num">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ux-facet">
            <button
              className={`ux-find ${findMode ? "arming" : ""} ${findAt ? "on" : ""}`}
              onClick={() => {
                if (findAt) {
                  setFindAt(null);
                  setFindMode(false);
                } else {
                  setFindMode((m) => !m);
                  handleStage("map");
                }
              }}
            >
              {findAt
                ? t("utility.find.clear")
                : findMode
                  ? t("utility.find.arming")
                  : t("utility.find.start")}
            </button>
            <p className="ux-findhint">{t("utility.find.hint")}</p>
          </div>

          <div className="ux-facet">
            <label className="util-toggle">
              <input
                type="checkbox"
                checked={f.withShots}
                onChange={(e) => setF({ ...f, withShots: e.target.checked })}
              />
              {t("utility.filter.withpictures", { n: withPictures })}
            </label>
            {unverified > 0 && (
              <label className="util-toggle">
                <input
                  type="checkbox"
                  checked={f.showUnverified}
                  onChange={(e) => setF({ ...f, showUnverified: e.target.checked })}
                />
                {t("utility.filter.unverified", { n: unverified })}
              </label>
            )}
          </div>

          {active > 0 && (
            <button className="btn btn-ghost ux-clear" onClick={clearAll}>
              {t("utility.filter.clear", { n: active })}
            </button>
          )}
        </aside>

        {/* --------------------------------------------------------- stage */}
        <section className="ux-stage">
          <div className="ux-stagebar">
            {levels && (
              <div className="ux-levels" role="group" aria-label={t("auto.utilityclient.level")}>
                {levels.map((l) => (
                  <button
                    key={l.name}
                    className={`chip ${level === l.name ? "active" : ""}`}
                    onClick={() => setLevel(l.name)}
                  >
                    {l.name === "default" ? t("utility.level.upper") : t("utility.level.lower")}
                  </button>
                ))}
              </div>
            )}
            <span className="ux-count">
              {lineups === null
                ? t("auto.utilityclient.loading")
                : t("utility.showing", { n: visible.length, total: lineups.length })}
            </span>
            <div className="ux-viewtabs" role="tablist">
              <button
                role="tab"
                aria-selected={stage === "map"}
                className={`ux-viewtab ${stage === "map" ? "on" : ""}`}
                onClick={() => handleStage("map")}
              >
                {t("utility.view.map")}
              </button>
              <button
                role="tab"
                aria-selected={stage === "3d"}
                className={`ux-viewtab ${stage === "3d" ? "on" : ""}`}
                onClick={() => handleStage("3d")}
                // Only where there is calibration to place things against;
                // a 3D tab that opens on nothing is worse than no tab.
                disabled={!cfg?.scale}
              >
                {t("utility.view.3d")}
              </button>
              <button
                role="tab"
                aria-selected={stage === "list"}
                className={`ux-viewtab ${stage === "list" ? "on" : ""}`}
                onClick={() => handleStage("list")}
              >
                {t("utility.view.gallery")}
              </button>
              <button
                role="tab"
                aria-selected={stage === "resources"}
                className={`ux-viewtab ${stage === "resources" ? "on" : ""}`}
                onClick={() => handleStage("resources")}
              >
                {t("utility.view.resources")}
              </button>
            </div>
          </div>

          {cfg && stage === "map" && (
            <UtilityRadar
              cfg={cfg}
              radar={radarUrl(map, level)}
              lineups={visible}
              selected={selected}
              hovered={hovered}
              findMode={findMode}
              findAt={findAt}
              onHover={setHovered}
              onSelect={handleSelect}
              onFind={(pos) => {
                setFindAt(pos);
                setFindMode(false);
              }}
              label={`${cfg.label} radar`}
            />
          )}

          {stage === "3d" && (
            // Loaded on demand. three.js and the R3F reconciler are a large
            // chunk of JavaScript, and most visits to this page never open
            // the 3D tab — making everyone download it would be a real cost
            // paid for an occasional feature.
            <Suspense fallback={<div className="ux3d-empty"><p className="muted">Loading the 3D view…</p></div>}>
              <Utility3D
                map={map}
                lineups={visible}
                selectedId={selected?.id ?? null}
                onSelect={handleSelect}
              />
            </Suspense>
          )}

          {stage === "resources" && (
            <Resources
              lineups={visible}
              map={map}
              selectedId={selected?.id ?? null}
              onSelect={handleSelect}
              onHover={setHovered}
            />
          )}

          {stage === "list" && (
            <div className="ux-gallery">
              {visible.map((l) => (
                <GalleryCard
                  key={l.id}
                  lineup={l}
                  active={selected?.id === l.id}
                  favourite={favourites.includes(l.id)}
                  noImage={t("utility.noimage")}
                  onSelect={() => handleSelect(l)}
                  onHover={setHovered}
                />
              ))}
              {lineups !== null && visible.length === 0 && (
                <p className="empty-hint">{t("utility.nomatch")}</p>
              )}
            </div>
          )}
        </section>

        {/* ------------------------------------------------- list / detail */}
        <aside className="ux-side">
          {note && (
            <div className={`skin-note ${note.kind === "ok" ? "skin-note-ok" : "skin-note-error"} ux-note`}>
              <span>{note.text}</span>
            </div>
          )}

          {selected ? (
            <UtilityDetail
              lineup={selected}
              signedIn={signedIn}
              favourite={favourites.includes(selected.id)}
              testing={testing}
              onBack={() => handleSelect(null)}
              onTest={testLineup}
              onToggleFavourite={toggleFavourite}
              onNote={handleNote}
              onUpdate={handleUpdate}
            />
          ) : (
            <div className="util-list">
              <div className="util-list-head">
                <h2>{cfg?.label}</h2>
                <span className="muted num">{visible.length}</span>
              </div>

              {lineups === null ? (
                <p className="muted">{t("auto.utilityclient.loading")}</p>
              ) : visible.length === 0 ? (
                <p className="empty-hint">
                  {active > 0 ? t("utility.nomatch") : t("utility.empty")}
                </p>
              ) : (
                <ul>
                  {visible.map((l) => (
                    <li key={l.id}>
                      <button
                        className={`ux-row ${hovered === l.id ? "hot" : ""}`}
                        onMouseEnter={() => setHovered(l.id)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => handleSelect(l)}
                      >
                        <Thumb lineup={l} />
                        <span className="ux-row-text">
                          <span className="ux-row-name">
                            <span className="util-row-dot" style={{ background: UTIL_COLOUR[l.utility] }} />
                            {displayLineupName(l)}
                            {favourites.includes(l.id) && <span className="ux-row-star">★</span>}
                            {!l.verified && (
                              <span className="util-row-flag" title={t("auto.utilityclient.position_not_on_the_map")}>?</span>
                            )}
                          </span>
                          <span className="ux-row-meta">
                            {l.area}
                            {l.area && THROW_SHORT[l.throwType] ? " · " : ""}
                            {THROW_SHORT[l.throwType]}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * The thumbnail on a list row.
 *
 * Result before aim: at 48px the aim shot is a wall with an invisible crosshair
 * on it, while the result is a smoke, which is recognisable at any size.
 */
function Thumb({ lineup }: { lineup: Lineup }) {
  const src = lineup.shots.result || lineup.shots.aim || lineup.thumb;
  if (!src) return <span className="ux-thumb empty" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="ux-thumb" src={src} alt="" loading="lazy" />;
}

function GalleryCard({
  lineup, active, favourite, noImage, onSelect, onHover,
}: {
  lineup: Lineup;
  active: boolean;
  favourite: boolean;
  noImage: string;
  onSelect: () => void;
  onHover: (id: number | null) => void;
}) {
  const src = lineup.shots.result || lineup.shots.aim || lineup.thumb;
  return (
    <button
      className={`ux-card ${active ? "on" : ""}`}
      onClick={onSelect}
      onMouseEnter={() => onHover(lineup.id)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="ux-card-shot">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" />
        ) : (
          <span className="ux-card-noshot">{noImage}</span>
        )}
        <span className="ux-card-util" style={{ ["--tint" as string]: UTIL_COLOUR[lineup.utility] }} />
        {favourite && <span className="ux-card-star">★</span>}
      </span>
      <span className="ux-card-body">
        <span className="ux-card-name">{lineup.name}</span>
        <span className="ux-card-meta">
          {lineup.area || "—"}
          {THROW_LABEL[lineup.throwType] ? ` · ${THROW_LABEL[lineup.throwType]}` : ""}
        </span>
      </span>
    </button>
  );
}

/**
 * The Resources tab: lineups grouped by where they land, ranked by how often
 * they are actually thrown.
 *
 * This is the view mined lineups need and the gallery cannot give them. A mined
 * lineup has no screenshot and no callout — a demo does not record what anyone
 * calls a place — so a grid of picture cards shows a grid of grey boxes. What it
 * does have is a count, and that count is the whole value: a smoke thrown in
 * eleven professional matches is one worth learning, and one thrown once is
 * somebody improvising.
 *
 * Where a map has nothing for a grenade type, the empty state points outward
 * rather than pretending the gap is not there.
 */
function Resources({
  lineups, map, selectedId, onSelect, onHover,
}: {
  lineups: Lineup[];
  map: string;
  selectedId: number | null;
  onSelect: (l: Lineup) => void;
  onHover: (id: number | null) => void;
}) {
  const { t } = useI18n();

  // Grouped by where you stand, not by the Area string.
  //
  // Area came from parsing the lineup's name, and mined names are
  // "T smoke (-1234, 567)" — a shape the parser could not read, so it returned
  // the whole unique name and every mined lineup became its own group. That is
  // the messy list: forty headings, one row each, for throws that all come from
  // the same three corners. Position is information a demo actually gives us,
  // and two throws from one corner are one row whatever they are called.
  const groups = useMemo(() => clusterByStand(lineups), [lineups]);

  if (groups.length === 0) {
    return (
      <div className="ux-resources-empty">
        <p>{t("utility.resources.none")}</p>
        <p className="muted">{t("utility.resources.elsewhere")}</p>
        <div className="ux-outlinks">
          <a href={`https://csnades.gg/${map.replace(/^de_/, "")}`} target="_blank" rel="noreferrer noopener">
            csnades.gg
          </a>
          <a href={`https://www.cs2util.com/${map.replace(/^de_/, "")}`} target="_blank" rel="noreferrer noopener">
            cs2util.com
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="ux-resources">
      {groups.map((group) => (
        <section key={group.key}>
          <h3>
            {group.area || (
              <span className="muted">
                {group.nearArea
                  ? t("utility.resources.near", { area: group.nearArea })
                  : t("utility.resources.spot")}
              </span>
            )}
            {group.list.length > 1 && (
              <span className="ux-res-groupcount">
                {t("utility.resources.count", { n: group.list.length })}
              </span>
            )}
          </h3>
          <ul>
            {group.list.map((l) => (
              <li key={l.id}>
                <button
                  className={`ux-res ${selectedId === l.id ? "on" : ""}`}
                  onClick={() => onSelect(l)}
                  onMouseEnter={() => onHover(l.id)}
                  onMouseLeave={() => onHover(null)}
                >
                  <span className="ux-res-dot" style={{ background: UTIL_COLOUR[l.utility] }} />
                  <span className="ux-res-body">
                    <span className="ux-res-name">{displayLineupName(l)}</span>
                    <span className="ux-res-meta">
                      {THROW_LABEL[l.throwType] ?? l.throwType}
                      {l.sourceLabel ? ` · ${l.sourceLabel}` : ""}
                    </span>
                  </span>
                  {l.popularity ? (
                    <span className="ux-res-count" title={t("utility.resources.seen", { n: l.popularity })}>
                      ×{l.popularity}
                    </span>
                  ) : (
                    <span className="ux-res-count muted">{SOURCE_LABEL[l.sourceKind ?? "ingame"]}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
