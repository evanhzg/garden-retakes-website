"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import type { TournamentAppearance } from "@/lib/tournament/stats";

// A player's tournament record.
//
// Kept apart from the season stats on purpose. Tournament matches do not touch
// the ladder — no ELO moves, no season rating changes — so folding these into
// the same numbers would make a player's profile disagree with itself. They are
// the same player and two different competitions, and this tab says which.
//
// Fetched when the tab is opened, like Clips and FACEIT: most profile visits
// never open it.

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "ready"; tournaments: TournamentAppearance[] };

export default function TournamentPanel({ steamId }: { steamId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;

    fetch(`/api/tournament/player?steamId=${encodeURIComponent(steamId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (!alive) return;
        const list: TournamentAppearance[] = data.tournaments ?? [];
        setState(list.length === 0 ? { kind: "empty" } : { kind: "ready", tournaments: list });
      })
      .catch(() => alive && setState({ kind: "error" }));

    return () => {
      alive = false;
    };
  }, [steamId]);

  if (state.kind === "loading") return <p className="empty-hint">{t("profile.tournaments.loading")}</p>;
  if (state.kind === "error") return <p className="empty-hint">{t("profile.tournaments.failed")}</p>;
  if (state.kind === "empty") return <p className="empty-hint">{t("profile.tournaments.none")}</p>;

  // The career line, so the tab opens on an answer rather than on a table.
  const career = state.tournaments.reduce(
    (acc, a) => ({
      maps: acc.maps + a.totals.maps,
      kills: acc.kills + a.totals.kills,
      deaths: acc.deaths + a.totals.deaths,
      rounds: acc.rounds + a.totals.roundsPlayed,
      ratingRounds: acc.ratingRounds + a.totals.ratingAvg * a.totals.roundsPlayed,
    }),
    { maps: 0, kills: 0, deaths: 0, rounds: 0, ratingRounds: 0 },
  );

  const careerRating = career.rounds > 0 ? career.ratingRounds / career.rounds : 0;

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: "var(--space-4)" }}>
        <div className="stat-card">
          <div className="value">{state.tournaments.length}</div>
          <div className="label">{t("profile.tournaments.played")}</div>
        </div>
        <div className="stat-card">
          <div className="value">{career.maps}</div>
          <div className="label">{t("tournaments.maps")}</div>
        </div>
        <div className="stat-card">
          <div className="value">
            {career.deaths === 0 ? career.kills.toFixed(2) : (career.kills / career.deaths).toFixed(2)}
          </div>
          <div className="label">K/D</div>
        </div>
        <div className="stat-card">
          <div className="value">{careerRating.toFixed(2)}</div>
          <div className="label">{t("tournaments.rating")}</div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, margin: "0 0 var(--space-3)" }}>
        {t("tournaments.statsNote")}
      </p>

      <div className="pro-tablewrap">
        <table className="table num">
          <thead>
            <tr>
              <th>{t("tournaments.name")}</th>
              <th>{t("tournaments.team")}</th>
              <th className="r">{t("tournaments.maps")}</th>
              <th className="r">K</th>
              <th className="r">D</th>
              <th className="r">K/D</th>
              <th className="r">ADR</th>
              <th className="r">KAST</th>
              <th className="r">{t("tournaments.rating")}</th>
            </tr>
          </thead>
          <tbody>
            {state.tournaments.map((a) => (
              <tr key={a.tournamentId}>
                <td>
                  <Link href={`/tournaments/${a.slug}`}>{a.name}</Link>
                  <span className="chip" style={{ marginLeft: 8 }}>{a.state}</span>
                </td>
                <td className="muted">{a.teamName ?? "—"}</td>
                <td className="r">{a.totals.maps}</td>
                <td className="r">{a.totals.kills}</td>
                <td className="r">{a.totals.deaths}</td>
                <td className="r">{a.totals.kd.toFixed(2)}</td>
                <td className="r">{a.totals.adr}</td>
                <td className="r">{a.totals.kast}%</td>
                <td
                  className={`r ${
                    a.totals.ratingAvg >= 1.1 ? "rating-good" : a.totals.ratingAvg < 0.9 ? "rating-bad" : "rating-neutral"
                  }`}
                >
                  {a.totals.ratingAvg.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
