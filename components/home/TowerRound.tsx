"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Shuffle } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  ROUND_SECONDS,
  SCENARIOS,
  TOWER_MAPS,
  clockAt,
  formatClock,
  ownerAt,
  pointAlong,
  polyline,
  scenario,
  type Group,
  type ScenarioId,
  type Step,
} from "@/lib/tournament/towerRound";

/**
 * A Blitz round on Dust II, from above, played out.
 *
 * Replaces the bomb-site diagram, which was an invented site with a bomb on it.
 * This one is the real map (its nav mesh), the real tower spots (the site's plant
 * spots), the spawns the server actually hands out, and the walking routes between
 * them — so every time in it is how long that run really takes. The four tabs are
 * the round's real shapes: the race to the first activation, the takeover, the
 * Roamer's forward spawn, and the stand-off that ends in a draw. Which side wins
 * the race is not scripted: it falls out of the spot, as it would in a match, which
 * is why "Another spot" is worth pressing.
 *
 * Data and rules: lib/tournament/towerRound.ts.
 */

const MAP = TOWER_MAPS.de_dust2;
const ASPECT = 1.25;

/** A site's view, widened to the figure's shape so both sites frame alike. */
function fit([x, y, w, h]: number[]) {
  if (w / h > ASPECT) {
    const nh = w / ASPECT;
    return [x, y - (nh - h) / 2, w, nh];
  }
  const nw = h * ASPECT;
  return [x - (nw - w) / 2, y, nw, h];
}

/** The in-game tower icon (blitz_kit/icons/gadgets.json "tower"), on lucide's 24 grid. */
export function TowerGlyph() {
  return (
    <>
      <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9" />
      <path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5" />
      <circle cx="12" cy="9" r="2" />
      <path d="M16.2 4.8c2 2 2.26 5.11.8 7.47" />
      <path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1" />
      <path d="M9.5 18h5" />
      <path d="m8 22 4-11 4 11" />
    </>
  );
}

const GROUP_SIDE: Record<Group, "t" | "ct"> = { t: "t", ct: "ct", roamer: "ct" };

export default function TowerRound() {
  const { t, locale } = useI18n();
  const [site, setSite] = useState(0);
  const [spot, setSpot] = useState(0);
  const [id, setId] = useState<ScenarioId>("race");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const figRef = useRef<HTMLElement | null>(null);
  const seen = useRef(false);

  const S = MAP.sites[site];
  const sc = useMemo(() => scenario(MAP, site, spot, id), [site, spot, id]);
  const view = useMemo(() => fit(S.view), [S]);
  const k = view[2] / 200;
  const lines = useMemo(
    () => sc.actors.map((a) => polyline(S.routes[spot][a.group][a.index].d)),
    [sc, S, spot]
  );

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

  // A new site, spot or tab plays from the start, once the figure has been seen.
  useEffect(() => {
    if (seen.current) play();
    else setTime(0);
  }, [play]);

  // The first play waits for the figure to be on screen: a race that finished
  // while it was below the fold has nothing left to show.
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
      { threshold: 0.45 }
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
  const over = id === "standoff" && time >= ROUND_SECONDS;
  const tower = S.spots[spot];

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
  const stamp = (at: number | null) =>
    at === null ? "" : at >= ROUND_SECONDS ? "0:00" : `${num(at)} s`;

  const anotherSpot = () => {
    const others = S.spots.map((_, i) => i).filter((i) => i !== spot);
    setSpot(others[Math.floor(Math.random() * others.length)]);
  };

  const labels = MAP.labels.filter(
    (l) => l.x > view[0] + 6 * k && l.x < view[0] + view[2] - 6 * k && l.y > view[1] + 4 * k && l.y < view[1] + view[3] - 4 * k
  );
  const active = new Set(sc.actors.map((a) => `${a.group}:${a.index}`));

  return (
    <figure className="th-figure tr" ref={figRef}>
      <figcaption className="th-figcap">
        <span>{t("home.round.caption")}</span>
        <span className="th-legend">
          <i className="th-key t" /> {t("home.round.legend.t")}
          <i className="th-key ct" /> {t("home.round.legend.ct")}
          <i className="th-key roam" /> {t("role.roamer.name")}
        </span>
      </figcaption>

      <div className="tr-controls">
        <div className="tr-seg" role="group" aria-label={t("home.round.siteLabel")}>
          {MAP.sites.map((s, i) => (
            <button
              key={s.site}
              type="button"
              className={site === i ? "on" : ""}
              aria-pressed={site === i}
              onClick={() => {
                setSite(i);
                setSpot(0);
              }}
            >
              {t("home.round.site", { site: s.site })}
            </button>
          ))}
        </div>
        <span className="tr-spotname">{tower.name}</span>
        <button type="button" className="tr-btn" onClick={anotherSpot}>
          <Shuffle size={13} /> {t("home.round.reroll")}
        </button>
        <button type="button" className="tr-btn" onClick={play} aria-label={t("home.round.replay")}>
          <RotateCcw size={13} />
        </button>
      </div>

      <div className="tr-stage">
        <svg
          className="tr-map"
          viewBox={view.join(" ")}
          role="img"
          aria-label={t("home.round.aria", { site: S.site, spot: tower.name })}
          preserveAspectRatio="xMidYMid slice"
        >
          <path className="tr-floor" d={MAP.floor} fillRule="evenodd" />
          <path className="tr-upper" d={MAP.upper} fillRule="evenodd" />
          <path className="tr-walls" d={MAP.floor} fillRule="evenodd" />

          {labels.map((l) => (
            <text key={l.name} className="tr-label" x={l.x} y={l.y} fontSize={3.3 * k}>
              {l.name}
            </text>
          ))}

          {/* Every route to this tower, faint: where the teams can come from. The
              scenario's own runners are drawn over them, solid. */}
          {(["t", "ct", "roamer"] as Group[]).map((g) =>
            S.routes[spot][g].map((r, i) => (
              <path
                key={`${g}${i}`}
                className={`tr-route ${g} ${active.has(`${g}:${i}`) ? "on" : ""}`}
                d={r.d}
              />
            ))
          )}

          {S.spots.map((p, i) =>
            i === spot ? null : (
              <rect
                key={p.name}
                className="tr-spot"
                x={p.x - 1.5 * k}
                y={p.y - 1.5 * k}
                width={3 * k}
                height={3 * k}
                transform={`rotate(45 ${p.x} ${p.y})`}
              >
                <title>{p.name}</title>
              </rect>
            )
          )}

          {(["t", "ct", "roamer"] as Group[]).map((g) =>
            S[g].map((p, i) =>
              active.has(`${g}:${i}`) && time > 0 ? null : (
                <circle key={`${g}s${i}`} className={`tr-spawn ${g}`} cx={p.x} cy={p.y} r={1.7 * k}>
                  <title>{`${t(`role.${p.role}.name`)} · ${p.name}`}</title>
                </circle>
              )
            )
          )}

          <g className={`tr-tower ${owner ?? "none"}`} transform={`translate(${tower.x} ${tower.y})`}>
            <circle className="tr-tower-disc" r={5.2 * k} />
            {sc.actors.flatMap((a, ai) =>
              a.holds
                .filter((h) => time >= h.from && time < h.to)
                .map((h, hi) => (
                  <circle
                    key={`${ai}h${hi}`}
                    className={`tr-ring ${a.side}`}
                    r={(6.6 + ai * 1.4) * k}
                    pathLength={1}
                    strokeDasharray={`${Math.min(1, (time - h.from) / h.need)} 1`}
                    transform="rotate(-90)"
                  />
                ))
            )}
            <g transform={`scale(${(6.4 * k) / 24}) translate(-12 -12)`} className="tr-tower-glyph">
              <TowerGlyph />
            </g>
          </g>

          {sc.actors.map((a, i) => {
            if (time <= 0) return null;
            const [x, y] = pointAlong(lines[i], a.arrive > 0 ? time / a.arrive : 1);
            const down = a.out !== undefined && time >= a.out;
            return (
              <g key={i} className={`tr-actor ${GROUP_SIDE[a.group]} ${down ? "down" : ""}`} transform={`translate(${x} ${y})`}>
                <circle r={2.3 * k} />
                {down && <path d={`M${-2 * k} ${-2 * k}L${2 * k} ${2 * k}M${2 * k} ${-2 * k}L${-2 * k} ${2 * k}`} />}
                <text y={-3.6 * k} fontSize={3.1 * k}>
                  {t(`role.${a.role}.name`)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* The in-game strip, as the players see it at that moment. */}
        <div className={`tr-hud ${over ? "draw" : owner ?? "none"}`} aria-live="off">
          <b>{formatClock(clock)}</b>
          <span>
            {over
              ? t("home.round.hud.draw")
              : owner
                ? t(`home.round.hud.${owner}`)
                : t("home.round.hud.dormant")}
          </span>
          {id === "standoff" && playing && <em>×{sc.speed}</em>}
        </div>
      </div>

      <div className="tr-tabs" role="tablist" aria-label={t("home.round.tabs")}>
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

      <ol className="tr-steps">
        {sc.steps.map((step, i) => (
          <li key={i} className={step.at === null || step.at <= time + 1e-6 ? "on" : ""}>
            <span className="tr-at">{stamp(step.at)}</span>
            <span>{say(step)}</span>
          </li>
        ))}
      </ol>

      <p className="th-fignote">{say(sc.outcome)}</p>
    </figure>
  );
}
