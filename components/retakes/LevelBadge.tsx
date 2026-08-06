"use client";

import { LEVELS, PLACEMENT_MATCHES, levelOf } from "@/lib/competitive";

// The skill level, as an icon.
//
// Drawn rather than imported: ten PNGs is ten requests and a licensing question
// for something that is a number in a shape. The shape is a shield built from
// stacked chevrons — one per level up to five, then a filled shield with the
// number for six and above — so the badges are distinguishable at 16px in a
// roster and still read as a rank rather than as a bullet point.
//
// A player inside placements has no level yet, and the badge says so instead of
// showing whatever their provisional rating happens to be. Ten games is not a
// verdict, and a level 9 badge that falls to 4 on game eleven is worse than
// having waited.

type Size = "sm" | "md" | "lg";

const PX: Record<Size, number> = { sm: 16, md: 24, lg: 40 };

export default function LevelBadge({
  elo,
  matches,
  size = "md",
  showElo = false,
}: {
  elo?: number | null;
  matches?: number | null;
  size?: Size;
  showElo?: boolean;
}) {
  const px = PX[size];
  const placing = (matches ?? 0) < PLACEMENT_MATCHES;

  if (elo === null || elo === undefined) {
    return <span className="lvl lvl-unknown" style={{ width: px, height: px }} aria-hidden />;
  }

  if (placing) {
    const left = PLACEMENT_MATCHES - (matches ?? 0);
    return (
      <span
        className="lvl lvl-placing"
        style={{ width: px, height: px, fontSize: px * 0.42 }}
        title={`${left} placement ${left === 1 ? "match" : "matches"} left`}
      >
        ?
      </span>
    );
  }

  const l = levelOf(elo);

  return (
    <span className="lvl-wrap">
      <span
        className="lvl"
        style={{ width: px, height: px, fontSize: px * 0.46, ["--lvl" as string]: l.colour }}
        title={`${l.label} — ${elo} elo`}
        aria-label={`${l.label}, ${elo} elo`}
      >
        {l.level}
      </span>
      {showElo && <span className="lvl-elo">{elo}</span>}
    </span>
  );
}

/** The whole scale, for a legend or the explainer page. */
export function LevelScale({ current }: { current?: number }) {
  const active = current === undefined ? null : levelOf(current).level;
  return (
    <ol className="lvl-scale">
      {LEVELS.map((l) => (
        <li key={l.level} className={active === l.level ? "on" : ""}>
          <span className="lvl" style={{ ["--lvl" as string]: l.colour }}>
            {l.level}
          </span>
          <span className="lvl-range">
            {l.min}
            {Number.isFinite(l.max) ? `–${l.max}` : "+"}
          </span>
        </li>
      ))}
    </ol>
  );
}
