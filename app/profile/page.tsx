import Link from "next/link";
import { getT } from "@/lib/serverI18n";
import { getSession } from "@/lib/auth";
import { getActiveSeason, prisma } from "@/lib/db";
import { dayKey, fetchRows, groupBy, sideName, summarize } from "@/lib/stats";
import { resolveName } from "@/lib/names";
import ProfileHero from "@/components/profile/ProfileHero";
import ProfileStats from "@/components/profile/ProfileStats";
import PassportCard from "@/components/profile/PassportCard";

export const dynamic = "force-dynamic";

export type ProfileHeroStats = {
  elo: number | null;
  peakElo: number | null;
  rating: number;
  kd: number;
  adr: number;
  winPct: number;
  rounds: number;
  hs: number;
  kast: number;
  clutches: number;
  openingKills: number;
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { season?: string; ranked?: string };
}) {
  const t = getT();
  const session = getSession();

  if (!session) {
    return (
      <section className="pro-section">
        <h2>{t("profile.title")}</h2>
        <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "center" }}>
          <p style={{ margin: 0 }}>{t("profile.signInPrompt")}</p>
          <a className="btn btn-primary" href="/api/auth/steam/login">
            {t("profile.signInButton")}
          </a>
        </div>
      </section>
    );
  }

  const steamId = BigInt(session.steamId);
  const activeSeason = await getActiveSeason();
  const seasonId = searchParams.season ? Number(searchParams.season) : activeSeason?.Id ?? 0;
  const rankedOnly = searchParams.ranked === "1";

  const [profile, override, webProfile, seasonStats, seasons, rows, name, passport] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { SteamId: steamId } }),
    prisma.gardenNameOverride.findUnique({ where: { SteamId: steamId } }),
    prisma.gardenWebProfile.findUnique({ where: { SteamId: steamId } }),
    prisma.playerSeasonStats.findFirst({ where: { SeasonId: seasonId, SteamId: steamId } }),
    prisma.season.findMany({ orderBy: { Id: "asc" } }),
    fetchRows(seasonId, steamId, rankedOnly),
    resolveName(steamId),
    prisma.playerPassport.findUnique({ where: { SteamId: steamId } }),
  ]);

  const total = summarize(rows);

  const stats: ProfileHeroStats = {
    elo: seasonStats?.Elo ?? null,
    peakElo: seasonStats?.PeakElo ?? null,
    rating: total.rating,
    kd: total.kd,
    adr: total.adr,
    winPct: total.winPct,
    rounds: total.rounds,
    hs: total.hs,
    kast: total.kast,
    clutches: total.clutches,
    openingKills: total.openingKills,
  };

  const bySide = groupBy(rows, (r) => sideName(r.TeamNum)).map(([side, sideRows]) => ({
    side,
    summary: summarize(sideRows),
  }));
  const byMap = groupBy(rows, (r) => r.Map)
    .map(([map, mapRows]) => ({ map, summary: summarize(mapRows) }))
    .sort((a, b) => b.summary.rounds - a.summary.rounds);

  // Each session carries its own per-map split so opening a day needs no
  // second request — the rows are already in memory here.
  const byDay = groupBy(rows, (r) => dayKey(r.PlayedAtUtc))
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 30)
    .map(([day, dayRows]) => ({
      day,
      summary: summarize(dayRows),
      maps: groupBy(dayRows, (r) => r.Map)
        .map(([map, mapRows]) => ({ map, summary: summarize(mapRows) }))
        .sort((a, b) => b.summary.rounds - a.summary.rounds),
    }));

  const recentRatings = rows.filter((r) => !r.WasAfk).slice(-30).map((r) => r.Rating);

  const displayName = override?.Name ?? profile?.LastKnownName ?? session.steamId;



  return (
    <>
      <ProfileHero
        steamId={session.steamId}
        initialName={name || displayName}
        bio={webProfile?.Bio ?? null}
        country={webProfile?.Country ?? null}
        stats={stats}
      />
      
      {passport && (
        <section className="pro-section">
          <PassportCard 
            passport={passport} 
            avatar={session.avatar ?? ""} 
            stats={{ 
              rating: total.rating, 
              winrate2v2: Math.round(total.winPct), 
              winrate3v3: Math.round(total.winPct), 
              bestTeammate: "Unknown" 
            }} 
          />
        </section>
      )}

      {/* ---------- Season / filter ---------- */}
      <section className="pro-section">
        <div className="pro-section-head">
          <h2>{t("profile.season.title")}</h2>
          <span className="pro-section-note">{rankedOnly ? t("profile.season.rankedOnlyNote") : t("profile.season.allRoundsNote")}</span>
        </div>
        <div className="pro-filters">
          {seasons.map((s) => (
            <Link
              key={s.Id}
              className={`chip ${s.Id === seasonId ? "active" : ""}`}
              href={`?season=${s.Id}${rankedOnly ? "&ranked=1" : ""}`}
            >
              {s.Name}
            </Link>
          ))}
          <Link
            className={`chip ${rankedOnly ? "active" : ""}`}
            href={`?season=${seasonId}${rankedOnly ? "" : "&ranked=1"}`}
          >
            {t("profile.season.rankedOnly")}
          </Link>
        </div>
      </section>

      <ProfileStats
        steamId={session.steamId}
        signedIn
        total={total}
        bySide={bySide}
        byMap={byMap}
        byDay={byDay}
        recentRatings={recentRatings}
      />

      {/* ---------- Connections + settings ---------- */}
      <section className="pro-section">
        <div className="pro-section-head">
          <h2>{t("profile.connections.title")}</h2>
        </div>
      </section>

    </>
  );
}
