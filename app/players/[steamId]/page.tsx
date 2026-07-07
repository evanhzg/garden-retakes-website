import { getActiveSeason, prisma } from "@/lib/db";

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

  const profile = await prisma.playerProfile.findUnique({ where: { SteamId: steamId } });
  const seasonStats = await prisma.playerSeasonStats.findFirst({
    where: { SeasonId: seasonId, SteamId: steamId },
  });
  const seasons = await prisma.season.findMany({ orderBy: { Id: "asc" } });

  const where = {
    SteamId: steamId,
    SeasonId: seasonId,
    ...(rankedOnly ? { IsRanked: true } : {}),
  };

  const [totals, roundCount, wonCount, kastCount, deathCount, clutchWins, entryKills, plants, defuses, avgRating] =
    await Promise.all([
      prisma.playerRoundRecord.aggregate({
        where,
        _sum: { Kills: true, Assists: true, Headshots: true, Damage: true, UtilityDamage: true },
      }),
      prisma.playerRoundRecord.count({ where }),
      prisma.playerRoundRecord.count({ where: { ...where, WonRound: true } }),
      prisma.playerRoundRecord.count({ where: { ...where, Kast: true } }),
      prisma.playerRoundRecord.count({ where: { ...where, Died: true } }),
      prisma.playerRoundRecord.count({ where: { ...where, ClutchWon: true } }),
      prisma.playerRoundRecord.count({ where: { ...where, OpeningKill: true } }),
      prisma.playerRoundRecord.count({ where: { ...where, BombPlanted: true } }),
      prisma.playerRoundRecord.count({ where: { ...where, BombDefused: true } }),
      prisma.playerRoundRecord.aggregate({ where: { ...where, WasAfk: false }, _avg: { Rating: true } }),
    ]);

  const kills = totals._sum.Kills ?? 0;
  const deaths = deathCount;
  const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
  const adr = roundCount > 0 ? Math.round((totals._sum.Damage ?? 0) / roundCount) : 0;
  const kast = roundCount > 0 ? Math.round((100 * kastCount) / roundCount) : 0;
  const hs = kills > 0 ? Math.round((100 * (totals._sum.Headshots ?? 0)) / kills) : 0;

  return (
    <>
      <section className="panel">
        <h2>{profile?.LastKnownName ?? params.steamId}</h2>
        <p className="muted">
          SteamID64: {params.steamId} · Season:{" "}
          {seasons.find((s) => s.Id === seasonId)?.Name ?? seasonId}
          {rankedOnly ? " · ranked only" : ""}
        </p>
        <p>
          {seasons.map((s) => (
            <a key={s.Id} href={`?season=${s.Id}${rankedOnly ? "&ranked=1" : ""}`} style={{ marginRight: 12 }}>
              {s.IsActive ? `▸ ${s.Name}` : s.Name}
            </a>
          ))}
          · <a href={`?season=${seasonId}${rankedOnly ? "" : "&ranked=1"}`}>{rankedOnly ? "show all" : "ranked only"}</a>
        </p>
      </section>

      <section className="panel">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="value">{seasonStats?.Elo ?? "—"}</div>
            <div className="label">CS Rating</div>
          </div>
          <div className="stat-card">
            <div className="value">{seasonStats?.PeakElo ?? "—"}</div>
            <div className="label">Peak</div>
          </div>
          <div className="stat-card">
            <div className="value">{(avgRating._avg.Rating ?? 0).toFixed(2)}</div>
            <div className="label">Rating</div>
          </div>
          <div className="stat-card">
            <div className="value">{roundCount}</div>
            <div className="label">Rounds</div>
          </div>
          <div className="stat-card">
            <div className="value">{roundCount > 0 ? Math.round((100 * wonCount) / roundCount) : 0}%</div>
            <div className="label">Round win %</div>
          </div>
          <div className="stat-card">
            <div className="value">{kd}</div>
            <div className="label">K/D ({kills}/{deaths})</div>
          </div>
          <div className="stat-card">
            <div className="value">{adr}</div>
            <div className="label">ADR</div>
          </div>
          <div className="stat-card">
            <div className="value">{kast}%</div>
            <div className="label">KAST</div>
          </div>
          <div className="stat-card">
            <div className="value">{hs}%</div>
            <div className="label">Headshots</div>
          </div>
          <div className="stat-card">
            <div className="value">{clutchWins}</div>
            <div className="label">Clutches won</div>
          </div>
          <div className="stat-card">
            <div className="value">{entryKills}</div>
            <div className="label">Opening kills</div>
          </div>
          <div className="stat-card">
            <div className="value">{defuses}</div>
            <div className="label">Defuses ({plants} plants)</div>
          </div>
        </div>
      </section>
    </>
  );
}
