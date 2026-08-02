import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/stats";
import { resolveNames, nameFrom } from "@/lib/names";
import { seasonTotals } from "@/lib/seasons";

export const revalidate = 60;

// The history table was name / period / champion / best ELO — four columns and
// no way in. Each row now carries the figures that make one season comparable
// to another, and the whole row links to that season's own page.

export default async function SeasonsPage() {
  const seasons = await prisma.season.findMany({ orderBy: { Id: "desc" } });

  const rows = await Promise.all(
    seasons.map(async (season) => {
      const [best, totals] = await Promise.all([
        prisma.playerSeasonStats.findFirst({
          where: { SeasonId: season.Id, RankedRoundsPlayed: { gt: 0 } },
          orderBy: { Elo: "desc" },
        }),
        seasonTotals(season.Id, season.StartedAtUtc, season.EndedAtUtc),
      ]);
      return { season, best, totals };
    })
  );

  const names = await resolveNames(rows.map((r) => r.best?.SteamId).filter(Boolean) as bigint[]);

  return (
    <>
      <section className="pro-hero">
        <span className="kicker">History</span>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 60px)", letterSpacing: "-0.025em", margin: "10px 0 8px" }}>
          Every season.
        </h1>
        <p className="muted" style={{ maxWidth: "60ch" }}>
          Champions, records and the shape of each season across the lifetime of the server.
        </p>
      </section>

      <section className="pro-section">
        <div className="pro-section-head">
          <h2>Seasons</h2>
          <span className="pro-section-note">{rows.length} recorded</span>
        </div>

        <div className="season-list">
          {rows.map(({ season, best, totals }) => (
            <Link key={season.Id} href={`/stats/seasons/${season.Id}`} className="season-row">
              <div className="season-row-id">
                <span className="season-row-name">
                  {season.IsActive && <span className="live-dot" style={{ marginRight: 8 }} />}
                  {season.Name}
                </span>
                <span className="season-row-dates">
                  {formatDate(season.StartedAtUtc.toISOString().slice(0, 10))} →{" "}
                  {season.EndedAtUtc ? formatDate(season.EndedAtUtc.toISOString().slice(0, 10)) : "ongoing"}
                  {totals.days ? ` · ${totals.days}d` : ""}
                </span>
              </div>

              <div className="season-row-figures">
                {[
                  { k: "Players", v: totals.players || "—" },
                  { k: "Ranked rounds", v: totals.rankedRounds ? totals.rankedRounds.toLocaleString() : "—" },
                  { k: "Avg ELO", v: totals.avgElo ? Math.round(totals.avgElo) : "—" },
                  { k: "Avg ADR", v: totals.avgAdr ? totals.avgAdr.toFixed(0) : "—" },
                  { k: "Avg K/D", v: totals.avgKd ? totals.avgKd.toFixed(2) : "—" },
                ].map((f) => (
                  <span key={f.k} className="season-figure">
                    <span className="num season-figure-v">{f.v}</span>
                    <span className="season-figure-k">{f.k}</span>
                  </span>
                ))}
              </div>

              <div className="season-row-champ">
                <span className="season-figure-k">Champion</span>
                <span className="season-row-champ-name">{best ? nameFrom(names, best.SteamId) : "—"}</span>
                {best && <span className="num season-row-champ-elo">{best.PeakElo} peak</span>}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
