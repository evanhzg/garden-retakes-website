import Link from "next/link";
import { getActiveSeason, prisma } from "@/lib/db";
import { summarize, ratingClass } from "@/lib/stats";
import { resolveNames, nameFrom } from "@/lib/names";
import AvatarImage from "@/components/AvatarImage";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function MapHeatmapsPage() {
  const season = await getActiveSeason();
  if (!season) {
    return (
      <section className="panel">
        <h2>Global Stats</h2>
        <p className="muted">No active season found.</p>
      </section>
    );
  }

  const allRows = await prisma.playerRoundRecord.findMany({
    where: { SeasonId: season.Id, IsRanked: true },
    select: {
      SteamId: true, Map: true, PlayedAtUtc: true, TeamNum: true, IsRanked: true, WonRound: true,
      Kills: true, Headshots: true, Assists: true, Damage: true, UtilityDamage: true,
      EnemiesFlashed: true, TradeKills: true, MultiKillCount: true, Died: true,
      Kast: true, OpeningKill: true, OpeningDeath: true, ClutchWon: true,
      BombPlanted: true, BombDefused: true, WasAfk: true, Rating: true
    }
  });

  const byPlayer = new Map<bigint, typeof allRows>();
  for (const r of allRows) {
    if (!byPlayer.has(r.SteamId as any)) byPlayer.set(r.SteamId as any, []);
    byPlayer.get(r.SteamId as any)!.push(r);
  }

  const topPlayers = Array.from(byPlayer.entries())
    .map(([steamId, rows]) => ({ steamId, rounds: rows.length, rows }))
    .filter(p => p.rounds >= 10)
    .sort((a, b) => b.rounds - a.rounds)
    .slice(0, 10);

  const steamIds = topPlayers.map(p => p.steamId);
  const names = await resolveNames(steamIds);

  const byMap = new Map<string, typeof allRows>();
  for (const r of allRows) {
    if (!byMap.has(r.Map)) byMap.set(r.Map, []);
    byMap.get(r.Map)!.push(r);
  }

  const maps = Array.from(byMap.entries())
    .sort((a, b) => b[1].length - a[1].length);

  return (
    <>
      <section className="panel">
        <h2>Global Stats — {season.Name}</h2>
        <div className="chip-row">
          <Link href="/stats" className="chip">Overview</Link>
          <Link href="/stats/maps" className="chip active">Map Heatmaps</Link>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Map Rating Heatmap</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          Shows the average rating per map for the top {topPlayers.length} most active players this season.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table className="ladder-table" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ width: 150 }}>Map</th>
                <th>Server Avg</th>
                {topPlayers.map(p => (
                  <th key={p.steamId.toString()} style={{ textAlign: "center", padding: "8px 4px" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden" }}>
                        <AvatarImage steamId={p.steamId.toString()} />
                      </div>
                      <span style={{ fontSize: "0.75rem", fontWeight: "normal", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 65 }} title={nameFrom(names, p.steamId.toString())}>
                        {nameFrom(names, p.steamId.toString())}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {maps.map(([map, mapRows]) => {
                const globalSummary = summarize(mapRows);
                return (
                  <tr key={map}>
                    <td style={{ fontWeight: 700 }}>{map}</td>
                    <td className={ratingClass(globalSummary.rating)} style={{ fontWeight: 800, textAlign: "center" }}>
                      {globalSummary.rating.toFixed(2)}
                    </td>
                    {topPlayers.map(p => {
                      const playerMapRows = p.rows.filter(r => r.Map === map);
                      if (playerMapRows.length === 0) {
                        return <td key={p.steamId.toString()} style={{ textAlign: "center", opacity: 0.3 }}>-</td>;
                      }
                      const playerSummary = summarize(playerMapRows);
                      return (
                        <td 
                          key={p.steamId.toString()} 
                          className={ratingClass(playerSummary.rating)} 
                          style={{ fontWeight: 800, textAlign: "center" }}
                          title={`${playerSummary.rounds} rounds on ${map}`}
                        >
                          {playerSummary.rating.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
