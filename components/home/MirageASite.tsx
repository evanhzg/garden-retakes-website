"use client";

import { useI18n } from "@/components/I18nProvider";

/**
 * Mirage A, from above.
 *
 * Laid out to the map rather than to the page: the site is the wide room with
 * the cut-off south-west corner that it actually is, the five ways in are where
 * they are relative to each other, and the cover is in the right corners.
 * Orientation follows the in-game radar — ramp from the south-west and palace
 * from the south where the T side arrives, connector and jungle on the east,
 * CT stairs from the north.
 *
 * A faithful schematic, not a traced floorplan. The proportions and the
 * positions are right; the numbers are not surveyed units and nothing here
 * should be measured off.
 *
 * The walls are SEPARATE SEGMENTS rather than one closed shape, and the gaps
 * between them are the entrances. That is the whole trick: a closed outline
 * with arrows around it says "here is a room, and here are some arrows"; a
 * broken one says "here is a room you can walk into, there, there and there",
 * which is the only thing this diagram is for. The floor is drawn with no
 * stroke of its own, because a stroke would close every gap.
 *
 * The approach lines are white, straight and unlabelled. Colouring them per
 * side implied an ownership the map does not have — three of the five are used
 * by both teams — and labels turned a diagram into a legend that anybody who
 * has played the map does not need.
 *
 * Each arrow lands on the CENTRE of its own gap, and the cover is placed so
 * that no entrance opens straight into a box: an arrow that appears to spear
 * a crate reads as a mistake even when the crate is where it belongs.
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
        <marker
          id="mir-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" className="mirage-arrow" />
        </marker>
      </defs>

      {/* The floor. Fill only — see the note above about strokes closing gaps. */}
      <path className="mirage-floor" d="M96 84 L300 84 L300 250 L150 250 L96 196 Z" />

      {/* North wall, broken for CT stairs. */}
      <path className="mirage-wall" d="M96 84 L236 84" />
      <path className="mirage-wall" d="M276 84 L300 84" />

      {/* East wall, broken twice: jungle high, connector low. */}
      <path className="mirage-wall" d="M300 84 L300 108" />
      <path className="mirage-wall" d="M300 146 L300 178" />
      <path className="mirage-wall" d="M300 212 L300 250" />

      {/* South wall, broken for palace. */}
      <path className="mirage-wall" d="M300 250 L272 250" />
      <path className="mirage-wall" d="M232 250 L150 250" />

      {/* The cut south-west corner, broken for ramp. */}
      <path className="mirage-wall" d="M150 250 L138 238" />
      <path className="mirage-wall" d="M110 210 L96 196" />

      {/* West wall, solid. */}
      <path className="mirage-wall" d="M96 196 L96 84" />

      {/* ---------------------------------------------------------- the cover */}

      {/* Triple, west, the thing ramp has to deal with. */}
      <rect className="mirage-block" x="112" y="124" width="38" height="54" />
      <text className="mirage-tiny" x="131" y="154">
        {t("home.map.triple")}
      </text>

      {/* Sandwich, north, short of the CT entrance. */}
      <rect className="mirage-block" x="186" y="100" width="44" height="26" />
      <text className="mirage-tiny" x="208" y="116">
        {t("home.map.sandwich")}
      </text>

      {/* Tetris, south-centre, west of where palace lands. */}
      <rect className="mirage-block" x="190" y="198" width="52" height="32" />
      <text className="mirage-tiny" x="216" y="217">
        {t("home.map.tetris")}
      </text>

      {/* Default plant, between triple and tetris, which is where it goes. */}
      <circle className="mirage-plant" cx="180" cy="164" r="14" />
      <text className="mirage-plant-label" x="180" y="168">
        C4
      </text>

      {/* -------------------------------------------------------- the ways in */}

      {/* CT stairs, from the north. */}
      <path className="mirage-path" markerEnd="url(#mir-arrow)" d="M256 26 L256 84" />

      {/* Jungle, from the east, high. */}
      <path className="mirage-path" markerEnd="url(#mir-arrow)" d="M392 127 L300 127" />

      {/* Connector, from the east, low. */}
      <path className="mirage-path" markerEnd="url(#mir-arrow)" d="M392 195 L300 195" />

      {/* Palace, from the south. */}
      <path className="mirage-path" markerEnd="url(#mir-arrow)" d="M252 312 L252 250" />

      {/* Ramp, into the cut corner. */}
      <path className="mirage-path" markerEnd="url(#mir-arrow)" d="M66 282 L124 224" />

      {/* ------------------------------------------------------------ callout */}
      <text className="mirage-site" x="268" y="170">
        A
      </text>
    </svg>
  );
}
