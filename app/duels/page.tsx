import { prisma } from "@/lib/db";

export const metadata = {
  title: "Duels — Garden Retakes",
  description: "The 1v1 duel ladder of the Garden Retakes server.",
};

export const dynamic = "force-dynamic";

type LadderRow = {
  steamId: bigint;
  name: string;
  wins: number;
  losses: number;
  winrate: number;
  challengeWins: number;
};

async function buildLadder(seasonId: number): Promise<LadderRow[]> {
  const duels = await prisma.duelRecord.findMany({
    where: { SeasonId: seasonId },
    select: {
      WinnerSteamId: true,
      WinnerName: true,
      LoserSteamId: true,
      LoserName: true,
      IsChallenge: true,
      ChallengeScore: true,
    },
  });

  const players = new Map<bigint, LadderRow>();
  const get = (steamId: bigint, name: string) => {
    let row = players.get(steamId);
    if (!row) {
      row = { steamId, name, wins: 0, losses: 0, winrate: 0, challengeWins: 0 };
      players.set(steamId, row);
    }
    row.name = name || row.name;
    return row;
  };

  for (const duel of duels) {
    const winner = get(duel.WinnerSteamId, duel.WinnerName);
    winner.wins += 1;
    if (duel.IsChallenge && duel.ChallengeScore) winner.challengeWins += 1;
    get(duel.LoserSteamId, duel.LoserName).losses += 1;
  }

  return Array.from(players.values())
    .map((row) => ({
      ...row,
      winrate: row.wins + row.losses > 0 ? (100 * row.wins) / (row.wins + row.losses) : 0,
    }))
    .sort((a, b) => b.wins - a.wins || b.winrate - a.winrate);
}

export default async function DuelsPage() {
  const season = await prisma.season.findFirst({ where: { IsActive: true } });
  const ladder = season ? await buildLadder(season.Id) : [];
  const recent = season
    ? await prisma.duelRecord.findMany({
        where: { SeasonId: season.Id },
        orderBy: { Id: "desc" },
        take: 20,
      })
    : [];

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <span className="eyebrow">Duels</span>
          <h1>
            The <span className="grad">1v1</span> ladder.
          </h1>
          <p className="muted">
            Every duel played in Duels mode{season ? ` during ${season.Name}` : ""} — rotation
            wins and private challenges alike.
          </p>
        </div>
      </section>

      <div className="panel">
        <h2>Ladder</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Winrate</th>
              <th>Challenges won</th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((row, i) => (
              <tr key={row.steamId.toString()}>
                <td className="muted">{i + 1}</td>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td className="positive">{row.wins}</td>
                <td className="negative">{row.losses}</td>
                <td>{row.winrate.toFixed(0)}%</td>
                <td>{row.challengeWins || "—"}</td>
              </tr>
            ))}
            {ladder.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No duels played yet — switch the server to Duels mode with !gamemode duels.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Recent duels</h2>
        <table>
          <thead>
            <tr>
              <th>When (UTC)</th>
              <th>Winner</th>
              <th>Loser</th>
              <th>Arena</th>
              <th>Map</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((duel) => (
              <tr key={duel.Id.toString()}>
                <td className="muted">
                  {duel.PlayedAtUtc.toISOString().replace("T", " ").slice(0, 16)}
                </td>
                <td className="positive">{duel.WinnerName}</td>
                <td className="negative">{duel.LoserName}</td>
                <td>{duel.ArenaName || "—"}</td>
                <td className="muted">{duel.Map}</td>
                <td>
                  {duel.IsChallenge
                    ? `Challenge${duel.ChallengeScore ? ` (${duel.ChallengeScore})` : ""}`
                    : "Rotation"}
                </td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
