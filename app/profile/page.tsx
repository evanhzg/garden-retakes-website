import { getSession } from "@/lib/auth";
import { getActiveSeason, prisma } from "@/lib/db";
import { fetchRows, summarize } from "@/lib/stats";
import { resolveName } from "@/lib/names";
import ProfileShowcase from "@/components/ProfileShowcase";
import ProfileEditor from "@/components/ProfileEditor";

export const dynamic = "force-dynamic";

export type ProfileStats = {
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

export default async function ProfilePage() {
  const session = getSession();

  if (!session) {
    return (
      <section className="panel">
        <h2>Your profile</h2>
        <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "start" }}>
          <p style={{ margin: 0 }}>Sign in with Steam to see your profile, stats and loadouts.</p>
          <a className="btn" href="/api/auth/steam/login">
            Sign in with Steam
          </a>
        </div>
      </section>
    );
  }

  const steamId = BigInt(session.steamId);
  const season = await getActiveSeason();

  const [seasonStats, rows, name] = await Promise.all([
    season
      ? prisma.playerSeasonStats.findFirst({ where: { SeasonId: season.Id, SteamId: steamId } })
      : Promise.resolve(null),
    season ? fetchRows(season.Id, steamId, false) : Promise.resolve([]),
    resolveName(steamId),
  ]);

  const total = summarize(rows);
  const stats: ProfileStats = {
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

  return (
    <>
      <ProfileShowcase
        steamId={session.steamId}
        initialName={name}
        steamName={session.name ?? null}
        stats={stats}
      />

      <section className="panel">
        <h2>Profile settings</h2>
        <ProfileEditor />
      </section>
    </>
  );
}
