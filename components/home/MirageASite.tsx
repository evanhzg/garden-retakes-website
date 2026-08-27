"use client";

import { useI18n } from "@/components/I18nProvider";

/**
 * Mirage A, from above.
 *
 * A diagram, not a render. No textures, no lighting, no attempt at scale — the
 * only job is to make "the T side comes from two places and the CT side from
 * three" legible to somebody who has never played the map, and to give the veto
 * section something real to point at instead of a decorative shape.
 *
 * Solid outlines are geometry you can stand on or behind. Dashed lines are
 * entry paths, and they are dashed precisely because they are not walls — a
 * solid line into the site would read as another piece of cover.
 *
 * Orientation follows the in-game radar: palace at the top, ramp on the left,
 * CT spawn and connector on the right. Anybody who has played the map should
 * recognise it without being told which way up it is.
 */
export default function MirageASite({ className = "" }: { className?: string }) {
  const { t } = useI18n();

  return (
    <svg
      className={`mirage ${className}`}
      viewBox="0 0 420 340"
      role="img"
      aria-label={t("home.map.aria")}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* One arrowhead per side, because a marker cannot inherit the colour
            of the path that uses it. */}
        <marker id="ar-t" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" className="mirage-arrow-t" />
        </marker>
        <marker id="ar-ct" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" className="mirage-arrow-ct" />
        </marker>
      </defs>

      {/* ---------------------------------------------------- the site floor */}
      <path
        className="mirage-floor"
        d="M120 96 L300 96 L300 250 L150 250 L120 214 Z"
      />

      {/* --------------------------------------------------------- structures
          Only the ones that change how the site is taken: the two stacks people
          hide behind and the raised platform at the back. */}
      <rect className="mirage-block" x="150" y="120" width="46" height="34" rx="1" />
      <text className="mirage-tiny" x="173" y="141">
        {t("home.map.tetris")}
      </text>

      <rect className="mirage-block" x="238" y="176" width="44" height="30" rx="1" />
      <text className="mirage-tiny" x="260" y="195">
        {t("home.map.triple")}
      </text>

      <rect className="mirage-block" x="152" y="196" width="34" height="40" rx="1" />
      <text className="mirage-tiny" x="169" y="220">
        {t("home.map.sandwich")}
      </text>

      {/* The default plant spot, which is what the whole diagram is about. */}
      <circle className="mirage-plant" cx="215" cy="178" r="13" />
      <text className="mirage-plant-label" x="215" y="182">
        C4
      </text>

      {/* ------------------------------------------------------- T approaches
          Palace from the top, ramp from the left. Dashed, and in the attacking
          colour. */}
      <path className="mirage-path t" markerEnd="url(#ar-t)" d="M258 22 L258 60 Q258 80 246 92" />
      <text className="mirage-label t" x="262" y="34">
        {t("home.map.palace")}
      </text>

      <path className="mirage-path t" markerEnd="url(#ar-t)" d="M24 200 L74 200 Q104 200 118 190" />
      <text className="mirage-label t" x="26" y="190">
        {t("home.map.ramp")}
      </text>

      {/* ------------------------------------------------------ CT approaches
          Three of them, which is the point of the diagram: a retake arrives
          from more directions than an entry does. */}
      <path className="mirage-path ct" markerEnd="url(#ar-ct)" d="M396 130 L340 130 Q312 130 304 140" />
      <text className="mirage-label ct" x="394" y="120" textAnchor="end">
        {t("home.map.ct")}
      </text>

      <path className="mirage-path ct" markerEnd="url(#ar-ct)" d="M396 214 L344 214 Q314 214 304 208" />
      <text className="mirage-label ct" x="394" y="234" textAnchor="end">
        {t("home.map.jungle")}
      </text>

      <path className="mirage-path ct" markerEnd="url(#ar-ct)" d="M232 322 L232 286 Q232 262 224 254" />
      <text className="mirage-label ct" x="236" y="330">
        {t("home.map.stairs")}
      </text>

      {/* ------------------------------------------------------------ callout */}
      <text className="mirage-site" x="278" y="118">
        A
      </text>
    </svg>
  );
}
