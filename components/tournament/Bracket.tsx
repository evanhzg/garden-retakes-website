"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import MatchModal from "./MatchModal";
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
  const [open, setOpen] = useState<BracketMatch | null>(null);

  if (matches.length === 0) {
    return null;
  }

  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);
  const lastRound = rounds[rounds.length - 1];

  /**
   * "Match 5", counted across the whole bracket rather than per round.
   *
   * Numbered in reading order — every match of round one, then round two — so
   * the number on the card is the number an organizer says out loud, and two
   * matches never share one.
   */
  const numberOf = new Map<number, number>();
  [...matches]
    .sort((a, b) => a.round - b.round || a.slot - b.slot)
    .forEach((m, i) => numberOf.set(m.id, i + 1));

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

            <div className="br-slots">
            {inRound.map((match) => (
              <MatchBubble
                key={match.id}
                preview={previews?.[match.id] ?? null}
                teamA={match.teamA?.name ?? "—"}
                teamB={match.teamB?.name ?? "—"}
                // Decided matches draw a solid line onward; undecided ones stay
                // dashed. The winner's path through the bracket is then
                // readable as a line rather than by comparing scores.
                className={`br-slot ${match.winnerTeamId !== null ? "decided" : ""}`}
              >
                <BoxLink slug={slug} match={match} onOpen={setOpen}>
                <div className={`br-match ${match.state === "live" ? "live" : ""}`}>
                  {/* Which match this is, top left. A bracket is discussed out
                      loud — "go and look at match 5" — and without a number the
                      only way to name one is by its two teams, which is exactly
                      what changes when it is still TBD. */}
                  <span className="br-num">
                    {t("bracket.matchNumber", { n: String(numberOf.get(match.id) ?? 0) })}
                  </span>

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
          </div>
        );
      })}

      <MatchModal match={open} slug={slug ?? ""} onClose={() => setOpen(null)} />
    </div>
  );
}

/**
 * A bracket box, opening its match in a modal.
 *
 * It used to be a Link straight to the match page, which is a whole navigation
 * away from the bracket somebody is reading — and on a phone, losing your place
 * in a horizontally scrolled bracket to check one score is a bad trade. The
 * modal answers in place and offers the full page for anybody who wants the
 * veto board.
 *
 * A plain wrapper when there is no tournament to open into, rather than a
 * disabled control: a box whose feeder has not been played leads nowhere
 * useful, and a button that does nothing is worse than text.
 */
function BoxLink({
  slug,
  match,
  onOpen,
  children,
}: {
  slug?: string;
  match: BracketMatch;
  onOpen: (m: BracketMatch) => void;
  children: React.ReactNode;
}) {
  // A placeholder preview has a negative id and no real match behind it.
  if (!slug || match.id < 0) return <>{children}</>;

  return (
    <button type="button" className="br-link" onClick={() => onOpen(match)}>
      {children}
    </button>
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
