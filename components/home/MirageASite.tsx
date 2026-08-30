"use client";

import { useI18n } from "@/components/I18nProvider";

/**
 * Mirage A, from above, north up.
 *
 * Orientation traced off a callouts radar rather than remembered, because the
 * remembered one was wrong on every side: everything the T side uses comes in
 * from the EAST, and the CT side arrives from the west and south-west. Going
 * clockwise from the top-left the six ways in are jungle (north-west), the
 * connector neck (north), ramp (east, upper), heaven (east, the raised lip over
 * shadow directly in front of palace), palace (south-east) and CT (south-west).
 *
 * A schematic, not a traced floorplan. The shape and the placements are right;
 * the numbers are not surveyed units and nothing here should be measured off.
 *
 * The walls are SEPARATE SEGMENTS rather than one closed shape, and the gaps
 * between them are the entrances. That is the whole trick: a closed outline
 * with arrows around it says "here is a room, and here are some arrows"; a
 * broken one says "here is a room you can walk into, there, there and there",
 * which is the only thing this diagram is for. The floor is drawn with no
 * stroke, because a stroke would close every gap.
 *
 * The approach lines are white, straight and unlabelled. Per-side colours
 * implied an ownership the map does not have — several of the six are used by
 * both teams — and callouts turned a diagram into a legend. Each arrow lands on
 * the centre of its own gap, from outside.
 */
export default function MirageASite({ className = "" }: { className?: string }) {
  const { t } = useI18n();

  return (
    <svg
      className={`mirage ${className}`}
      viewBox="0 0 420 380"
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

      {/* The floor, including the connector neck at the top. Fill only — a
          stroke here would close the gaps the wall segments leave. */}
      <path
        className="mirage-floor"
        d="M96 96 L140 68 L176 68 L176 40 L218 40 L218 68 L284 68 L328 100 L328 248 L300 292 L236 320 L156 326 L96 268 Z"
      />

      {/* West wall, from the CT gap up to the jungle gap on the NW chamfer. */}
      <path className="mirage-wall" d="M111 282.5 L96 268 L96 96 L108.3 88.2" />
      {/* Past jungle, along to the connector neck. */}
      <path className="mirage-wall" d="M127.7 75.8 L140 68 L176 68 L176 40" />
      {/* Other side of the neck, north edge, NE chamfer, down to ramp. */}
      <path className="mirage-wall" d="M218 40 L218 68 L284 68 L328 100 L328 114" />
      {/* The pier between ramp and heaven. */}
      <path className="mirage-wall" d="M328 150 L328 190" />
      {/* Below heaven, down to the palace gap on the SE chamfer. */}
      <path className="mirage-wall" d="M328 224 L328 248 L322.4 256.8" />
      {/* Past palace, along the south edge, back up to the CT gap. */}
      <path className="mirage-wall" d="M305.6 283.2 L300 292 L236 320 L156 326 L141 311.5" />

      {/* The plantable zone, and the crates that ring it. */}
      <path className="mirage-zone" d="M162 214 L252 206 L258 272 L172 282 Z" />

      <rect className="mirage-block" x="132" y="212" width="26" height="26" />
      <rect className="mirage-block" x="160" y="176" width="24" height="20" />
      <rect className="mirage-block" x="214" y="166" width="22" height="20" />
      <rect className="mirage-block" x="258" y="176" width="26" height="22" />
      <rect className="mirage-block" x="262" y="252" width="24" height="22" />
      <rect className="mirage-block" x="196" y="286" width="24" height="20" />

      <circle className="mirage-plant" cx="210" cy="244" r="13" />
      <text className="mirage-plant-label" x="210" y="248">
        C4
      </text>

      {/* The six ways in, each landing on the centre of its own gap. */}
      <path className="mirage-path" markerEnd="url(#mir-arrow)" d="M84.7 29.7 L118 82" />
      <path className="mirage-path" markerEnd="url(#mir-arrow)" d="M197 6 L197 40" />
      <path className="mirage-path" markerEnd="url(#mir-arrow)" d="M392 132 L328 132" />
      <path className="mirage-path" markerEnd="url(#mir-arrow)" d="M392 207 L328 207" />
      <path className="mirage-path" markerEnd="url(#mir-arrow)" d="M362.9 301.1 L314 270" />
      <path className="mirage-path" markerEnd="url(#mir-arrow)" d="M85.7 338.7 L126 297" />

      <text className="mirage-site" x="110" y="150">
        A
      </text>
    </svg>
  );
}
