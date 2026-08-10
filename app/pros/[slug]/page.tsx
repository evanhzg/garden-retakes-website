import Link from "next/link";
import { getActiveSeason, prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { dayKey, fetchRows, groupBy, ratingClass, sideName, summarize, formatDate, formatPlaytime } from "@/lib/stats";
import CharacterHero from "@/components/CharacterHero";
import AvatarImage from "@/components/AvatarImage";
import ProfileActivity from "@/components/ProfileActivity";
import PerformanceMeters from "@/components/profile/PerformanceMeters";
import SeasonFilters from "@/components/profile/SeasonFilters";
import { notFound } from "next/navigation";
import { getT } from '@/lib/serverI18n';

export const dynamic = "force-dynamic";
export const revalidate = 30;

export default async function ProPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { season?: string; ranked?: string };
}) {
    const t = getT();

  const webProfile = await prisma.gardenWebProfile.findUnique({
    where: { ProSlug: params.slug },
  });

  if (!webProfile || !webProfile.IsPro) {
    notFound();
  }

  const steamId = webProfile.SteamId;
  const activeSeason = await getActiveSeason();
  const seasonId = searchParams.season ? Number(searchParams.season) : activeSeason?.Id ?? 0;
  const rankedOnly = searchParams.ranked === "1";
  const query = (extra: string) =>
    `?season=${seasonId}${rankedOnly ? "&ranked=1" : ""}${extra}`;

  const [profile, override, seasonStats, seasons, rows] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { SteamId: steamId } }),
    prisma.gardenNameOverride.findUnique({ where: { SteamId: steamId } }),
    prisma.playerSeasonStats.findFirst({ where: { SeasonId: seasonId, SteamId: steamId } }),
    prisma.season.findMany({ orderBy: { Id: "asc" } }),
    fetchRows(seasonId, steamId, rankedOnly),
  ]);

  const name = override?.Name ?? profile?.LastKnownName ?? params.slug;
  const nickname = profile?.LastKnownName?.toLowerCase() ?? params.slug;
  const isOwnPage = getSession()?.steamId === steamId.toString();
  const total = summarize(rows);

  const bySide = groupBy(rows, (r) => sideName(r.TeamNum)).map(
    ([side, sideRows]) => [side, summarize(sideRows)] as const
  );
  const byMap = groupBy(rows, (r) => r.Map)
    .map(([map, mapRows]) => [map, summarize(mapRows)] as const)
    .sort((a, b) => b[1].rounds - a[1].rounds);
  const byDay = groupBy(rows, (r) => dayKey(r.PlayedAtUtc))
    .map(([day, dayRows]) => [day, summarize(dayRows)] as const)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14);

  const recentRatings = rows
    .filter((r) => !r.WasAfk)
    .slice(-30)
    .map((r) => r.Rating);
  return (
    <>
      {/* ---------- Character image hero ---------- */}
      <CharacterHero
        steamId={steamId.toString()}
        playerName={name}
        characterSrc={`/pros/${nickname}_character.png`}
        stats={[
          { label: "Rating", value: total.rating.toFixed(2), big: true },
          { label: `CS Rating${seasonStats?.PeakElo ? ` · peak ${seasonStats.PeakElo}` : ""}`, value: String(seasonStats?.Elo ?? "—") },
          { label: "K/D", value: total.kd.toFixed(2) },
          { label: "ADR", value: total.adr.toFixed(0) },
          { label: `Win rate · ${total.rounds} rds`, value: `${total.winPct.toFixed(0)}%` },
          { label: `Clutches · ${total.openingKills} OK`, value: String(total.clutches) },
        ]}
      />

      {/* ---------- Hero ---------- */}
      <section className="panel">
        <div className="player-hero">
          <div className="player-avatar">
            <AvatarImage steamId={steamId.toString()} src={webProfile.AvatarUrl || `/pros/${nickname}_pp.png`} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 className="hero-name">
              {name}
              <span className="mini-badge pro-badge">{t("auto.page.pro")}</span>
              {override && <span className="mini-badge">{t("auto.page.custom_name")}</span>}
            </h1>
            <div className="hero-sub">
              {t("auto.page.steamid64")} {steamId.toString()}
              {webProfile?.Country ? ` · ${webProfile.Country}` : ""}
              {rankedOnly ? " · ranked rounds only" : " · all rounds"}
            </div>
            <ProfileActivity steamId={steamId.toString()} lastConnectedUtc={profile?.LastSeenAtUtc} />
            {webProfile?.Bio && <p className="player-bio">{webProfile.Bio}</p>}
          </div>
          <div className="player-hero-actions">
            {isOwnPage && (
              <Link className="btn small secondary" href="/profile">
                {t("auto.page._edit_profile")}
                                            </Link>
            )}
            <Link className="btn secondary" href={`/compare?a=${steamId.toString()}`}>
              {t("auto.page._compare")}
                                      </Link>
          </div>
        </div>

        <SeasonFilters
          seasons={seasons}
          seasonId={seasonId}
          rankedOnly={rankedOnly}
          rankedOnlyLabel={t("auto.page.ranked_only")}
          style={{ marginTop: 16, marginBottom: 0 }}
        />
      </section>

      {/* ---------- Headline numbers ---------- */}
      <section className="panel">
        <div className="bigstat-row">
          <div className="bigstat">
            <div className={`num ${ratingClass(total.rating)}`}>{total.rating.toFixed(2)}</div>
            <div className="cap">{t("auto.page.rating")}</div>
          </div>
          <div className="bigstat">
            <div className="num rating-neutral">{seasonStats?.Elo ?? "—"}</div>
            <div className="cap">{t("auto.page.cs_rating_peak")} {seasonStats?.PeakElo ?? "—"})</div>
          </div>
          <div className="bigstat">
            <div className="num rating-neutral">{total.kd.toFixed(2)}</div>
            <div className="cap">
              {t("auto.page.k_d")}{total.kills}/{total.deaths})
            </div>
          </div>
          <div className="bigstat">
            <div className="num rating-neutral">{total.rounds}</div>
            <div className="cap">{t("auto.page.rounds")} {byMap.length} {t("auto.page.maps")}</div>
          </div>
          <div className="bigstat">
            <div className="num rating-neutral">{formatPlaytime(profile?.TimeSpentSeconds ?? 0)}</div>
            <div className="cap">{t("auto.page.playtime")}</div>
          </div>
        </div>

        <PerformanceMeters
          meters={[
            { label: t("auto.page.round_win"), value: total.winPct, display: `${total.winPct.toFixed(0)}%` },
            { label: t("auto.page.kast"), value: total.kast, display: `${total.kast.toFixed(0)}%` },
            { label: t("auto.page.headshots"), value: total.hs, display: `${total.hs.toFixed(0)}%` },
            { label: t("auto.page.adr"), value: (total.adr / 150) * 100, display: total.adr.toFixed(0) },
          ]}
          recentRatings={recentRatings}
          ratingHistoryLabel={`${t("auto.page.last")} ${recentRatings.length} ${t("auto.page.rounds_rating")}`}
        />
      </section>

      {/* ---------- Per side ---------- */}
      <section className="panel">
        <h2>{t("auto.page.per_side")}</h2>
        {bySide.length === 0 ? (
          <p className="empty-hint">{t("auto.page.no_rounds_recorded_with_these")}</p>
        ) : (
          <div className="split-cards">
            {bySide.map(([side, s]) => (
              <div key={side} className="side-card">
                <h3>
                  <span>{side === "T" ? "Terrorist (defense)" : "Counter-Terrorist (retake)"}</span>
                  <span className={`side-tag ${side === "T" ? "side-t" : "side-ct"}`}>{side}</span>
                </h3>
                <div className="stat-grid">
                  <div className="stat-card">
                    <div className={`value ${ratingClass(s.rating)}`}>{s.rating.toFixed(2)}</div>
                    <div className="label">{t("auto.page.rating")}</div>
                  </div>
                  <div className="stat-card">
                    <div className="value">{s.kd.toFixed(2)}</div>
                    <div className="label">{t("auto.page.k_d")}</div>
                  </div>
                  <div className="stat-card">
                    <div className="value">{s.adr.toFixed(0)}</div>
                    <div className="label">{t("auto.page.adr")}</div>
                  </div>
                  <div className="stat-card">
                    <div className="value">{s.winPct.toFixed(0)}%</div>
                    <div className="label">{t("auto.page.win")} {s.rounds} {t("auto.page.rounds")}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Per map ---------- */}
      <section className="panel">
        <h2>{t("auto.page.per_map")}</h2>
        {byMap.length === 0 ? (
          <p className="empty-hint">{t("auto.page.nothing_yet")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("auto.page.map")}</th>
                <th>{t("auto.page.rounds")}</th>
                <th>{t("auto.page.win")}</th>
                <th>{t("auto.page.k_d")}</th>
                <th>{t("auto.page.adr")}</th>
                <th>{t("auto.page.kast")}</th>
                <th>{t("auto.page.rating")}</th>
              </tr>
            </thead>
            <tbody>
              {byMap.map(([map, s]) => (
                <tr key={map}>
                  <td style={{ fontWeight: 700 }}>{map}</td>
                  <td>{s.rounds}</td>
                  <td>{s.winPct.toFixed(0)}%</td>
                  <td>
                    {s.kills} — {s.deaths}
                  </td>
                  <td>{s.adr.toFixed(0)}</td>
                  <td>{s.kast.toFixed(0)}%</td>
                  <td className={ratingClass(s.rating)} style={{ fontWeight: 800 }}>
                    {s.rating.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---------- Per day ---------- */}
      <section className="panel">
        <h2>{t("auto.page.per_day_last")} {byDay.length})</h2>
        {byDay.length === 0 ? (
          <p className="empty-hint">{t("auto.page.nothing_yet")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("auto.page.day")}</th>
                <th>{t("auto.page.rounds")}</th>
                <th>{t("auto.page.win")}</th>
                <th>{t("auto.page.k_d")}</th>
                <th>{t("auto.page.adr")}</th>
                <th>{t("auto.page.clutches")}</th>
                <th>{t("auto.page.rating")}</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map(([day, s]) => (
                <tr key={day}>
                  <td style={{ fontWeight: 700 }}>{formatDate(day)}</td>
                  <td>{s.rounds}</td>
                  <td>{s.winPct.toFixed(0)}%</td>
                  <td>
                    {s.kills} — {s.deaths}
                  </td>
                  <td>{s.adr.toFixed(0)}</td>
                  <td>{s.clutches}</td>
                  <td className={ratingClass(s.rating)} style={{ fontWeight: 800 }}>
                    {s.rating.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---------- Extras ---------- */}
      <section className="panel">
        <h2>{t("auto.page.details")}</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="value">{total.openingKills}</div>
            <div className="label">{t("auto.page.opening_kills")}{total.openingDeaths} {t("auto.page.deaths")}</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.clutches}</div>
            <div className="label">{t("auto.page.clutches_won")}</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.multiKills}</div>
            <div className="label">{t("auto.page.multi_kill_rounds")}</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.tradeKills}</div>
            <div className="label">{t("auto.page.trade_kills")}</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.utilPerRound.toFixed(1)}</div>
            <div className="label">{t("auto.page.util_dmg_round")}</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.enemiesFlashed}</div>
            <div className="label">{t("auto.page.enemies_flashed")}</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.defuses}</div>
            <div className="label">{t("auto.page.defuses")}{total.plants} {t("auto.page.plants")}</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.kpr.toFixed(2)}</div>
            <div className="label">{t("auto.page.kills_round")}</div>
          </div>
        </div>
      </section>
    </>
  );
}
