"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from '@/components/I18nProvider';
import {
  CLICK_LABEL,
  MAPS,
  POOLS,
  THROW_LABEL,
  UTILITIES,
  levelFor,
  playableMaps,
  radarUrl,
  worldToPercent,
  type Lineup,
} from "@/lib/utilityShared";

// The utility page: a real radar, every lineup on it, and a way to try one.
//
// The map is the index. Picking a lineup out of a list of two hundred names is
// hopeless; picking the smoke that lands on the corner you are looking at is
// not, so the markers are the primary control and the side panel follows them.

const UTIL_COLOUR: Record<string, string> = {
  smoke: "#8bb8d8",
  flash: "#e8d24a",
  molotov: "#e8703a",
  he: "#7fbf5f",
  decoy: "#b58fd8",
};

export default function UtilityPage({ signedIn }: { signedIn: boolean }) {
    const { t } = useI18n();

  const maps = useMemo(() => playableMaps(), []);
  const [map, setMap] = useState("de_mirage");
  const [pool, setPool] = useState<string>("active");
  const [lineups, setLineups] = useState<Lineup[] | null>(null);
  const [selected, setSelected] = useState<Lineup | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [level, setLevel] = useState("default");
  const [utilFilter, setUtilFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [showUnverified, setShowUnverified] = useState(false);
  const [testing, setTesting] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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
  }, [map]);

  const visible = useMemo(() => {
    if (!lineups || !cfg) return [];
    return lineups.filter((l) => {
      if (!showUnverified && !l.verified) return false;
      if (utilFilter && l.utility !== utilFilter) return false;
      if (areaFilter && l.area !== areaFilter) return false;
      // A stacked map draws one level at a time or the markers overlap.
      if (levels && levelFor(cfg, l.stand.z) !== level) return false;
      return true;
    });
  }, [lineups, cfg, showUnverified, utilFilter, areaFilter, levels, level]);

  const areas = useMemo(() => {
    const set = new Map<string, number>();
    for (const l of visible) set.set(l.area || "—", (set.get(l.area || "—") ?? 0) + 1);
    return Array.from(set.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  const unverifiedCount = (lineups ?? []).filter((l) => !l.verified).length;

  const test = async (lineup: Lineup) => {
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

        <div className="util-maps">
          {shownMaps.map(([id, c]) => (
            <button key={id} className={`util-map ${map === id ? "active" : ""}`} onClick={() => setMap(id)}>
              {c.label}
            </button>
          ))}
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

            <div className="util-radar">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={radarUrl(map, level)} alt={`${cfg?.label} radar`} draggable={false} />

              {visible.map((l) => {
                const at = worldToPercent(cfg, l.stand.x, l.stand.y);
                if (!at) return null;
                const active = selected?.id === l.id || hovered === l.id;
                return (
                  <button
                    key={l.id}
                    className={`util-pin ${active ? "active" : ""} ${l.verified ? "" : "unverified"}`}
                    style={{
                      left: `${at.left}%`,
                      top: `${at.top}%`,
                      // The pin points the way you face, so the map shows the
                      // lineup's direction without opening it.
                      ["--yaw" as string]: `${-l.view.yaw}deg`,
                      ["--tint" as string]: UTIL_COLOUR[l.utility] ?? "#ccc",
                    }}
                    title={`${l.name}${l.verified ? "" : " — unverified position"}`}
                    onMouseEnter={() => setHovered(l.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(l)}
                    aria-label={l.name}
                  >
                    <span className="util-pin-dot" />
                    <span className="util-pin-dir" aria-hidden />
                  </button>
                );
              })}

              {/* Where it lands, drawn only for the open lineup. */}
              {selected?.land && (() => {
                const at = worldToPercent(cfg, selected.land.x, selected.land.y);
                return at ? <span className="util-land" style={{ left: `${at.left}%`, top: `${at.top}%` }} /> : null;
              })()}
            </div>

            <p className="util-legend">
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
            </p>
          </div>

          <aside className="util-side">
            {selected ? (
              <div className="util-detail">
                <button className="btn btn-ghost util-back" onClick={() => setSelected(null)}>{t("auto.utilityclient._all_lineups")}</button>

                <h2>{selected.name}</h2>
                <p className="util-tags">
                  <span className="tag tag-accent">{selected.utility}</span>
                  {selected.area && <span className="tag tag-neutral">{selected.area}</span>}
                  {selected.team && <span className="tag tag-neutral">{selected.team}</span>}
                  {!selected.verified && <span className="tag util-warn">{t("auto.utilityclient.unverified")}</span>}
                </p>

                {/* Clips land here once the capture script exists; until then the
                    panel is the instructions, not an empty player. */}
                {selected.clipUrl && (
                  <video className="util-clip" src={selected.clipUrl} poster={selected.thumb ?? undefined} muted loop playsInline autoPlay />
                )}

                <dl className="util-facts">
                  <div><dt>{t("auto.utilityclient.stance")}</dt><dd>{THROW_LABEL[selected.throwType] ?? selected.throwType}</dd></div>
                  <div><dt>{t("auto.utilityclient.button")}</dt><dd>{CLICK_LABEL[selected.clickType] ?? selected.clickType}</dd></div>
                  <div><dt>{t("auto.utilityclient.stand_at")}</dt><dd className="num">{selected.stand.x.toFixed(1)} {selected.stand.y.toFixed(1)} {selected.stand.z.toFixed(1)}</dd></div>
                  <div><dt>{t("auto.utilityclient.look")}</dt><dd className="num">{t("auto.utilityclient.pitch")} {selected.view.pitch.toFixed(3)} {t("auto.utilityclient._yaw")} {selected.view.yaw.toFixed(3)}</dd></div>
                  {selected.land && (
                    <div><dt>{t("auto.utilityclient.lands_at")}</dt><dd className="num">{selected.land.x.toFixed(1)} {selected.land.y.toFixed(1)}</dd></div>
                  )}
                </dl>

                {selected.notes && <p className="util-notes">{selected.notes}</p>}

                {!selected.verified && (
                  <p className="skin-note skin-note-error">
                    <span>
                      {t("auto.utilityclient.this_position_does_not_sit_on")}
                                                              </span>
                  </p>
                )}

                <div className="util-actions">
                  {signedIn ? (
                    <button className="btn btn-primary" onClick={() => test(selected)} disabled={testing}>
                      {testing ? "Setting up…" : "Test in game"}
                    </button>
                  ) : (
                    <a className="btn btn-secondary" href="/api/auth/steam/login">{t("auto.utilityclient.sign_in_to_test")}</a>
                  )}
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(
                          `setpos ${selected.stand.x} ${selected.stand.y} ${selected.stand.z}; setang ${selected.view.pitch} ${selected.view.yaw}`
                        )
                        .then(() => setNote({ kind: "ok", text: "setpos command copied." }))
                        .catch(() => {});
                    }}
                  >
                    {t("auto.utilityclient.copy_setpos")}
                                                        </button>
                </div>

                <div aria-live="polite">
                  {note && (
                    <p className={`skin-note ${note.kind === "ok" ? "skin-note-ok" : "skin-note-error"}`}>
                      <span>{note.text}</span>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="util-list">
                <div className="util-list-head">
                  <h2>{cfg?.label}</h2>
                  <span className="muted num">{visible.length}</span>
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
                    {visible.map((l) => (
                      <li key={l.id}>
                        <button
                          className={`util-row ${hovered === l.id ? "hot" : ""}`}
                          onMouseEnter={() => setHovered(l.id)}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => setSelected(l)}
                        >
                          <span className="util-row-dot" style={{ background: UTIL_COLOUR[l.utility] }} />
                          <span className="util-row-name">
                            {l.name}
                            {!l.verified && <span className="util-row-flag" title={t("auto.utilityclient.position_not_on_the_map")}>?</span>}
                          </span>
                          <span className="util-row-throw">{l.throwType === "standing" ? "" : THROW_LABEL[l.throwType]}</span>
                        </button>
                      </li>
                    ))}
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
