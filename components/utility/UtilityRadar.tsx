"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  UTIL_COLOUR,
  percentToWorld,
  worldToPercent,
  type Lineup,
  type MapOverview,
} from "@/lib/utilityShared";

// The radar, and everything drawn on it.
//
// Zoom lives here rather than in the page because it changes what a pin *is*:
// at 4× the map is legible but a pin scaled with it becomes a dinner plate that
// covers the callout it is marking. So the image scales and the markers
// counter-scale, which keeps them the same size on screen at every zoom level
// and is the only reason zooming into a cluster of six Mirage window smokes
// actually separates them.

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

type Props = {
  cfg: MapOverview;
  radar: string;
  lineups: Lineup[];
  selected: Lineup | null;
  hovered: number | null;
  /** When set, a click on the radar asks "what can I throw at here?" */
  findMode: boolean;
  findAt: { x: number; y: number } | null;
  onHover: (id: number | null) => void;
  onSelect: (l: Lineup) => void;
  onFind: (world: { x: number; y: number } | null) => void;
  label: string;
};

export default function UtilityRadar({
  cfg,
  radar,
  lineups,
  selected,
  hovered,
  findMode,
  findAt,
  onHover,
  onSelect,
  onFind,
  label,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);

  // Panning is clamped so the image can never be dragged off its own frame.
  // Without it the map slides away and there is no obvious way to get it back,
  // which reads as the page being broken rather than as a scroll gone too far.
  const clamp = useCallback((p: { x: number; y: number }, z: number) => {
    const el = wrapRef.current;
    if (!el) return p;
    const size = el.clientWidth;
    const limit = (size * (z - 1)) / 2;
    return {
      x: Math.max(-limit, Math.min(limit, p.x)),
      y: Math.max(-limit, Math.min(limit, p.y)),
    };
  }, []);

  const zoomTo = useCallback(
    (next: number, originX?: number, originY?: number) => {
      const el = wrapRef.current;
      if (!el) return;
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      setZoom((prev) => {
        if (z === prev) return prev;
        // Keep whatever is under the cursor under the cursor. Zooming about the
        // centre instead means aiming at a corner of the map walks it out of
        // frame, and you spend the zoom re-finding what you were looking at.
        const rect = el.getBoundingClientRect();
        const cx = (originX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
        const cy = (originY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
        setPan((p) => clamp({ x: cx - ((cx - p.x) * z) / prev, y: cy - ((cy - p.y) * z) / prev }, z));
        return z;
      });
    },
    [clamp]
  );

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Reset when the map or level changes — staying zoomed into the corner of a
  // map you just left is never what was meant.
  useEffect(() => {
    reset();
  }, [radar, reset]);

  // Wheel has to be bound non-passively or the browser scrolls the page as well
  // as zooming, which it will not let us prevent from a React onWheel prop.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(zoom * (e.deltaY < 0 ? 1.22 : 1 / 1.22), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, zoomTo]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // A few pixels of travel is a click with a shaky hand, not a drag. Without
    // the threshold every pin click also nudges the map.
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setPan(clamp({ x: d.panX + dx, y: d.panY + dy }, zoom));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !findMode) return;

    // A click that did not drag, in find mode, is a question about a place.
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = (((e.clientX - rect.left - rect.width / 2 - pan.x) / zoom + rect.width / 2) / rect.width) * 100;
    const top = (((e.clientY - rect.top - rect.height / 2 - pan.y) / zoom + rect.height / 2) / rect.height) * 100;
    if (left < 0 || left > 100 || top < 0 || top > 100) return;
    onFind(percentToWorld(cfg, left, top));
  };

  const findMark = findAt ? worldToPercent(cfg, findAt.x, findAt.y) : null;

  return (
    <div className="util-radarbox">
      <div
        ref={wrapRef}
        className={`util-radar ${findMode ? "finding" : ""} ${zoom > 1 ? "zoomed" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={reset}
      >
        <div
          className="util-radar-inner"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={radar} alt={label} draggable={false} />

          {lineups.map((l) => {
            const at = worldToPercent(cfg, l.stand.x, l.stand.y);
            if (!at || at.left < -5 || at.left > 105 || at.top < -5 || at.top > 105) return null;
            const active = selected?.id === l.id || hovered === l.id;
            return (
              <button
                key={l.id}
                className={`util-pin ${active ? "active" : ""} ${l.verified ? "" : "unverified"}`}
                style={{
                  left: `${at.left}%`,
                  top: `${at.top}%`,
                  // Counter-scale: the map grows, the marker does not.
                  ["--counter" as string]: String(1 / zoom),
                  // Screen yaw runs clockwise from north while CS2's runs
                  // anticlockwise from east, so the wedge needs both a flip and
                  // a quarter turn. Only the flip used to be applied, which put
                  // every arrow ninety degrees off — consistently, so it looked
                  // deliberate.
                  ["--yaw" as string]: `${90 - l.view.yaw}deg`,
                  ["--tint" as string]: UTIL_COLOUR[l.utility] ?? "#ccc",
                }}
                title={`${l.name}${l.verified ? "" : " — unverified position"}`}
                onMouseEnter={() => onHover(l.id)}
                onMouseLeave={() => onHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(l);
                }}
                aria-label={l.name}
              >
                <span className="util-pin-dot" />
              </button>
            );
          })}

          {/* The flight, for whichever lineup is open or under the cursor.
              A landing dot on its own says where a grenade ends up but not
              which of forty pins threw it, which on a map like Mirage is the
              only question the dot is being asked. The curve answers it, and
              bows away from the straight line so two lineups that land in the
              same doorway stay tellable apart. */}
          {(() => {
            const shown = selected ?? lineups.find((l) => l.id === hovered) ?? null;
            if (!shown) return null;

            const colour = UTIL_COLOUR[shown.utility] ?? "#ccc";

            // The arc the grenade actually flew, when the server recorded it.
            // Everything before that fix — and everything imported — has only
            // two points, so it still gets a bowed curve rather than a straight
            // line, which at least keeps two lineups landing in the same
            // doorway tellable apart.
            const flown = (shown.path ?? [])
              .map(([x, y]) => worldToPercent(cfg, x, y))
              .filter((p): p is { left: number; top: number } => p !== null);

            if (flown.length >= 2) {
              const d = flown
                .map((p, i) => `${i === 0 ? "M" : "L"} ${p.left} ${p.top}`)
                .join(" ");
              return (
                <svg className="util-arc" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                  <path
                    d={d}
                    stroke={colour}
                    strokeWidth={0.5 / zoom}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  {/* A dot running the route, so the direction of travel is
                      obvious without an arrowhead that would be a pixel wide. */}
                  <circle r={0.8 / zoom} fill={colour}>
                    <animateMotion dur="2.2s" repeatCount="indefinite" path={d} />
                  </circle>
                </svg>
              );
            }

            if (!shown.land) return null;
            const from = worldToPercent(cfg, shown.stand.x, shown.stand.y);
            const to = worldToPercent(cfg, shown.land.x, shown.land.y);
            if (!from || !to) return null;

            const [dx, dy] = [to.left - from.left, to.top - from.top];
            const bow = 0.16;
            const cx = (from.left + to.left) / 2 - dy * bow;
            const cy = (from.top + to.top) / 2 + dx * bow;
            return (
              <svg className="util-arc" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                <path
                  d={`M ${from.left} ${from.top} Q ${cx} ${cy} ${to.left} ${to.top}`}
                  stroke={colour}
                  // Counter-scaled like the pins: a line that thickens with the
                  // zoom becomes a stripe across the callout it is describing.
                  strokeWidth={0.5 / zoom}
                  strokeDasharray={`${1.6 / zoom} ${1.1 / zoom}`}
                  fill="none"
                />
              </svg>
            );
          })()}

          {/* Where the open lineup lands, when it was recorded with a landing spot. */}
          {selected?.land &&
            (() => {
              const at = worldToPercent(cfg, selected.land.x, selected.land.y);
              return at ? (
                <span
                  className="util-land"
                  style={{ left: `${at.left}%`, top: `${at.top}%`, ["--counter" as string]: String(1 / zoom) }}
                />
              ) : null;
            })()}

          {findMark && (
            <span
              className="util-findmark"
              style={{ left: `${findMark.left}%`, top: `${findMark.top}%`, ["--counter" as string]: String(1 / zoom) }}
            />
          )}
        </div>
      </div>

      <div className="util-zoom" role="group" aria-label="Zoom">
        <button className="util-zoom-btn" onClick={() => zoomTo(zoom * 1.4)} aria-label="Zoom in">+</button>
        <button className="util-zoom-btn" onClick={() => zoomTo(zoom / 1.4)} aria-label="Zoom out">−</button>
        <button className="util-zoom-btn wide" onClick={reset} disabled={zoom === 1}>
          {zoom === 1 ? "1×" : `${zoom.toFixed(1)}×`}
        </button>
      </div>
    </div>
  );
}
