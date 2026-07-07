import Link from "next/link";
import ConnectButton from "@/components/ConnectButton";
import { getActiveSeason, prisma } from "@/lib/db";

export const revalidate = 30;

export default async function HomePage() {
  const serverAddress = process.env.NEXT_PUBLIC_SERVER_ADDRESS ?? "127.0.0.1:27015";
  const season = await getActiveSeason();

  const ladder = season
    ? await prisma.playerSeasonStats.findMany({
        where: { SeasonId: season.Id, RankedRoundsPlayed: { gt: 0 } },
        orderBy: { Elo: "desc" },
        take: 20,
      })
    : [];

  const steamIds = ladder.map((entry) => entry.SteamId);
  const profiles = await prisma.playerProfile.findMany({
    where: { SteamId: { in: steamIds } },
  });
  const nameOf = new Map(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName]));

  return (
    <>
      <section className="panel">
        <h2>Play Garden Retakes</h2>
        <p className="muted">
          Retakes with a real economy, Ranked sessions, Competitive 2v2/3v3 and clutch rounds.
        </p>
        <ConnectButton serverAddress={serverAddress} />
      </section>

      <section className="panel">
        <h2>Ladder — {season?.Name ?? "no season yet"}</h2>
        {ladder.length === 0 ? (
          <p className="muted">Nobody is ranked yet. Join the server and type /rr!</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>CS Rating</th>
                <th>Peak</th>
                <th>Ranked rounds</th>
                <th>Win %</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((entry, index) => (
                <tr key={entry.Id}>
                  <td>{index + 1}</td>
                  <td>
                    <Link href={`/players/${entry.SteamId.toString()}`}>
                      {nameOf.get(entry.SteamId.toString()) ?? entry.SteamId.toString()}
                    </Link>
                  </td>
                  <td className="elo">{entry.Elo}</td>
                  <td>{entry.PeakElo}</td>
                  <td>{entry.RankedRoundsPlayed}</td>
                  <td>
                    {entry.RankedRoundsPlayed > 0
                      ? `${Math.round((100 * entry.RankedRoundsWon) / entry.RankedRoundsPlayed)}%`
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
