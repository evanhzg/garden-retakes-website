import Link from "next/link";
import { type Board } from "@/components/stats/LeaderboardTabs";
import StatsHub, { type Honour, type HubTournamentView } from "@/components/tournament/StatsHub";
import { statsHubData } from "@/lib/tournament/statsDb";
import {
  MONTH_MIN_ROUNDS,
  lastMonthWindow,
  mvpLine,
  pickMvp,
  splitTournaments,
  type Contender,
} from "@/lib/tournament/honours";
import type { PlayerTotals } from "@/lib/tournament/stats";
import { getT, serverLocale } from "@/lib/serverI18n";

/**
 * Site-wide tournament statistics.
 *
 * This is what /stats shows in demo mode, and what the tournament side of the
 * site is measured by: the ladder's season boards are built from ranked pub
 * rounds, which is the half of the site a demo is not about.
 *
 * The work happens here and the shape happens in StatsHub — this file reads
 * the database, decides nothing it can hand to lib/tournament/honours.ts, and
 * passes plain values across. Dates become ISO strings on the way out because
 * a server component cannot hand a Date to a client one.
 */
const MIN_ROUNDS = 12;

export default async function TournamentLeaderboards() {
  const t = getT();
  const { overall, lastMonth, tournaments } = await statsHubData();

  const qualified = overall.filter((p) => p.roundsPlayed >= MIN_ROUNDS);

  if (qualified.length === 0) {
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

  /* ---------- boards ---------- */

  const boardsFor = (players: PlayerTotals[], size: number): Board[] => {
    const top = (value: (p: PlayerTotals) => number) =>
      [...players].sort((a, b) => value(b) - value(a)).slice(0, size);

    const board = (
      title: string,
      unit: string,
      value: (p: PlayerTotals) => number,
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

    return [
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
  };

  /* ---------- honours ---------- */

  const asContender = (p: PlayerTotals): Contender => ({
    steamId: p.steamId,
    name: p.name || p.steamId,
    ratingAvg: p.ratingAvg,
    roundsPlayed: p.roundsPlayed,
    kills: p.kills,
    damage: p.damage,
  });

  const honour = (p: Contender | null): Honour | null =>
    p ? { steamId: p.steamId, name: p.name, ...mvpLine(p) } : null;

  const mvp = honour(pickMvp(overall.map(asContender)));
  const potm = honour(pickMvp(lastMonth.map(asContender), MONTH_MIN_ROUNDS));

  // The month the card is about, named rather than numbered — "August 2026"
  // reads; "2026-08" is a filename.
  const window = lastMonthWindow(new Date());
  const potmMonth = window.start.toLocaleDateString(serverLocale() === "fr" ? "fr-FR" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  /* ---------- tournaments ---------- */

  const { current, past } = splitTournaments(
    tournaments.map((x) => ({
      id: x.id,
      slug: x.slug,
      name: x.name,
      state: x.state,
      startsAt: x.startsAt,
      endedAt: x.endedAt,
    })),
  );

  const byId = new Map(tournaments.map((x) => [x.id, x]));

  const view = (id: number): HubTournamentView | null => {
    const x = byId.get(id);
    if (!x) return null;
    return {
      id: x.id,
      slug: x.slug,
      name: x.name,
      state: x.state,
      startsAt: x.startsAt ? x.startsAt.toISOString() : null,
      endedAt: x.endedAt ? x.endedAt.toISOString() : null,
      rounds: x.rounds,
      teams: x.teams,
      players: x.players.length,
      champion: x.champion,
      // Five rather than ten inside one tournament: a single event rarely has
      // ten players worth ranking, and a board padded out to ten with everyone
      // who turned up is not a leaderboard.
      boards: boardsFor(x.players, 5),
    };
  };

  const views = [...current, ...past]
    .map((x) => view(x.id))
    .filter((x): x is HubTournamentView => x !== null);

  return (
    <StatsHub
      overall={boardsFor(qualified, 10)}
      tournaments={views}
      mvp={mvp}
      potm={potm}
      potmMonth={potmMonth}
      totals={{
        players: qualified.length,
        rounds: tournaments.reduce((n, x) => n + x.rounds, 0),
        tournaments: views.length,
      }}
    />
  );
}
