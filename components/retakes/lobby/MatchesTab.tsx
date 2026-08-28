"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import RetakesIcon from "@/components/retakes/RetakesIcon";
import AvatarImage from "@/components/AvatarImage";
import { usePlayerNames, displayNameFor } from "@/components/games/hooks";
import { mapImage, mapName } from "@/lib/maps";

type Match = {
  id: string;
  seasonId: number;
  map: string;
  startedAt: string;
  endedAt: string | null;
  teamSize: number;
  score: [number, number];
  teamName: string;
  opponentName: string;
  roster: string[];
  opponents: string[];
  eloDelta: number;
  outcome: "win" | "loss" | "draw" | "cancelled";
  /** Where the match page is, when the match has one. */
  url?: string | null;
};

/**
 * Matches you have actually played.
 *
 * What this replaces: a "View Last Match" button wired to matchId="dummy-123",
 * a hardcoded 13-11, and two invented teammates called PlayerOne and PlayerTwo.
 * There is no seed here and no placeholder — CrMatches is written by the game
 * server when a match finishes, so until one does this list is empty and says
 * so. An empty state that is true is worth more than a full one that is not.
 *
 * The viewer's side is always first in the score, so a row reads "us, them"
 * rather than as whichever roster the server happened to call A.
 */
export default function MatchesTab({ steamId }: { steamId?: string | null }) {
  const { t } = useI18n();
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Both rosters of every match, resolved in one request rather than per row.
  // Without this the detail panel listed raw SteamID64s — seventeen digits that
  // identify a person to nobody.
  const names = usePlayerNames(
    (matches ?? []).flatMap((m) => [...m.roster, ...m.opponents]),
  );

  useEffect(() => {
    if (!steamId) return;
    fetch("/api/match/history")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMatches(Array.isArray(d?.matches) ? d.matches : []))
      .catch(() => setMatches([]));
  }, [steamId]);

  if (!steamId) return <p className="muted rq-empty">{t("lobby.matches.signin")}</p>;
  if (matches === null) return <p className="muted rq-empty">{t("lobby.matches.loading")}</p>;

  if (matches.length === 0) {
    return (
      <div className="rq-empty-state">
        <RetakesIcon id="matches" size={44} />
        <h3>{t("lobby.matches.emptyTitle")}</h3>
        <p className="muted">{t("lobby.matches.emptyBody")}</p>
      </div>
    );
  }

  return (
    <ul className="rq-matches">
      {matches.map((m) => {
        const [us, them] = m.score;
        const expanded = open === m.id;
        const minutes =
          m.endedAt && m.startedAt
            ? Math.max(1, Math.round((Date.parse(m.endedAt) - Date.parse(m.startedAt)) / 60000))
            : null;

        return (
          <li key={m.id} className={`rq-match ${m.outcome}`}>
            <button
              type="button"
              className="rq-match-row"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : m.id)}
            >
              <img className="rq-match-map" src={mapImage(m.map)} alt="" loading="lazy" />

              <span className="rq-match-where">
                <strong>{mapName(m.map)}</strong>
                <span className="muted">
                  {new Date(m.startedAt).toLocaleDateString()}
                  {minutes ? ` · ${t("lobby.matches.minutes", { n: minutes })}` : ""}
                  {` · ${m.teamSize}v${m.teamSize}`}
                </span>
              </span>

              <span className="rq-match-score">
                <span className="us">{us}</span>
                <span className="sep">–</span>
                <span className="them">{them}</span>
              </span>

              <span className={`rq-match-outcome ${m.outcome}`}>
                {t(`lobby.matches.outcome.${m.outcome}`)}
              </span>

              <span className={`rq-match-elo ${m.eloDelta >= 0 ? "up" : "down"}`}>
                {m.eloDelta >= 0 ? "+" : ""}
                {m.eloDelta}
              </span>
            </button>

            {expanded && (
              <div className="rq-match-detail">
                <div className="rq-match-team">
                  <h4>{m.teamName || t("lobby.matches.yourTeam")}</h4>
                  <ul>
                    {m.roster.map((id) => (
                      <li key={id} className={id === steamId ? "me" : ""}>
                        <AvatarImage steamId={id} className="rq-match-face" alt="" />
                        <span>{displayNameFor(id, names)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rq-match-team">
                  <h4>{m.opponentName || t("lobby.matches.opponents")}</h4>
                  <ul>
                    {m.opponents.map((id) => (
                      <li key={id}>
                        <AvatarImage steamId={id} className="rq-match-face" alt="" />
                        <span>{displayNameFor(id, names)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Only the matches that have a page. A CrMatch is written by
                    the game server and has nowhere to go; every match formed in
                    the lobby now runs through the tournament pipeline and has
                    the full page — scoreboard, veto, roles, and the admin
                    controls for whoever may use them. */}
                {m.url && (
                  <a className="btn btn-secondary rq-match-open" href={m.url}>
                    <ExternalLink size={14} />
                    {t("lobby.matches.openMatch")}
                  </a>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
