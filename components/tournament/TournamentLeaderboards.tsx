import Link from "next/link";
import LeaderboardTabs, { type Board } from "@/components/stats/LeaderboardTabs";
import { allTournamentStats } from "@/lib/tournament/statsDb";
import { getT } from "@/lib/serverI18n";
import "./tstats.css";

/**
 * Site-wide tournament leaderboards.
 *
 * This is what /stats shows in demo mode: the ladder's season boards are built
 * from ranked pub rounds, which is exactly the half of the site a demo is not
 * about. Same component, same shape, tournament rows.
 *
 * The minimum-rounds floor is what stops a leaderboard from being a list of
 * whoever played two rounds and got a lucky ace.
 */
const MIN_ROUNDS = 12;

export default async function TournamentLeaderboards() {
  const t = getT();
  const players = await allTournamentStats(MIN_ROUNDS);

  if (players.length === 0) {
    return (
      <section className="panel">
        <h2>{t("tstats.title")}</h2>
        <p className="muted">{t("tstats.empty")}</p>
        <Link className="btn btn-primary" href="/tournaments" style={{ marginTop: 12 }}>
          {t("tstats.browse")}
        </Link>
      </section>
    );
  }

  const top = (value: (p: (typeof players)[number]) => number) =>
    [...players].sort((a, b) => value(b) - value(a)).slice(0, 10);

  const board = (
    title: string,
    unit: string,
    value: (p: (typeof players)[number]) => number,
    format: (v: number) => string,
  ): Board => ({
    title,
    unit,
    rows: top(value).map((p) => ({
      steamId: p.steamId,
      name: p.name || p.steamId,
      value: format(value(p)),
    })),
  });

  const boards: Board[] = [
    board(t("tstats.rating"), "Rating", (p) => p.ratingAvg, (v) => v.toFixed(2)),
    board(t("tstats.adr"), "ADR", (p) => p.adr, (v) => v.toFixed(0)),
    board(t("tstats.kd"), "K/D", (p) => p.kd, (v) => v.toFixed(2)),
    board(t("tstats.kast"), "KAST %", (p) => p.kast, (v) => `${v.toFixed(0)}%`),
    board(t("tstats.hs"), "HS %", (p) => p.hs, (v) => `${v.toFixed(0)}%`),
    board(t("tstats.kills"), "Kills", (p) => p.kills, (v) => String(v)),
    board(t("tstats.entries"), "Entries", (p) => p.entryKills, (v) => String(v)),
    board(t("tstats.clutches"), "Clutches", (p) => p.clutches, (v) => String(v)),
    board(t("tstats.utility"), "Util dmg", (p) => p.utilityDamage, (v) => v.toFixed(0)),
  ];

  const rounds = players.reduce((n, p) => n + p.roundsPlayed, 0);

  return (
    <>
      <section className="panel">
        <h2 style={{ marginBottom: 4 }}>{t("tstats.title")}</h2>
        <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
          {t("tstats.subtitle")}
        </p>

        <div className="tstats-tiles">
          <div className="tstats-tile">
            <span className="tstats-tile-value">{players.length}</span>
            <span className="tstats-tile-label">{t("tstats.players")}</span>
          </div>
          <div className="tstats-tile">
            <span className="tstats-tile-value">{rounds.toLocaleString()}</span>
            <span className="tstats-tile-label">{t("tstats.rounds")}</span>
          </div>
          <div className="tstats-tile">
            <span className="tstats-tile-value">{MIN_ROUNDS}</span>
            <span className="tstats-tile-label">{t("tstats.minRounds")}</span>
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 14 }}>{t("tstats.leaders")}</h3>
        <LeaderboardTabs boards={boards} />
      </section>
    </>
  );
}
