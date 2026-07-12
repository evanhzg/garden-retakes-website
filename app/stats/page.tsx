import Link from "next/link";
import { getActiveSeason, prisma } from "@/lib/db";
import { summarize } from "@/lib/stats";
import { resolveNames, nameFrom } from "@/lib/names";
import AvatarImage from "@/components/AvatarImage";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function StatsPage() {
  const season = await getActiveSeason();
  if (!season) {
    return (
      <section className="panel">
        <h2>Global Stats</h2>
        <p className="muted">No active season found.</p>
      </section>
    );
  }

  // Fetch all ranked rounds for the season to build leaderboards
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

  const playerStats = Array.from(byPlayer.entries()).map(([steamId, rows]) => {
    return { steamId: steamId.toString(), summary: summarize(rows) };
  }).filter(p => p.summary.rounds >= 10); // Minimum 10 rounds to qualify

  // Sortings
  const topAdr = [...playerStats].sort((a, b) => b.summary.adr - a.summary.adr).slice(0, 5);
  const topClutchers = [...playerStats].sort((a, b) => b.summary.clutches - a.summary.clutches).slice(0, 5);
  const topEntries = [...playerStats]
    .filter(p => (p.summary.openingKills + p.summary.openingDeaths) >= 5)
    .sort((a, b) => {
      const aPct = a.summary.openingKills / (a.summary.openingKills + a.summary.openingDeaths);
      const bPct = b.summary.openingKills / (b.summary.openingKills + b.summary.openingDeaths);
      return bPct - aPct;
    })
    .slice(0, 5);
  const topKast = [...playerStats].sort((a, b) => b.summary.kast - a.summary.kast).slice(0, 5);

  const steamIdsToResolve = [...topAdr, ...topClutchers, ...topEntries, ...topKast].map(p => BigInt(p.steamId));
  const names = await resolveNames(steamIdsToResolve);

  return (
    <>
      <section className="panel">
        <h2>Global Stats — {season.Name}</h2>
        <div className="chip-row">
          <Link href="/stats" className="chip active">Overview</Link>
          <Link href="/stats/heatmaps" className="chip">Map Heatmaps</Link>
        </div>
      </section>

      <div className="split-cards" style={{ marginTop: 16 }}>
        <div className="side-card">
          <h3>Highest ADR</h3>
          <table className="ladder-table">
            <tbody>
              {topAdr.map((p, i) => (
                <tr key={p.steamId}>
                  <td className="rank-cell">{i + 1}</td>
                  <td>
                    <Link href={`/players/${p.steamId}`} className="ladder-player">
                      <span className="ladder-avatar"><AvatarImage steamId={p.steamId} /></span>
                      <span>{nameFrom(names, p.steamId)}</span>
                    </Link>
                  </td>
                  <td style={{ fontWeight: 800 }}>{p.summary.adr.toFixed(0)}</td>
                </tr>
              ))}
              {topAdr.length === 0 && <tr><td className="muted" colSpan={3}>Not enough data yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="side-card">
          <h3>Most Clutches</h3>
          <table className="ladder-table">
            <tbody>
              {topClutchers.map((p, i) => (
                <tr key={p.steamId}>
                  <td className="rank-cell">{i + 1}</td>
                  <td>
                    <Link href={`/players/${p.steamId}`} className="ladder-player">
                      <span className="ladder-avatar"><AvatarImage steamId={p.steamId} /></span>
                      <span>{nameFrom(names, p.steamId)}</span>
                    </Link>
                  </td>
                  <td style={{ fontWeight: 800 }}>{p.summary.clutches}</td>
                </tr>
              ))}
              {topClutchers.length === 0 && <tr><td className="muted" colSpan={3}>Not enough data yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="side-card">
          <h3>Best Entry (OK %)</h3>
          <table className="ladder-table">
            <tbody>
              {topEntries.map((p, i) => {
                const pct = (p.summary.openingKills / (p.summary.openingKills + p.summary.openingDeaths)) * 100;
                return (
                  <tr key={p.steamId}>
                    <td className="rank-cell">{i + 1}</td>
                    <td>
                      <Link href={`/players/${p.steamId}`} className="ladder-player">
                        <span className="ladder-avatar"><AvatarImage steamId={p.steamId} /></span>
                        <span>{nameFrom(names, p.steamId)}</span>
                      </Link>
                    </td>
                    <td style={{ fontWeight: 800 }}>{pct.toFixed(1)}%</td>
                  </tr>
                )
              })}
              {topEntries.length === 0 && <tr><td className="muted" colSpan={3}>Not enough data yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="side-card">
          <h3>Highest KAST</h3>
          <table className="ladder-table">
            <tbody>
              {topKast.map((p, i) => (
                <tr key={p.steamId}>
                  <td className="rank-cell">{i + 1}</td>
                  <td>
                    <Link href={`/players/${p.steamId}`} className="ladder-player">
                      <span className="ladder-avatar"><AvatarImage steamId={p.steamId} /></span>
                      <span>{nameFrom(names, p.steamId)}</span>
                    </Link>
                  </td>
                  <td style={{ fontWeight: 800 }}>{p.summary.kast.toFixed(1)}%</td>
                </tr>
              ))}
              {topKast.length === 0 && <tr><td className="muted" colSpan={3}>Not enough data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
