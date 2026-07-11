import Link from "next/link";
import ConnectButton from "@/components/ConnectButton";
import { getActiveSeason, prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveNames, nameFrom } from "@/lib/names";
import { getLastSessionStandout } from "@/lib/hero";

export const dynamic = "force-dynamic";
export const revalidate = 30;

const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

export default async function HomePage() {
  const serverAddress = process.env.NEXT_PUBLIC_SERVER_ADDRESS ?? "127.0.0.1:27015";
  const season = await getActiveSeason();
  const session = getSession();

  if (!season) {
    return (
      <>
        <Hero serverAddress={serverAddress} standout={null} />
        <section className="panel">
          <h2>Ladder</h2>
          <p className="muted">No season yet. Start one in-game to open the ladder.</p>
        </section>
      </>
    );
  }

  const [ladder, standout] = await Promise.all([
    prisma.playerSeasonStats.findMany({
      where: { SeasonId: season.Id, RankedRoundsPlayed: { gt: 0 } },
      orderBy: { Elo: "desc" },
      take: 20,
    }),
    getLastSessionStandout(season.Id),
  ]);

  const names = await resolveNames([
    ...ladder.map((e) => e.SteamId),
    ...(standout ? [standout.steamId] : []),
  ]);

  const webProfiles = await prisma.gardenWebProfile.findMany({
    where: { SteamId: { in: ladder.map((e) => e.SteamId) } },
    select: { SteamId: true, AvatarUrl: true },
  });
  const avatarOf = new Map(webProfiles.map((p) => [p.SteamId.toString(), p.AvatarUrl]));

  // Session link: where does the logged-in player sit, and are they in the top 20?
  const mySteamId = session?.steamId ?? null;
  const inTop = mySteamId ? ladder.some((e) => e.SteamId.toString() === mySteamId) : false;
  let myPlacement: { rank: number; elo: number; peak: number } | null = null;
  if (mySteamId && !inTop) {
    const mine = await prisma.playerSeasonStats.findFirst({
      where: { SeasonId: season.Id, SteamId: BigInt(mySteamId), RankedRoundsPlayed: { gt: 0 } },
    });
    if (mine) {
      const ahead = await prisma.playerSeasonStats.count({
        where: { SeasonId: season.Id, RankedRoundsPlayed: { gt: 0 }, Elo: { gt: mine.Elo } },
      });
      myPlacement = { rank: ahead + 1, elo: mine.Elo, peak: mine.PeakElo };
    }
  }

  return (
    <>
      <Hero serverAddress={serverAddress} standout={standout} standoutName={standout ? nameFrom(names, standout.steamId) : ""} />

      <section className="panel">
        <div className="admin-head">
          <h2>Ladder — {season.Name}</h2>
          {session && (
            <Link className="chip" href={`/players/${session.steamId}`}>
              Your profile →
            </Link>
          )}
        </div>

        {ladder.length === 0 ? (
          <p className="muted">Nobody is ranked yet. Join the server and type /rr!</p>
        ) : (
          <table className="ladder-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>CS Rating</th>
                <th>Peak</th>
                <th>Rounds</th>
                <th>Win %</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((entry, index) => {
                const key = entry.SteamId.toString();
                const rank = index + 1;
                const isYou = key === mySteamId;
                return (
                  <tr key={entry.Id} className={isYou ? "you" : ""}>
                    <td className="rank-cell">{medal(rank) ?? rank}</td>
                    <td>
                      <Link href={`/players/${key}`} className="ladder-player">
                        <span className="ladder-avatar">
                          <img
                            src={`/${key}_pp.png`}
                            alt="Avatar"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/default_pp.png"; }}
                          />
                        </span>
                        <span>{nameFrom(names, key)}</span>
                        {isYou && <span className="mini-badge">you</span>}
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
                );
              })}
            </tbody>
          </table>
        )}

        {myPlacement && (
          <div className="your-placement">
            <span className="mini-badge">you</span>
            <span>
              You’re <strong>#{myPlacement.rank}</strong> with {myPlacement.elo} CS Rating (peak{" "}
              {myPlacement.peak}).
            </span>
            <Link className="btn small secondary" href={`/players/${mySteamId}`}>
              View your page
            </Link>
          </div>
        )}
      </section>
    </>
  );
}

function Hero({
  serverAddress,
  standout,
  standoutName,
}: {
  serverAddress: string;
  standout: Awaited<ReturnType<typeof getLastSessionStandout>>;
  standoutName?: string;
}) {
  return (
    <section className="hero">
      <div className="hero-inner">
        <span className="eyebrow">Garden Retakes · CS2</span>
        <h1>
          Retakes with a <span className="grad">real economy</span>.
        </h1>
        <p className="muted">
          Ranked sessions, Competitive 2v2/3v3, clutch rounds — and a skin loadout that follows you
          in-game. Jump on the server and climb the ladder.
        </p>
        <ConnectButton serverAddress={serverAddress} />
      </div>

      {standout && (
        <Link href={`/players/${standout.steamId}`} className="standout-card">
          <div className="standout-eyebrow">★ Standout — {standout.day}</div>
          <div className="standout-top">
            <span className="standout-avatar">
              <img
                src={`/${standout.steamId}_pp.png`}
                alt="Avatar"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/default_pp.png"; }}
              />
            </span>
            <div>
              <div className="standout-name">{standoutName || standout.name}</div>
              <div className="standout-elo">{standout.elo ?? "—"} CS Rating</div>
            </div>
            <div className="standout-rating">{standout.rating.toFixed(2)}</div>
          </div>
          <div className="standout-stats">
            <span>
              <strong>{standout.kd.toFixed(2)}</strong> K/D
            </span>
            <span>
              <strong>{standout.adr.toFixed(0)}</strong> ADR
            </span>
            <span>
              <strong>{standout.winPct.toFixed(0)}%</strong> wins
            </span>
            <span>
              <strong>{standout.clutches}</strong> clutches
            </span>
            <span>
              <strong>{standout.rounds}</strong> rounds
            </span>
          </div>
        </Link>
      )}
      <div className="hero-glow" aria-hidden="true" />
    </section>
  );
}
