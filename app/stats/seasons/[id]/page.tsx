import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/stats";
import { resolveNames, nameFrom } from "@/lib/names";
import { resolveAvatars } from "@/lib/avatars";
import AvatarImage from "@/components/AvatarImage";
import { seasonTotals } from "@/lib/seasons";
import { getT } from '@/lib/serverI18n';

export const revalidate = 60;

// One season, in full: the headline totals, the final ladder, who led each
// metric, and which maps it was actually played on.

export async function generateMetadata({ params }: { params: { id: string } }) {
  const season = await prisma.season.findUnique({ where: { Id: Number(params.id) } });
  return { title: season ? `${season.Name} — Season stats` : "Season" };
}

export default async function SeasonPage({ params }: { params: { id: string } }) {
    const t = getT();

  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const season = await prisma.season.findUnique({ where: { Id: id } });
  if (!season) notFound();

  const [totals, ladder, maps] = await Promise.all([
    seasonTotals(season.Id, season.StartedAtUtc, season.EndedAtUtc),
    prisma.playerSeasonStats.findMany({
      where: { SeasonId: season.Id, RankedRoundsPlayed: { gt: 0 } },
      orderBy: { Elo: "desc" },
      take: 100,
    }),
    prisma.playerRoundRecord.groupBy({
      by: ["Map"],
      where: { SeasonId: season.Id },
      _count: { _all: true },
      orderBy: { _count: { Map: "desc" } },
    }),
  ]);

  const ids = ladder.map((l) => l.SteamId);

  // Per-player round aggregates for the leaderboards. One grouped query rather
  // than a query per player.
  const [totalsByPlayer, deathsByPlayer, names, avatars] = await Promise.all([
    prisma.playerRoundRecord.groupBy({
      by: ["SteamId"],
      where: { SeasonId: season.Id, IsRanked: true, SteamId: { in: ids } },
      _sum: { Kills: true, Damage: true },
      _count: { _all: true },
    }),
    prisma.playerRoundRecord.groupBy({
      by: ["SteamId"],
      where: { SeasonId: season.Id, IsRanked: true, SteamId: { in: ids }, Died: true },
      _count: { _all: true },
    }),
    resolveNames(ids),
    resolveAvatars(ids),
  ]);

  const roundsOf = new Map(totalsByPlayer.map((t) => [t.SteamId.toString(), t]));
  const deathOf = new Map(deathsByPlayer.map((d) => [d.SteamId.toString(), d._count._all]));

  const players = ladder.map((entry) => {
    const key = entry.SteamId.toString();
    const agg = roundsOf.get(key);
    const rounds = agg?._count._all ?? 0;
    const kills = agg?._sum.Kills ?? 0;
    const deaths = deathOf.get(key) ?? 0;
    return {
      steamId: key,
      name: nameFrom(names, entry.SteamId),
      avatar: avatars[key],
      elo: entry.Elo,
      peakElo: entry.PeakElo,
      rounds,
      won: entry.RankedRoundsWon,
      winPct: entry.RankedRoundsPlayed ? (100 * entry.RankedRoundsWon) / entry.RankedRoundsPlayed : 0,
      kd: deaths > 0 ? kills / deaths : kills,
      adr: rounds ? (agg?._sum.Damage ?? 0) / rounds : 0,
    };
  });

  // Leaders need a floor of rounds, otherwise one lucky round tops every board.
  const MIN_ROUNDS = 25;
  const eligible = players.filter((p) => p.rounds >= MIN_ROUNDS);
  const leaderOf = <K extends keyof (typeof players)[number]>(key: K) =>
    eligible.length ? eligible.reduce((a, b) => (Number(b[key]) > Number(a[key]) ? b : a)) : null;

  const leaders = [
    { label: "Highest ELO", player: leaderOf("elo"), format: (p: (typeof players)[number]) => String(p.elo) },
    { label: "Best K/D", player: leaderOf("kd"), format: (p: (typeof players)[number]) => p.kd.toFixed(2) },
    { label: "Best ADR", player: leaderOf("adr"), format: (p: (typeof players)[number]) => p.adr.toFixed(0) },
    { label: "Most rounds", player: leaderOf("rounds"), format: (p: (typeof players)[number]) => String(p.rounds) },
  ].filter((l) => l.player);

  const mapTotal = maps.reduce((n, m) => n + m._count._all, 0);

  return (
    <>
      <section className="pro-hero">
        <span className="kicker">
          <Link href="/stats/seasons" style={{ color: "inherit" }}>{t("auto.page.seasons")}</Link> · {season.IsActive ? "Live" : "Archived"}
        </span>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 60px)", letterSpacing: "-0.025em", margin: "10px 0 6px" }}>
          {season.Name}
        </h1>
        <p className="muted">
          {formatDate(season.StartedAtUtc.toISOString().slice(0, 10))} →{" "}
          {season.EndedAtUtc ? formatDate(season.EndedAtUtc.toISOString().slice(0, 10)) : "ongoing"}
          {totals.days ? ` · ${totals.days} days` : ""}
        </p>

        <div className="pro-headline">
          {[
            { k: "Players", v: totals.players },
            { k: "Ranked rounds", v: totals.rankedRounds.toLocaleString() },
            { k: "Rounds recorded", v: totals.totalRounds.toLocaleString() },
            { k: "Avg ELO", v: totals.avgElo ? Math.round(totals.avgElo) : "—" },
            { k: "Peak ELO", v: totals.peakElo ?? "—" },
            { k: "Avg ADR", v: totals.avgAdr ? totals.avgAdr.toFixed(0) : "—" },
            { k: "Avg K/D", v: totals.avgKd ? totals.avgKd.toFixed(2) : "—" },
            { k: "Kills", v: totals.kills.toLocaleString() },
          ].map((s) => (
            <div key={s.k} className="pro-stat">
              <span className="num pro-stat-v">{s.v}</span>
              <span className="pro-stat-k">{s.k}</span>
            </div>
          ))}
        </div>
      </section>

      {leaders.length > 0 && (
        <section className="pro-section">
          <div className="pro-section-head">
            <h2>{t("auto.page.leaders")}</h2>
            <span className="pro-section-note">{t("auto.page.min")} {MIN_ROUNDS} {t("auto.page.ranked_rounds")}</span>
          </div>
          <div className="season-leaders">
            {leaders.map((l) => (
              <Link key={l.label} href={`/players/${l.player!.steamId}?season=${season.Id}`} className="season-leader">
                <AvatarImage steamId={l.player!.steamId} src={l.player!.avatar} alt={l.player!.name} className="grayscale avatar avatar-lg" />
                <span className="season-figure-k">{l.label}</span>
                <span className="season-leader-name">{l.player!.name}</span>
                <span className="num season-leader-v">{l.format(l.player!)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="pro-section">
        <div className="pro-section-head">
          <h2>{t("auto.page.final_ladder")}</h2>
          <span className="pro-section-note">{players.length} {t("auto.page.shown")}</span>
        </div>
        {players.length === 0 ? (
          <p className="empty-hint">{t("auto.page.no_ranked_rounds_were_recorded")}</p>
        ) : (
          <div className="pro-tablewrap">
            <table className="table num">
              <thead>
                <tr>
                  <th scope="col" className="r">#</th>
                  <th scope="col">{t("auto.page.player")}</th>
                  <th scope="col" className="r">{t("auto.page.elo")}</th>
                  <th scope="col" className="r">{t("auto.page.peak")}</th>
                  <th scope="col" className="r">{t("auto.page.rounds")}</th>
                  <th scope="col" className="r">{t("auto.page.win")}</th>
                  <th scope="col" className="r">{t("auto.page.k_d")}</th>
                  <th scope="col" className="r">{t("auto.page.adr")}</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.steamId}>
                    <td className="r muted">{i + 1}</td>
                    <td>
                      <Link href={`/players/${p.steamId}?season=${season.Id}`} className="season-player">
                        <AvatarImage steamId={p.steamId} src={p.avatar} alt={p.name} className="avatar avatar-sm" />
                        {p.name}
                      </Link>
                    </td>
                    <td className="r" style={{ fontWeight: 700, color: "var(--color-accent)" }}>{p.elo}</td>
                    <td className="r muted">{p.peakElo}</td>
                    <td className="r">{p.rounds || "—"}</td>
                    <td className="r">{p.winPct.toFixed(0)}%</td>
                    <td className="r">{p.rounds ? p.kd.toFixed(2) : "—"}</td>
                    <td className="r">{p.rounds ? p.adr.toFixed(0) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {maps.length > 0 && (
        <section className="pro-section">
          <div className="pro-section-head">
            <h2>{t("auto.page.maps")}</h2>
            <span className="pro-section-note">{mapTotal.toLocaleString()} {t("auto.page.rounds")}</span>
          </div>
          <div className="season-maps">
            {maps.map((m) => {
              const pct = mapTotal ? (100 * m._count._all) / mapTotal : 0;
              return (
                <div key={m.Map} className="season-map">
                  <span className="season-map-name">{m.Map}</span>
                  <div className="pro-meter-track">
                    <div className="pro-meter-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="num season-map-v">{pct.toFixed(0)}%</span>
                  <span className="season-figure-k">{m._count._all.toLocaleString()} {t("auto.page.rds")}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
