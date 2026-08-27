"use client";

import { Crown, Medal, Award } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import AvatarImage from "@/components/AvatarImage";
import type { PlayerTotals } from "@/lib/tournament/stats";
import type { TeamView } from "./TournamentView";
import "./results.css";

// How a finished tournament ends.
//
// Everything else on this page is a working surface — a bracket to navigate, a
// table to compare. This is the only panel that exists to say who won, and it
// is the one people screenshot. So it is a podium rather than a first row of a
// table, and it is the tab a finished tournament opens on: the answer to the
// question somebody arrived with should not be three clicks away.

export type Podium = {
  place: number;
  teamId: number;
  name: string;
  tag: string | null;
  players: { steamId: string; name: string }[];
};

export default function Results({
  podium,
  players,
  teams,
  tournamentName,
}: {
  podium: Podium[];
  /** Best first, already sorted. */
  players: PlayerTotals[];
  teams: TeamView[];
  tournamentName: string;
}) {
  const { t } = useI18n();

  const champion = podium.find((p) => p.place === 1) ?? null;
  const rest = podium.filter((p) => p.place > 1);
  const topThree = players.slice(0, 3);

  if (podium.length === 0 && players.length === 0) {
    return <p className="muted">{t("results.none")}</p>;
  }

  const teamOf = (steamId: string) =>
    teams.find((team) => team.players.some((p) => p.steamId === steamId))?.name ?? null;

  return (
    <div className="rs-results">
      {champion && (
        <section className="rr-champion">
          <Crown size={20} aria-hidden />
          <p className="rr-champion-label">{t("results.winner")}</p>
          <h3 className="rr-champion-name">
            {champion.name}
            {champion.tag && <span className="tv-tag">{champion.tag}</span>}
          </h3>

          {champion.players.length > 0 && (
            <ul className="rr-champion-roster">
              {champion.players.map((p) => (
                <li key={p.steamId}>
                  <AvatarImage steamId={p.steamId} alt="" className="rr-face" />
                  <a href={`/players/${p.steamId}`}>{p.name}</a>
                </li>
              ))}
            </ul>
          )}

          <p className="rr-champion-of">{tournamentName}</p>
        </section>
      )}

      {rest.length > 0 && (
        <section className="rr-block">
          <h4 className="rr-heading">{t("results.podium")}</h4>
          <ol className="rr-podium">
            {rest.map((p) => (
              <li key={`${p.place}-${p.teamId}`} className={`rr-step place-${p.place}`}>
                {p.place === 2 ? <Medal size={16} aria-hidden /> : <Award size={16} aria-hidden />}
                <span className="rr-place">{ordinal(p.place, t)}</span>
                <span className="rr-team">{p.name}</span>
                {p.tag && <span className="tv-tag">{p.tag}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {topThree.length > 0 && (
        <section className="rr-block">
          <h4 className="rr-heading">{t("results.topPlayers")}</h4>

          <ol className="rr-players">
            {topThree.map((p, i) => (
              <li key={p.steamId} className={`rr-player rank-${i + 1}`}>
                <span className="rr-rank">{i + 1}</span>
                <AvatarImage steamId={p.steamId} alt="" className="rr-face lg" />

                <div className="rr-player-main">
                  <a className="rr-player-name" href={`/players/${p.steamId}`}>
                    {p.name}
                  </a>
                  {teamOf(p.steamId) && <span className="muted">{teamOf(p.steamId)}</span>}
                </div>

                {/* Three numbers, not eleven. This is a highlight, and the full
                    table is one tab away for anybody who wants the rest. */}
                <dl className="rr-player-stats">
                  <div>
                    <dt>{t("tstats.rating")}</dt>
                    <dd className="num">{p.ratingAvg.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>{t("tstats.adr")}</dt>
                    <dd className="num">{p.adr.toFixed(0)}</dd>
                  </div>
                  <div>
                    <dt>{t("tstats.kd")}</dt>
                    <dd className="num">{p.kd.toFixed(2)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** "2nd" / "3rd", translated — French does not build them the same way. */
function ordinal(place: number, t: (k: string, v?: Record<string, string>) => string): string {
  return t(`results.place${place}`) || String(place);
}
