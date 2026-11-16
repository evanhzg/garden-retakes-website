"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Shuffle } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  SCENARIOS,
  TOWER_MAPS,
  actorAt,
  clockAt,
  finalAt,
  formatClock,
  ownerAt,
  polyline,
  routeOf,
  scenario,
  type Group,
  type ScenarioId,
  type Step,
} from "@/lib/tournament/towerRound";

/**
 * A Blitz round on Dust II, from above, played out.
 *
 * The real map (its nav mesh), the real places the server stands the tower — the two
 * bomb sites' plant spots and the field spots between them — the spawns it hands
 * out, and the walking routes between them, so every time in it is how long that run
 * really takes. The whole map is in view because a round uses it: both teams come
 * from a distance, and a player who dies comes back at the team's classic spawn.
 *
 * The tabs are the round's real shapes: the race to the first activation, the
 * takeover that starts the 20 seconds again, a respawn running the long way back,
 * the Roamer's forward spawn, and the stand-off that runs into the final countdown and
 * a draw. Which side wins the race is not scripted: it falls out of the spot, as it
 * would in a match — which is why the zones and "Another spot" are worth pressing.
 *
 * Data and rules: lib/tournament/towerRound.ts.
 */

const MAP = TOWER_MAPS.de_dust2;

/** The in-game tower icon (blitz_kit/icons/gadgets.json "tower" glyph, 32 grid), filled. */
function TowerGlyph() {
  return (
    <>
      <rect x="8.5" y="21.5" width="15" height="8" rx="1.6" />
      <rect x="15" y="6" width="2" height="16" />
      <rect x="11" y="9" width="10" height="1.5" rx=".5" />
      <rect x="12" y="13.2" width="8" height="1.5" rx=".5" />
      <circle cx="16" cy="4.6" r="2.3" />
    </>
  );
}

const GROUP_SIDE: Record<Group, "t" | "ct"> = { t: "t", ct: "ct", roamer: "ct" };

export default function TowerRound() {
  const { t, locale } = useI18n();
  const [zoneIndex, setZone] = useState(0);
  const [spot, setSpot] = useState(0);
  const [id, setId] = useState<ScenarioId>("race");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const figRef = useRef<HTMLElement | null>(null);
  const seen = useRef(false);

  const Z = MAP.zones[zoneIndex];
  const sc = useMemo(() => scenario(MAP, zoneIndex, spot, id), [zoneIndex, spot, id]);
  const view = MAP.bounds;
  const k = view[2] / 200;
  const lines = useMemo(() => sc.actors.map((a) => polyline(routeOf(Z, spot, a).d)), [sc, Z, spot]);

  const reduced = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const play = useCallback(() => {
    if (reduced()) {
      setPlaying(false);
      setTime(sc.end);
      return;
    }
    setTime(0);
    setPlaying(true);
  }, [sc]);

  // A new zone, spot or tab plays from the start, once the figure has been seen.
  useEffect(() => {
    if (seen.current) play();
    else setTime(0);
  }, [play]);

  // The first play waits for the figure to be on screen: a race that finished while
  // it was below the fold has nothing left to show.
  useEffect(() => {
    const el = figRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !seen.current) {
          seen.current = true;
          play();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [play]);

  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const tt = Math.min(sc.end, ((now - start) / 1000) * sc.speed);
      setTime(tt);
      if (tt < sc.end) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, sc]);

  const owner = ownerAt(sc, time);
  const clock = clockAt(sc, time);
  const final = finalAt(time);
  const draw = id === "standoff" && time >= sc.end;
  const tower = Z.spots[spot];

  const num = (n: number) => n.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 1 });
  const say = (step: Step) =>
    t(
      step.key,
      Object.fromEntries(
        Object.entries(step.vars ?? {}).map(([key, v]) => [
          key,
          key === "role"
            ? t(`role.${v}.name`)
            : key === "team"
              ? t(`home.round.team.${v}`)
              : typeof v === "number"
                ? num(v)
                : v,
        ])
      )
    );
  // Seconds into the round; past a minute, as the round clock would count it up.
  const stamp = (at: number | null) => (at === null ? "" : at >= 60 ? formatClock(at) : `${num(at)} s`);

  const anotherSpot = () => {
    const others = Z.spots.map((_, i) => i).filter((i) => i !== spot);
    if (others.length) setSpot(others[Math.floor(Math.random() * others.length)]);
  };

  const active = new Set(sc.actors.filter((a) => a.group !== "respawn").map((a) => `${a.group}:${a.index}`));
  const respawning = sc.actors.find((a) => a.group === "respawn");

  return (
    <figure className="th-figure twr" ref={figRef}>
      <figcaption className="th-figcap">
        <span>{t("home.round.caption")}</span>
        <span className="th-legend">
          <i className="th-key t" /> {t("home.round.legend.t")}
          <i className="th-key ct" /> {t("home.round.legend.ct")}
          <i className="th-key roam" /> {t("role.roamer.name")}
        </span>
      </figcaption>

      <div className="twr-controls">
        <div className="twr-zones" role="group" aria-label={t("home.round.zoneLabel")}>
          {MAP.zones.map((z, i) => (
            <button
              key={z.zone}
              type="button"
              className={`${zoneIndex === i ? "on" : ""} ${z.kind}`}
              aria-pressed={zoneIndex === i}
              onClick={() => {
                setZone(i);
                setSpot(0);
              }}
            >
              {z.kind === "site" ? t("home.round.site", { site: z.name.slice(0, 1) }) : z.name}
            </button>
          ))}
        </div>
        <div className="twr-actions">
          {Z.spots.length > 1 && (
            <button type="button" className="twr-btn" onClick={anotherSpot} title={tower.name}>
              <Shuffle size={13} /> <span>{t("home.round.reroll")}</span>
            </button>
          )}
          <button type="button" className="twr-btn icon" onClick={play} aria-label={t("home.round.replay")} title={t("home.round.replay")}>
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      <div className="twr-stage">
        <svg
          className="twr-map"
          viewBox={view.join(" ")}
          role="img"
          aria-label={t("home.round.aria", { spot: tower.name })}
          preserveAspectRatio="xMidYMid meet"
        >
          <path className="twr-floor" d={MAP.floor} fillRule="evenodd" />
          <path className="twr-upper" d={MAP.upper} fillRule="evenodd" />
          <path className="twr-walls" d={MAP.floor} fillRule="evenodd" />

          {MAP.labels.map((l) => (
            <text key={l.name} className="twr-label" x={l.x} y={l.y} fontSize={3.1 * k}>
              {l.name}
            </text>
          ))}

          {/* The classic spawns: where a respawn comes back. */}
          {(["t", "ct"] as const).map((side) => (
            <g key={side} className={`twr-base ${side}`} transform={`translate(${MAP.bases[side].x} ${MAP.bases[side].y})`}>
              <rect x={-3.2 * k} y={-3.2 * k} width={6.4 * k} height={6.4 * k} rx={1.2 * k} />
            </g>
          ))}

          {/* Every route to this tower, faint: where the teams can come from. The
              scenario's runners are drawn over them, solid. */}
          {(["t", "ct", "roamer"] as Group[]).map((g) =>
            Z.routes[spot][g].map((r, i) => (
              <path key={`${g}${i}`} className={`twr-route ${g} ${active.has(`${g}:${i}`) ? "on" : ""}`} d={r.d} />
            ))
          )}
          {respawning && time >= respawning.start && (
            <path className={`twr-route respawn ${respawning.side} on`} d={routeOf(Z, spot, respawning).d} />
          )}

          {/* The other places the tower can stand on this map, faint. */}
          {MAP.zones.flatMap((z, zi) =>
            z.spots.map((p, pi) =>
              zi === zoneIndex && pi === spot ? null : (
                <rect
                  key={`${zi}-${pi}`}
                  className={`twr-spot ${zi === zoneIndex ? "same" : ""}`}
                  x={p.x - 1.6 * k}
                  y={p.y - 1.6 * k}
                  width={3.2 * k}
                  height={3.2 * k}
                  transform={`rotate(45 ${p.x} ${p.y})`}
                >
                  <title>{p.name}</title>
                </rect>
              )
            )
          )}

          {(["t", "ct", "roamer"] as Group[]).map((g) =>
            Z[g].map((p, i) =>
              active.has(`${g}:${i}`) && time > 0 ? null : (
                <circle key={`${g}s${i}`} className={`twr-spawn ${g}`} cx={p.x} cy={p.y} r={1.8 * k}>
                  <title>{`${t(`role.${p.role}.name`)} · ${p.name}`}</title>
                </circle>
              )
            )
          )}

          <g className={`twr-tower ${owner ?? "none"}`} transform={`translate(${tower.x} ${tower.y})`}>
            <circle className="twr-tower-disc" r={5.4 * k} />
            {sc.actors.flatMap((a, ai) =>
              a.holds
                .filter((h) => time >= h.from && time < h.to)
                .map((h, hi) => (
                  <circle
                    key={`${ai}h${hi}`}
                    className={`twr-ring ${a.side}`}
                    r={(6.8 + (a.side === "t" ? 0 : 1.6)) * k}
                    pathLength={1}
                    strokeDasharray={`${Math.min(1, (time - h.from) / h.need)} 1`}
                    transform="rotate(-90)"
                  />
                ))
            )}
            <g transform={`scale(${(7.2 * k) / 32}) translate(-16 -17)`} className="twr-tower-glyph">
              <TowerGlyph />
            </g>
          </g>

          {sc.actors.map((a, i) => {
            if (time <= 0 || time < a.start) return null;
            // A player who went down and is now back elsewhere is drawn once: the new run.
            const [x, y] = actorAt(lines[i], a, time, 8.5 * k);
            const down = a.out !== undefined && time >= a.out;
            if (down && respawning && respawning.side === a.side && time >= respawning.start) return null;
            const side = a.group === "respawn" ? a.side : GROUP_SIDE[a.group];
            return (
              <g key={i} className={`twr-actor ${side} ${down ? "down" : ""}`} transform={`translate(${x} ${y})`}>
                <circle r={2.5 * k} />
                {down && <path d={`M${-2 * k} ${-2 * k}L${2 * k} ${2 * k}M${2 * k} ${-2 * k}L${-2 * k} ${2 * k}`} />}
                <text y={-3.9 * k} fontSize={3.2 * k}>
                  {t(`role.${a.role}.name`)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* The in-game strip, as the players see it at that moment. */}
        <div className={`twr-hud ${draw ? "draw" : owner ?? "none"} ${final ? "final" : ""}`} aria-live="off">
          <b>{formatClock(clock)}</b>
          <span>
            {draw
              ? t("home.round.hud.draw")
              : `${final ? `${t("home.round.hud.final")} · ` : ""}${owner ? t(`home.round.hud.${owner}`) : t("home.round.hud.dormant")}`}
          </span>
          {sc.speed > 1 && playing && <em>×{sc.speed}</em>}
        </div>
        <p className="twr-where">{tower.name}</p>
      </div>

      <div className="twr-tabs" role="tablist" aria-label={t("home.round.tabs")}>
        {SCENARIOS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={id === s}
            className={id === s ? "on" : ""}
            onClick={() => (id === s ? play() : setId(s))}
          >
            {t(`home.round.sc.${s}`)}
          </button>
        ))}
      </div>

      <ol className="twr-steps">
        {sc.steps.map((step, i) => (
          <li key={i} className={step.at === null || step.at <= time + 1e-6 ? "on" : ""}>
            <span className="twr-at">{stamp(step.at)}</span>
            <span>{say(step)}</span>
          </li>
        ))}
      </ol>

      <p className="th-fignote">{say(sc.outcome)}</p>
    </figure>
  );
}
