"use client";

import { BadgeShape } from "@/components/profile/BadgeShape";
import { crRankState, type CrLevel } from "@/lib/crRank";

// Cool to hot as the level climbs, landing on the site's own accent (not
// FACEIT's orange) for the top tier — level 10 is the one badge that is
// unmistakably "this site's", not a generic ladder color.
const LEVEL_COLORS: Record<CrLevel, [string, string]> = {
  1: ["#94a3b8", "#64748b"],
  2: ["#2dd4bf", "#0d9488"],
  3: ["#4ade80", "#16a34a"],
  4: ["#a3e635", "#65a30d"],
  5: ["#facc15", "#ca8a04"],
  6: ["#fbbf24", "#d97706"],
  7: ["#fb923c", "#ea580c"],
  8: ["#f87171", "#dc2626"],
  9: ["#c084fc", "#7e22ce"],
  10: ["#ffd76a", "#ec3013"],
};

export default function RankLevelBadge({
  elo,
  matchesPlayed,
  size = 56,
}: {
  elo: number | null | undefined;
  matchesPlayed: number;
  size?: number;
}) {
  const state = crRankState(elo, matchesPlayed);

  if (state.kind === "placement") {
    return (
      <div className="rank-badge">
        <BadgeShape size={size} colors={["#3a4250", "#20242c"]}>
          <span className="rank-badge-placement">{state.matchesPlayed}/10</span>
        </BadgeShape>
        <div className="rank-badge-meta">
          <span className="rank-badge-level">Placement</span>
          <span className="rank-badge-sub">{state.matchesToGo} match{state.matchesToGo === 1 ? "" : "es"} to go</span>
        </div>
      </div>
    );
  }

  const colors = LEVEL_COLORS[state.level];

  return (
    <div className="rank-badge">
      <BadgeShape size={size} colors={colors} glow={state.level >= 9}>
        <span className="rank-badge-number">{state.level}</span>
      </BadgeShape>
      <div className="rank-badge-meta">
        <span className="rank-badge-level">Level {state.level}</span>
        <span className="rank-badge-sub">{state.elo} elo</span>
      </div>
    </div>
  );
}
