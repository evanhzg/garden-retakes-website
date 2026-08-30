"use client";

import { useI18n } from "@/components/I18nProvider";

/**
 * A bomb site, from above. Invented, not traced.
 *
 * Earlier versions of this tried to be Mirage A and kept being wrong about
 * Mirage A, which is a bad trade: nobody comes to a game-mode page to check a
 * radar, and every inaccuracy was a distraction from the one thing the figure
 * is there to say. So this is a fictional site, laid out to be READ rather than
 * recognised — but laid out honestly, so it would work if you built it.
 *
 * The layout states the mode's asymmetry, which is what the caption beside it
 * claims: two ways in, three ways back.
 *
 *   - The two ATTACK routes are adjacent, both in the south-east. That is the
 *     point: the attack has to arrive together, through one corner, and can be
 *     met at one corner.
 *   - The three RETAKE routes are spread across the west, north and east, so
 *     the defence arrives from everywhere and from behind different cover.
 *
 * Cover is placed so each piece has a job rather than to fill space:
 *
 *   - The long block on the south side of the plant zone is the default plant's
 *     cover — it shields a planted bomb from the north retake, which is why the
 *     zone sits south of centre rather than in the middle of the room.
 *   - The tall block on the west splits the west retake from the site, so that
 *     entrance forces a choice of angle instead of granting the whole room.
 *   - The two crates north of the zone are what the attack has to clear, and
 *     what the north retake gets to use.
 *   - The east crate holds the angle onto the east retake.
 *   - The south-east crate is the attack's first piece of cover inside, so both
 *     attack entries have something to step behind.
 *   - The south-west crate is the far post-plant hold — the one piece of cover
 *     that is a long way from where the attack comes in, so holding it is a
 *     decision rather than a default.
 *
 * The walls are SEPARATE SEGMENTS rather than one closed shape, and the gaps
 * between them are the entrances. A closed outline with arrows around it says
 * "here is a room, and here are some arrows"; a broken one says "here is a room
 * you can walk into, there, there and there". The floor is drawn with no
 * stroke, because a stroke would close every gap.
 */
export default function BombsiteDiagram({ className = "" }: { className?: string }) {
  const { t } = useI18n();

  return (
    <svg
      className={`bs ${className}`}
      viewBox="0 0 420 380"
      role="img"
      aria-label={t("home.map.aria")}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker
          id="bs-arrow-ct"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" className="bs-head ct" />
        </marker>
        <marker
          id="bs-arrow-t"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" className="bs-head t" />
        </marker>
      </defs>

      {/* The floor. Fill only — a stroke here would close the gaps the wall
          segments leave. */}
      <path
        className="bs-floor"
        d="M96 108 L128 70 L236 70 L272 100 L326 100 L326 232 L296 288 L208 318 L128 300 L96 244 Z"
      />

      {/* North-west corner, along the north edge, up to the north retake. */}
      <path className="bs-wall" d="M96 108 L128 70 L156 70" />
      {/* Past it, along the north-east step, down to the east retake. */}
      <path className="bs-wall" d="M200 70 L236 70 L272 100 L326 100 L326 128" />
      {/* Below the east retake, down to the first attack entry. */}
      <path className="bs-wall" d="M326 166 L326 232 L319.4 244.3" />
      {/* The pier between the two attack entries. */}
      <path className="bs-wall" d="M302.6 275.7 L296 288 L274 295.5" />
      {/* Past the second, along the south edge and up to the west retake. */}
      <path className="bs-wall" d="M230 310.5 L208 318 L128 300 L96 244 L96 192" />
      {/* Above the west retake, back to the north-west corner. */}
      <path className="bs-wall" d="M96 150 L96 108" />

      {/* The plantable ground, south of centre so a plant sits behind the long
          block rather than in the open. */}
      <path className="bs-zone" d="M180 196 L274 190 L280 258 L188 266 Z" />

      {/* Cover. See the note above — each of these is here for a reason. */}
      <rect className="bs-block" x="126" y="190" width="32" height="48" />
      <rect className="bs-block" x="186" y="148" width="30" height="26" />
      <rect className="bs-block" x="232" y="138" width="26" height="22" />
      <rect className="bs-block" x="290" y="178" width="26" height="26" />
      <rect className="bs-block" x="176" y="272" width="62" height="18" />
      <rect className="bs-block" x="272" y="264" width="24" height="20" />
      <rect className="bs-block" x="140" y="252" width="30" height="24" />

      <circle className="bs-plant" cx="230" cy="226" r="13" />
      <text className="bs-plant-label" x="230" y="230">
        C4
      </text>

      {/* Three ways back: west, north, east. */}
      <path className="bs-path ct" markerEnd="url(#bs-arrow-ct)" d="M30 171 L96 171" />
      <path className="bs-path ct" markerEnd="url(#bs-arrow-ct)" d="M178 8 L178 70" />
      <path className="bs-path ct" markerEnd="url(#bs-arrow-ct)" d="M392 147 L326 147" />

      {/* Two ways in, side by side in the south-east. */}
      <path className="bs-path t" markerEnd="url(#bs-arrow-t)" d="M365.6 289.3 L311 260" />
      <path className="bs-path t" markerEnd="url(#bs-arrow-t)" d="M272 361.7 L252 303" />

      <text className="bs-site" x="112" y="140">
        A
      </text>
    </svg>
  );
}
