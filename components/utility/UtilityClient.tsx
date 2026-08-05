"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from '@/components/I18nProvider';
import {
  MAPS,
  POOLS,
  UTILITIES,
  levelFor,
  playableMaps,
  radarUrl,
  UTIL_COLOUR,
  compareLineups,
  matchesQuery,
  THROW_SHORT,
  type Lineup,
} from "@/lib/utilityShared";
import UtilityRadar from "./UtilityRadar";
import UtilityDetail from "./UtilityDetail";

export default function UtilityPage({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();

  const maps = useMemo(() => playableMaps(), []);
  const [map, setMap] = useState("de_mirage");
  const [pool, setPool] = useState<string>("active");
  const [lineups, setLineups] = useState<Lineup[] | null>(null);
  const [selected, setSelected] = useState<Lineup | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [level, setLevel] = useState("default");
  
  const [search, setSearch] = useState("");
  const [utilFilter, setUtilFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [showUnverified, setShowUnverified] = useState(false);
  
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [findMode, setFindMode] = useState(false);
  const [findAt, setFindAt] = useState<{ x: number; y: number } | null>(null);

  const [testing, setTesting] = useState(false);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const m = params.get("map");
      if (m && MAPS[m]) setMap(m);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("favorites");
      if (saved) setFavorites(JSON.parse(saved));
    } catch {}
  }, []);

  const toggleFavorite = (id: number) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try { localStorage.setItem("favorites", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const cfg = MAPS[map];
  const levels = cfg?.levels ?? null;

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

  useEffect(() => {
    setLevel("default");
    setAreaFilter("");
    setFindAt(null);
    setFindMode(false);
  }, [map]);
  
  useEffect(() => {
    if (typeof window !== "undefined" && lineups) {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("lineup");
      if (id) {
        const l = lineups.find((x) => x.id === Number(id));
        if (l) setSelected(l);
      }
    }
  }, [lineups]);

  const handleSelect = (l: Lineup | null) => {
    setSelected(l);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (l) params.set("lineup", l.id.toString());
      else params.delete("lineup");
      window.history.pushState(null, "", "?" + params.toString());
    }
  };

  const handleUpdate = (updated: Lineup) => {
    setLineups(prev => prev ? prev.map(l => l.id === updated.id ? updated : l) : null);
    setSelected(updated);
  };

  const visible = useMemo(() => {
    if (!lineups || !cfg) return [];
    return lineups.filter((l) => {
      if (!showUnverified && !l.verified) return false;
      if (utilFilter && l.utility !== utilFilter) return false;
      if (areaFilter && l.area !== areaFilter) return false;
      if (levels && levelFor(cfg, l.stand.z) !== level) return false;
      if (search && !matchesQuery(l, search)) return false;
      if (findAt && l.land) {
        const dx = l.land.x - findAt.x;
        const dy = l.land.y - findAt.y;
        if (Math.hypot(dx, dy) > 300) return false;
      } else if (findAt && !l.land) {
        return false;
      }
      return true;
    }).sort(compareLineups);
  }, [lineups, cfg, showUnverified, utilFilter, areaFilter, levels, level, search, findAt]);

  const areas = useMemo(() => {
    const set = new Map<string, number>();
    for (const l of visible) set.set(l.area || "—", (set.get(l.area || "—") ?? 0) + 1);
    return Array.from(set.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  const unverifiedCount = (lineups ?? []).filter((l) => !l.verified).length;

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
      setNote({ kind: "err", text: "Could not reach the server." });
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
    <>
      <section className="pro-hero">
        <span className="kicker">{t("auto.utilityclient.utility")}</span>
        <h1 style={{ fontSize: "clamp(28px, 4.2vw, 48px)", letterSpacing: "-0.025em", margin: "10px 0 6px" }}>
          {t("auto.utilityclient.lineups")}
        </h1>
        <p className="muted" style={{ maxWidth: "60ch", margin: 0 }}>
          {t("auto.utilityclient.every_saved_smoke_flash_molly")}
        </p>
      </section>

      <section className="pro-section">
        <div className="util-pools">
          {POOLS.map((p) => (
            <button
              key={p.id}
              className={`chip ${pool === p.id ? "active" : ""}`}
              onClick={() => {
                setPool(p.id);
                const first = maps.find(([, c]) => c.pools.includes(p.id));
                if (first && !MAPS[map]?.pools.includes(p.id)) setMap(first[0]);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="util-maps">
            {shownMaps.map(([id, c]) => (
              <button key={id} className={`util-map ${map === id ? "active" : ""}`} onClick={() => setMap(id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="util-maps" style={{ marginLeft: "auto", flexWrap: "nowrap" }}>
            <button className={`util-map ${viewMode === "map" ? "active" : ""}`} onClick={() => setViewMode("map")}>{t("utility.view.map")}</button>
            <button className={`util-map ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")}>{t("utility.view.list")}</button>
          </div>
        </div>

        <div className="util-layout">
          <div className="util-mapwrap">
            {levels && (
              <div className="util-levels" role="group" aria-label={t("auto.utilityclient.level")}>
                {levels.map((l) => (
                  <button key={l.name} className={`chip ${level === l.name ? "active" : ""}`} onClick={() => setLevel(l.name)}>
                    {l.name === "default" ? "Upper" : "Lower"}
                  </button>
                ))}
              </div>
            )}

            {cfg && viewMode === "map" && (
              <UtilityRadar
                cfg={cfg}
                radar={radarUrl(map, level)}
                lineups={visible}
                selected={selected}
                hovered={hovered}
                findMode={findMode}
                findAt={findAt}
                onHover={setHovered}
                onSelect={setSelected}
                onFind={(pos) => { setFindAt(pos); setFindMode(false); }}
                label={`${cfg.label} radar`}
              />
            )}

            {viewMode === "list" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem", marginTop: "1rem", alignContent: "flex-start", overflowY: "auto", paddingRight: "0.5rem" }}>
                {visible.map((l) => {
                  const src = l.shots.result || l.shots.aim;
                  return (
                    <button 
                      key={l.id} 
                      className={`util-card ${selected?.id === l.id ? "active" : ""}`}
                      style={{ 
                        border: selected?.id === l.id ? "2px solid var(--color-accent)" : "1px solid color-mix(in srgb, var(--color-text) 15%, transparent)", 
                        borderRadius: "8px", 
                        overflow: "hidden", 
                        textAlign: "left", 
                        background: "color-mix(in srgb, var(--color-bg) 50%, #000)", 
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        display: "flex",
                        flexDirection: "column",
                        padding: 0
                      }}
                      onClick={() => handleSelect(l)}
                    >
                      {src ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={src} alt={l.name} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }} loading="lazy" />
                      ) : (
                        <span style={{ width: "100%", aspectRatio: "16/9", background: "color-mix(in srgb, var(--color-text) 5%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>{t("utility.noimage")}</span>
                      )}
                      <span style={{ padding: "0.75rem", display: "block" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                          <span className="util-row-dot" style={{ background: UTIL_COLOUR[l.utility] }} />
                          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{l.name}</span>
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block" }}>
                          {l.area} • {l.throwType === "standing" ? "Standing" : THROW_SHORT[l.throwType] ?? l.throwType}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="util-legend">
              {UTILITIES.map((u) => (
                <button
                  key={u.id}
                  className={`util-legend-item ${utilFilter === u.id ? "on" : ""}`}
                  style={{ ["--tint" as string]: UTIL_COLOUR[u.id] }}
                  onClick={() => setUtilFilter(utilFilter === u.id ? "" : u.id)}
                >
                  <span className="util-legend-dot" /> {u.label}
                </button>
              ))}
            </div>
          </div>

          <aside className="util-side">
            {note && (
              <div className={`skin-note ${note.kind === "ok" ? "skin-note-ok" : "skin-note-error"}`} style={{ marginBottom: "1rem" }}>
                <span>{note.text}</span>
              </div>
            )}
            
            {selected ? (
              <UtilityDetail
                lineup={selected}
                signedIn={signedIn}
                favourite={favorites.includes(selected.id)}
                testing={testing}
                onBack={() => handleSelect(null)}
                onTest={testLineup}
                onToggleFavourite={toggleFavorite}
                onNote={handleNote}
                onUpdate={handleUpdate}
              />
            ) : (
              <div className="util-list">
                <div className="util-list-head">
                  <h2>{cfg?.label}</h2>
                  <span className="muted num">{visible.length}</span>
                </div>

                <div className="util-search" style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexDirection: "column" }}>
                  <input
                    type="text"
                    placeholder="Search lineups..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input"
                    style={{ width: "100%", padding: "0.5rem", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--fg)" }}
                  />
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button 
                      className={`btn ${findMode ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => {
                        if (findMode) {
                          setFindMode(false);
                        } else {
                          setFindMode(true);
                          setFindAt(null);
                        }
                      }}
                      style={{ flex: 1 }}
                    >
                      {findMode ? "Click radar to find" : findAt ? "Target locked" : "Find by target"}
                    </button>
                    {findAt && (
                      <button className="btn btn-ghost" onClick={() => setFindAt(null)}>Clear</button>
                    )}
                  </div>
                </div>

                {unverifiedCount > 0 && (
                  <label className="util-toggle">
                    <input type="checkbox" checked={showUnverified} onChange={(e) => setShowUnverified(e.target.checked)} />
                    {t("auto.utilityclient.show")} {unverifiedCount} {t("auto.utilityclient.unverified")}
                  </label>
                )}

                {areas.length > 1 && (
                  <div className="util-areas">
                    <button className={`chip ${areaFilter === "" ? "active" : ""}`} onClick={() => setAreaFilter("")}>
                      {t("auto.utilityclient.all")}
                    </button>
                    {areas.map(([a, n]) => (
                      <button
                        key={a}
                        className={`chip ${areaFilter === a ? "active" : ""}`}
                        onClick={() => setAreaFilter(areaFilter === a ? "" : a)}
                      >
                        {a} <span className="num">{n}</span>
                      </button>
                    ))}
                  </div>
                )}

                {lineups === null ? (
                  <p className="muted">{t("auto.utilityclient.loading")}</p>
                ) : visible.length === 0 ? (
                  <p className="empty-hint">
                    {t("auto.utilityclient.nothing_saved_here_yet_record")} <code>{t("auto.utilityclient._prac_nade")}</code>.
                  </p>
                ) : (
                  <ul>
                    {visible.map((l) => {
                      const src = l.shots.result || l.shots.aim;
                      return (
                        <li key={l.id}>
                          <button
                            className={`util-row ${hovered === l.id ? "hot" : ""}`}
                            style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 8px", width: "100%", textAlign: "left", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer" }}
                            onMouseEnter={() => setHovered(l.id)}
                            onMouseLeave={() => setHovered(null)}
                            onClick={() => handleSelect(l)}
                          >
                            {src ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={src} alt="" style={{ width: "48px", height: "32px", objectFit: "cover", borderRadius: "4px" }} loading="lazy" />
                            ) : (
                              <span style={{ width: "48px", height: "32px", background: "color-mix(in srgb, var(--color-text) 5%, transparent)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "var(--muted)" }}>No img</span>
                            )}
                            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                              <span className="util-row-name" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span className="util-row-dot" style={{ background: UTIL_COLOUR[l.utility] }} />
                                {l.name}
                                {!l.verified && <span className="util-row-flag" title={t("auto.utilityclient.position_not_on_the_map")}>?</span>}
                              </span>
                              <span className="util-row-throw">{l.throwType === "standing" ? "" : THROW_SHORT[l.throwType] ?? l.throwType}</span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}

