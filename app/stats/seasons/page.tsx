import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/stats";
import { resolveNames, nameFrom } from "@/lib/names";
import { seasonTotals } from "@/lib/seasons";
import { getT } from "@/lib/serverI18n";

export const revalidate = 60;

// The history table was name / period / champion / best ELO — four columns and
// no way in. Each row now carries the figures that make one season comparable
// to another, and the whole row links to that season's own page.

export default async function SeasonsPage() {
  const t = await getT();
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
        <span className="kicker">{t("seasons.history")}</span>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 60px)", letterSpacing: "-0.025em", margin: "10px 0 8px" }}>
          {t("seasons.everySeason")}
        </h1>
        <p className="muted" style={{ maxWidth: "60ch" }}>
          {t("seasons.description")}
        </p>
      </section>

      <section className="pro-section">
        <div className="pro-section-head">
          <h2>{t("seasons.title")}</h2>
          <span className="pro-section-note">{t("seasons.recorded", { count: rows.length })}</span>
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
                  {season.EndedAtUtc ? formatDate(season.EndedAtUtc.toISOString().slice(0, 10)) : t("seasons.ongoing")}
                  {totals.days ? ` · ${t("seasons.days", { days: totals.days })}` : ""}
                </span>
              </div>

              <div className="season-row-figures">
                {[
                  { k: t("seasons.players"), v: totals.players || "—" },
                  { k: t("seasons.rankedRounds"), v: totals.rankedRounds ? totals.rankedRounds.toLocaleString() : "—" },
                  { k: t("seasons.avgElo"), v: totals.avgElo ? Math.round(totals.avgElo) : "—" },
                  { k: t("seasons.avgAdr"), v: totals.avgAdr ? totals.avgAdr.toFixed(0) : "—" },
                  { k: t("seasons.avgKd"), v: totals.avgKd ? totals.avgKd.toFixed(2) : "—" },
                ].map((f) => (
                  <span key={f.k} className="season-figure">
                    <span className="num season-figure-v">{f.v}</span>
                    <span className="season-figure-k">{f.k}</span>
                  </span>
                ))}
              </div>

              <div className="season-row-champ">
                <span className="season-figure-k">{t("seasons.champion")}</span>
                <span className="season-row-champ-name">{best ? nameFrom(names, best.SteamId) : "—"}</span>
                {best && <span className="num season-row-champ-elo">{t("seasons.peakElo", { elo: best.PeakElo })}</span>}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
