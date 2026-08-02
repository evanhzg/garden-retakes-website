import Link from "next/link";
import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { getActiveSeason, prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { dayKey, fetchRows, groupBy, ratingClass, sideName, summarize, formatDate, formatPlaytime } from "@/lib/stats";
import CharacterHero from "@/components/CharacterHero";
import AvatarImage from "@/components/AvatarImage";
import ProfileActivity from "@/components/ProfileActivity";
import ProfileStats from "@/components/profile/ProfileStats";

export const dynamic = "force-dynamic";
export const revalidate = 30;

// Rich link previews (Discord embeds etc.): player card with ELO + key stats,
// rendered by /api/og?type=player. Uses cheap aggregates, not the full row fetch.
export async function generateMetadata({ params }: { params: { steamId: string } }): Promise<Metadata> {
  try {
    const steamId = BigInt(params.steamId);
    const activeSeason = await getActiveSeason();
    const seasonId = activeSeason?.Id ?? 0;
    const roundWhere = { SeasonId: seasonId, SteamId: steamId, WasAfk: false };

    const [profile, override, webProfile, seasonStats, agg, deaths, wins] = await Promise.all([
      prisma.playerProfile.findUnique({ where: { SteamId: steamId } }),
      prisma.gardenNameOverride.findUnique({ where: { SteamId: steamId } }),
      prisma.gardenWebProfile.findUnique({ where: { SteamId: steamId } }),
      prisma.playerSeasonStats.findFirst({ where: { SeasonId: seasonId, SteamId: steamId } }),
      prisma.playerRoundRecord.aggregate({
        where: roundWhere,
        _count: { _all: true },
        _avg: { Rating: true, Damage: true },
        _sum: { Kills: true },
      }),
      prisma.playerRoundRecord.count({ where: { ...roundWhere, Died: true } }),
      prisma.playerRoundRecord.count({ where: { ...roundWhere, WonRound: true } }),
    ]);

    const name = override?.Name ?? profile?.LastKnownName ?? params.steamId;
    const rounds = agg._count._all;

    const og = new URLSearchParams({ type: "player", name });
    if (activeSeason?.Name) og.set("season", activeSeason.Name);
    if (seasonStats?.Elo) og.set("elo", String(seasonStats.Elo));
    if (rounds > 0) {
      og.set("rating", (agg._avg.Rating ?? 0).toFixed(2));
      og.set("kd", ((agg._sum.Kills ?? 0) / Math.max(1, deaths)).toFixed(2));
      og.set("adr", (agg._avg.Damage ?? 0).toFixed(0));
      og.set("wr", `${((wins / rounds) * 100).toFixed(0)}%`);
    }

    // Avatar: web-profile URL first, else the custom _pp.png if it exists on disk
    if (webProfile?.AvatarUrl?.startsWith("https://")) {
      og.set("avatar", webProfile.AvatarUrl);
    } else if (fs.existsSync(path.join(process.cwd(), "public", `${params.steamId}_pp.png`))) {
      const base = process.env.NEXT_PUBLIC_SITE_URL || "https://retakes.fr";
      og.set("avatar", `${base}/${params.steamId}_pp.png`);
    }

    const description = rounds > 0
      ? `ELO ${seasonStats?.Elo ?? "—"} · Rating ${(agg._avg.Rating ?? 0).toFixed(2)} · ${rounds} rounds${activeSeason?.Name ? ` · ${activeSeason.Name}` : ""}`
      : "Player profile on Garden Retakes";
    const image = `/api/og?${og.toString()}`;

    return {
      title: name,
      description,
      openGraph: { title: `${name} — Garden Retakes`, description, images: [{ url: image, width: 1200, height: 630 }] },
      twitter: { card: "summary_large_image", title: `${name} — Garden Retakes`, description, images: [image] },
    };
  } catch {
    return { title: "Player profile" };
  }
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { steamId: string };
  searchParams: { season?: string; ranked?: string };
}) {
  const steamId = BigInt(params.steamId);
  const activeSeason = await getActiveSeason();
  const seasonId = searchParams.season ? Number(searchParams.season) : activeSeason?.Id ?? 0;
  const rankedOnly = searchParams.ranked === "1";
  const query = (extra: string) =>
    `?season=${seasonId}${rankedOnly ? "&ranked=1" : ""}${extra}`;

  const [profile, override, webProfile, seasonStats, seasons, rows, gameStats] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { SteamId: steamId } }),
    prisma.gardenNameOverride.findUnique({ where: { SteamId: steamId } }),
    prisma.gardenWebProfile.findUnique({ where: { SteamId: steamId } }),
    prisma.playerSeasonStats.findFirst({ where: { SeasonId: seasonId, SteamId: steamId } }),
    prisma.season.findMany({ orderBy: { Id: "asc" } }),
    fetchRows(seasonId, steamId, rankedOnly),
    prisma.webGameStats.findMany({ where: { SteamId: steamId } })
  ]);

  const name = override?.Name ?? profile?.LastKnownName ?? params.steamId;
  const isOwnPage = getSession()?.steamId === params.steamId;
  const total = summarize(rows);

  // Same shape the signed-in profile builds, so both pages render through the
  // one ProfileStats component instead of keeping two copies of these tables.
  const bySide = groupBy(rows, (r) => sideName(r.TeamNum)).map(([side, sideRows]) => ({
    side,
    summary: summarize(sideRows),
  }));
  const byMap = groupBy(rows, (r) => r.Map)
    .map(([map, mapRows]) => ({ map, summary: summarize(mapRows) }))
    .sort((a, b) => b.summary.rounds - a.summary.rounds);
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

  const recentRatings = rows
    .filter((r) => !r.WasAfk)
    .slice(-30)
    .map((r) => r.Rating);
  const maxRecent = Math.max(1.5, ...recentRatings);

  return (
    <>
      {/* ---------- Character image hero ---------- */}
      <CharacterHero
        steamId={params.steamId}
        playerName={name}
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
            <AvatarImage steamId={params.steamId} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 className="hero-name">
              {name}
              {override && <span className="mini-badge">custom name</span>}
            </h1>
            <div className="hero-sub">
              SteamID64 {params.steamId}
              {webProfile?.Country ? ` · ${webProfile.Country}` : ""}
              {rankedOnly ? " · ranked rounds only" : " · all rounds"}
            </div>
            <ProfileActivity steamId={params.steamId} lastConnectedUtc={profile?.LastSeenAtUtc} />
            {webProfile?.Bio && <p className="player-bio">{webProfile.Bio}</p>}
          </div>
          <div className="player-hero-actions">
            {isOwnPage && (
              <Link className="btn small secondary" href="/profile">
                ✎ Edit profile
              </Link>
            )}
            <Link className="btn secondary" href={`/compare?a=${params.steamId}`}>
              ⚔ Compare
            </Link>
          </div>
        </div>

        <div className="chip-row" style={{ marginTop: 16, marginBottom: 0 }}>
          {seasons.map((s) => (
            <a
              key={s.Id}
              className={`chip ${s.Id === seasonId ? "active" : ""}`}
              href={`?season=${s.Id}${rankedOnly ? "&ranked=1" : ""}`}
            >
              {s.Name}
            </a>
          ))}
          <a
            className={`chip ${rankedOnly ? "active" : ""}`}
            href={`?season=${seasonId}${rankedOnly ? "" : "&ranked=1"}`}
          >
            Ranked only
          </a>
        </div>
      </section>

      {/* ---------- Headline numbers ---------- */}
      <section className="panel">
        <div className="bigstat-row">
          <div className="bigstat">
            <div className={`num ${ratingClass(total.rating)}`}>{total.rating.toFixed(2)}</div>
            <div className="cap">Rating</div>
          </div>
          <div className="bigstat">
            <div className="num rating-neutral">{seasonStats?.Elo ?? "—"}</div>
            <div className="cap">CS Rating (peak {seasonStats?.PeakElo ?? "—"})</div>
          </div>
          <div className="bigstat">
            <div className="num rating-neutral">{total.kd.toFixed(2)}</div>
            <div className="cap">
              K/D ({total.kills}/{total.deaths})
            </div>
          </div>
          <div className="bigstat">
            <div className="num rating-neutral">{total.rounds}</div>
            <div className="cap">Rounds · {byMap.length} maps</div>
          </div>
          <div className="bigstat">
            <div className="num rating-neutral">{formatPlaytime(profile?.TimeSpentSeconds ?? 0)}</div>
            <div className="cap">Playtime</div>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="meter">
            <span className="cap">Round win %</span>
            <div className="track">
              <div className="fill" style={{ width: `${Math.min(100, total.winPct)}%` }} />
            </div>
            <span className="val">{total.winPct.toFixed(0)}%</span>
          </div>
          <div className="meter">
            <span className="cap">KAST</span>
            <div className="track">
              <div className="fill" style={{ width: `${Math.min(100, total.kast)}%` }} />
            </div>
            <span className="val">{total.kast.toFixed(0)}%</span>
          </div>
          <div className="meter">
            <span className="cap">Headshots</span>
            <div className="track">
              <div className="fill" style={{ width: `${Math.min(100, total.hs)}%` }} />
            </div>
            <span className="val">{total.hs.toFixed(0)}%</span>
          </div>
          <div className="meter">
            <span className="cap">ADR</span>
            <div className="track">
              <div className="fill" style={{ width: `${Math.min(100, (total.adr / 150) * 100)}%` }} />
            </div>
            <span className="val">{total.adr.toFixed(0)}</span>
          </div>
        </div>

        {recentRatings.length > 1 && (
          <div style={{ marginTop: 16 }}>
            <div className="cap muted" style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: 6 }}>
              LAST {recentRatings.length} ROUNDS — RATING
            </div>
            <div className="sparkline">
              {recentRatings.map((r, i) => (
                <span
                  key={i}
                  title={r.toFixed(2)}
                  style={{
                    height: `${Math.max(6, (r / maxRecent) * 100)}%`,
                    animationDelay: `${i * 0.015}s`,
                    opacity: r >= 1 ? 1 : 0.45,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---------- Web Game Stats ---------- */}
      {gameStats && gameStats.length > 0 && (
        <section className="panel">
          <h2>Minigames & Dailies</h2>
          <div className="split-cards">
            {gameStats.map((gs) => (
              <div key={gs.GameId} className="side-card">
                <h3 style={{ textTransform: "capitalize" }}>{gs.GameId}</h3>
                <div className="stat-grid">
                  <div className="stat-card">
                    <div className="value">{gs.Elo}</div>
                    <div className="label">ELO</div>
                  </div>
                  <div className="stat-card">
                    <div className="value">{gs.MatchesWon} <span style={{fontSize: 12, color: 'rgba(255,255,255,0.4)'}}>/ {gs.MatchesPlayed}</span></div>
                    <div className="label">Wins</div>
                  </div>
                  <div className="stat-card">
                    <div className="value">{gs.TotalScore}</div>
                    <div className="label">Total Score</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Per side ---------- */}
      <ProfileStats
        steamId={params.steamId}
        signedIn={Boolean(getSession())}
        total={total}
        bySide={bySide}
        byMap={byMap}
        byDay={byDay}
        recentRatings={recentRatings}
      />

    </>
  );
}
