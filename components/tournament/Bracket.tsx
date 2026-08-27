"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import MatchBubble from "./MatchBubble";
import type { MatchPreview } from "@/lib/tournament/preview";
import "./bracket.css";

// A bracket, as CSS grid.
//
// No library: a bracket is columns of boxes with the vertical spacing doubling
// each round, which grid does natively and a dependency would do the same way
// with more to go wrong. The connecting lines are borders on pseudo-elements
// rather than SVG, so they follow the boxes when the text wraps.
//
// A client component now, only because the hover bubble needs pointer events.
// Nothing here reads the database — the previews arrive as props.

export type BracketMatch = {
  id: number;
  round: number;
  slot: number;
  bestOf: number;
  state: string;
  teamA: { id: number; name: string } | null;
  teamB: { id: number; name: string } | null;
  scoreA: number;
  scoreB: number;
  winnerTeamId: number | null;
};

export default function Bracket({
  matches,
  previews,
  slug,
}: {
  matches: BracketMatch[];
  /** Keyed by match id. Absent is fine — the box simply has no bubble. */
  previews?: Record<number, MatchPreview>;
  /** When given, every box links to its own match page. */
  slug?: string;
}) {
  const { t } = useI18n();

  if (matches.length === 0) {
    return null;
  }

  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);
  const lastRound = rounds[rounds.length - 1];

  return (
    <div className="br" role="table" aria-label="Bracket">
      {rounds.map((round) => {
        const inRound = matches.filter((m) => m.round === round).sort((a, b) => a.slot - b.slot);

        return (
          <div key={round} className="br-round" style={{ "--gap-mult": 2 ** (round - 1) } as React.CSSProperties}>
            {/* These were three hardcoded English strings in a site that ships
                a French dictionary and gates its build on the two matching. */}
            <h4 className="br-round-name">
              {round === lastRound
                ? t("bracket.final")
                : round === lastRound - 1
                  ? t("bracket.semis")
                  : round === lastRound - 2
                    ? t("bracket.quarters")
                    : t("bracket.round", { n: String(round) })}
            </h4>

            {inRound.map((match) => (
              <MatchBubble
                key={match.id}
                preview={previews?.[match.id] ?? null}
                teamA={match.teamA?.name ?? "—"}
                teamB={match.teamB?.name ?? "—"}
                className="br-slot"
              >
                <BoxLink slug={slug} matchId={match.id}>
                <div className={`br-match ${match.state === "live" ? "live" : ""}`}>
                  <Row
                    team={match.teamA}
                    score={match.scoreA}
                    won={match.winnerTeamId !== null && match.winnerTeamId === match.teamA?.id}
                    decided={match.winnerTeamId !== null}
                  />
                  <Row
                    team={match.teamB}
                    score={match.scoreB}
                    won={match.winnerTeamId !== null && match.winnerTeamId === match.teamB?.id}
                    decided={match.winnerTeamId !== null}
                  />

                  {match.bestOf > 1 && <span className="br-bo">BO{match.bestOf}</span>}
                </div>
                </BoxLink>
              </MatchBubble>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A bracket box, linked to its match page when there is one to link to.
 *
 * A plain wrapper when there is not, rather than a disabled link: a box for a
 * match whose feeder has not been played yet leads nowhere useful, and a link
 * that goes nowhere is worse than text.
 */
function BoxLink({
  slug,
  matchId,
  children,
}: {
  slug?: string;
  matchId: number;
  children: React.ReactNode;
}) {
  if (!slug) return <>{children}</>;
  return (
    <Link className="br-link" href={`/tournaments/${slug}/match/${matchId}`}>
      {children}
    </Link>
  );
}

function Row({
  team,
  score,
  won,
  decided,
}: {
  team: { id: number; name: string } | null;
  score: number;
  won: boolean;
  decided: boolean;
}) {
  return (
    <div className={`br-row ${won ? "won" : decided ? "lost" : ""}`}>
      {/* An empty slot is a match still waiting on a feeder, which is a
          different thing from a bye and should not read as a team called "TBD". */}
      <span className={`br-name ${team ? "" : "pending"}`}>{team?.name ?? "—"}</span>
      <span className="br-score">{decided || score > 0 ? score : ""}</span>
    </div>
  );
}
