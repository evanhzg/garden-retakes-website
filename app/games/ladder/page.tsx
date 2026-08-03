"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from '@/components/I18nProvider';
import "./ladder.css";

type Stat = {
  steamId: string;
  name: string;
  gameId: string;
  matchesPlayed: number;
  matchesWon: number;
  totalScore: number;
  elo: number;
};

export default function GamesLadderPage() {
    const { t } = useI18n();

  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/games/ladder?gameId=${filter}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setStats(data);
        else setStats([]);
      })
      .catch(() => setStats([]))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="ladder-page">
      <header className="ladder-header">
        <Link href="/games" className="back-link">{t("auto.page._back_to_hub")}</Link>
        <h1>{t("auto.page.games_ladder")}</h1>
        <p>{t("auto.page.top_players_across_all_web_gam")}</p>
      </header>
      
      <div className="ladder-filters">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{t("auto.page.all_games")}</button>
        <button className={filter === "monopoly" ? "active" : ""} onClick={() => setFilter("monopoly")}>{t("auto.page.monopoly")}</button>
        <button className={filter === "uno" ? "active" : ""} onClick={() => setFilter("uno")}>{t("auto.page.ouno")}</button>
        <button className={filter === "skribbl" ? "active" : ""} onClick={() => setFilter("skribbl")}>{t("auto.page.free_draw")}</button>
        <button className={filter === "meme" ? "active" : ""} onClick={() => setFilter("meme")}>{t("auto.page.meme")}</button>
        <button className={filter === "codenames" ? "active" : ""} onClick={() => setFilter("codenames")}>{t("auto.page.codenames")}</button>
        <button className={filter === "cah" ? "active" : ""} onClick={() => setFilter("cah")}>{t("auto.page.pile_of")}</button>
        <button className={filter === "headshot" ? "active" : ""} onClick={() => setFilter("headshot")}>{t("auto.page.headshot")}</button>
      </div>

      <div className="ladder-table-container glass-panel">
        {loading ? (
          <div className="ladder-loading"><div className="loader" /></div>
        ) : stats.length === 0 ? (
          <div className="ladder-empty">{t("auto.page.no_stats_available_yet_go_play")}</div>
        ) : (
          <table className="ladder-table">
            <thead>
              <tr>
                <th>{t("auto.page.rank")}</th>
                <th>{t("auto.page.player")}</th>
                {filter === "all" && <th>{t("auto.page.game")}</th>}
                <th>{t("auto.page.elo")}</th>
                <th>{t("auto.page.win_rate")}</th>
                <th>{t("auto.page.matches")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => {
                const wr = s.matchesPlayed > 0 ? Math.round((s.matchesWon / s.matchesPlayed) * 100) : 0;
                return (
                  <tr key={`${s.steamId}-${s.gameId}`}>
                    <td className="rank-cell">#{i + 1}</td>
                    <td className="name-cell">
                      <Link href={`/players/${s.steamId}`}>{s.name}</Link>
                    </td>
                    {filter === "all" && <td className="game-cell">{s.gameId.toUpperCase()}</td>}
                    <td className="elo-cell">{s.elo}</td>
                    <td className="wr-cell">{wr}%</td>
                    <td className="matches-cell">{s.matchesWon} / {s.matchesPlayed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
