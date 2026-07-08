import Link from "next/link";
import { prisma } from "@/lib/db";

export const revalidate = 60;

export default async function SeasonsPage() {
  const seasons = await prisma.season.findMany({ orderBy: { Id: "desc" } });

  const champions = await Promise.all(
    seasons.map(async (season) => {
      const best = await prisma.playerSeasonStats.findFirst({
        where: { SeasonId: season.Id, RankedRoundsPlayed: { gt: 0 } },
        orderBy: { Elo: "desc" },
      });
      const name = best
        ? (
            await prisma.playerProfile.findUnique({ where: { SteamId: best.SteamId } })
          )?.LastKnownName ?? best.SteamId.toString()
        : null;
      return { season, best, name };
    })
  );

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <span className="eyebrow">History</span>
          <h1>
            Every <span className="grad">season</span>.
          </h1>
          <p className="muted">Champions and record ratings across the lifetime of the server.</p>
        </div>
      </section>

      <section className="panel">
        <h2>Seasons</h2>
        <table>
        <thead>
          <tr>
            <th>Season</th>
            <th>Period</th>
            <th>Champion</th>
            <th>Best ELO</th>
          </tr>
        </thead>
        <tbody>
          {champions.map(({ season, best, name }) => (
            <tr key={season.Id}>
              <td>
                {season.IsActive ? "▸ " : ""}
                {season.Name}
              </td>
              <td className="muted">
                {season.StartedAtUtc.toISOString().slice(0, 10)} →{" "}
                {season.EndedAtUtc ? season.EndedAtUtc.toISOString().slice(0, 10) : "ongoing"}
              </td>
              <td>
                {best ? (
                  <Link href={`/players/${best.SteamId.toString()}?season=${season.Id}`}>{name}</Link>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="elo">{best?.PeakElo ?? "—"}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </section>
    </>
  );
}
