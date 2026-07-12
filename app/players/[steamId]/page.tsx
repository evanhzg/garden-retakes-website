import Link from "next/link";
import { getActiveSeason, prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { dayKey, fetchRows, groupBy, ratingClass, sideName, summarize, formatDate, formatPlaytime } from "@/lib/stats";
import CharacterHero from "@/components/CharacterHero";
import AvatarImage from "@/components/AvatarImage";
import ProfileActivity from "@/components/ProfileActivity";

export const dynamic = "force-dynamic";
export const revalidate = 30;

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

  const [profile, override, webProfile, seasonStats, seasons, rows] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { SteamId: steamId } }),
    prisma.gardenNameOverride.findUnique({ where: { SteamId: steamId } }),
    prisma.gardenWebProfile.findUnique({ where: { SteamId: steamId } }),
    prisma.playerSeasonStats.findFirst({ where: { SeasonId: seasonId, SteamId: steamId } }),
    prisma.season.findMany({ orderBy: { Id: "asc" } }),
    fetchRows(seasonId, steamId, rankedOnly),
  ]);

  const name = override?.Name ?? profile?.LastKnownName ?? params.steamId;
  const isOwnPage = getSession()?.steamId === params.steamId;
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

      {/* ---------- Per side ---------- */}
      <section className="panel">
        <h2>Per side</h2>
        {bySide.length === 0 ? (
          <p className="empty-hint">No rounds recorded with these filters yet.</p>
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
                    <div className="label">Rating</div>
                  </div>
                  <div className="stat-card">
                    <div className="value">{s.kd.toFixed(2)}</div>
                    <div className="label">K/D</div>
                  </div>
                  <div className="stat-card">
                    <div className="value">{s.adr.toFixed(0)}</div>
                    <div className="label">ADR</div>
                  </div>
                  <div className="stat-card">
                    <div className="value">{s.winPct.toFixed(0)}%</div>
                    <div className="label">Win % · {s.rounds} rounds</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Per map ---------- */}
      <section className="panel">
        <h2>Per map</h2>
        {byMap.length === 0 ? (
          <p className="empty-hint">Nothing yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Map</th>
                <th>Rounds</th>
                <th>Win %</th>
                <th>K — D</th>
                <th>ADR</th>
                <th>KAST</th>
                <th>Rating</th>
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
        <h2>Per day (last {byDay.length})</h2>
        {byDay.length === 0 ? (
          <p className="empty-hint">Nothing yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Rounds</th>
                <th>Win %</th>
                <th>K — D</th>
                <th>ADR</th>
                <th>Clutches</th>
                <th>Rating</th>
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
        <h2>Details</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="value">{total.openingKills}</div>
            <div className="label">Opening kills ({total.openingDeaths} deaths)</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.clutches}</div>
            <div className="label">Clutches won</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.multiKills}</div>
            <div className="label">Multi-kill rounds</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.tradeKills}</div>
            <div className="label">Trade kills</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.utilPerRound.toFixed(1)}</div>
            <div className="label">Util dmg / round</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.enemiesFlashed}</div>
            <div className="label">Enemies flashed</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.defuses}</div>
            <div className="label">Defuses ({total.plants} plants)</div>
          </div>
          <div className="stat-card">
            <div className="value">{total.kpr.toFixed(2)}</div>
            <div className="label">Kills / round</div>
          </div>
        </div>
      </section>
    </>
  );
}
