import { getActiveSeason, prisma } from "@/lib/db";
import { fetchRows, ratingClass, summarize, StatSummary } from "@/lib/stats";

export const revalidate = 30;

type Metric = {
  label: string;
  value: (s: StatSummary) => number;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
};

const METRICS: Metric[] = [
  { label: "Rating", value: (s) => s.rating, format: (v) => v.toFixed(2) },
  { label: "K/D", value: (s) => s.kd, format: (v) => v.toFixed(2) },
  { label: "ADR", value: (s) => s.adr, format: (v) => v.toFixed(0) },
  { label: "KAST %", value: (s) => s.kast, format: (v) => `${v.toFixed(0)}%` },
  { label: "HS %", value: (s) => s.hs, format: (v) => `${v.toFixed(0)}%` },
  { label: "Round win %", value: (s) => s.winPct, format: (v) => `${v.toFixed(0)}%` },
  { label: "Kills / round", value: (s) => s.kpr, format: (v) => v.toFixed(2) },
  { label: "Opening kills", value: (s) => s.openingKills, format: (v) => `${v}` },
  { label: "Clutches won", value: (s) => s.clutches, format: (v) => `${v}` },
  { label: "Multi-kill rounds", value: (s) => s.multiKills, format: (v) => `${v}` },
  { label: "Util dmg / round", value: (s) => s.utilPerRound, format: (v) => v.toFixed(1) },
  { label: "Rounds played", value: (s) => s.rounds, format: (v) => `${v}` },
];

export default async function ComparePage({
  searchParams,
}: {
  searchParams: { a?: string; b?: string; ranked?: string };
}) {
  const season = await getActiveSeason();
  const seasonId = season?.Id ?? 0;
  const rankedOnly = searchParams.ranked === "1";

  // Ladder players for the pick lists.
  const ladder = await prisma.playerSeasonStats.findMany({
    where: { SeasonId: seasonId },
    orderBy: { Elo: "desc" },
    take: 100,
  });
  const profiles = await prisma.playerProfile.findMany({
    where: { SteamId: { in: ladder.map((entry) => entry.SteamId) } },
  });
  const nameOf = new Map(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName]));

  const parseId = (value?: string) => {
    try {
      return value ? BigInt(value) : null;
    } catch {
      return null;
    }
  };

  const idA = parseId(searchParams.a);
  const idB = parseId(searchParams.b);

  const [statsA, statsB] = await Promise.all([
    idA ? fetchRows(seasonId, idA, rankedOnly).then(summarize) : null,
    idB ? fetchRows(seasonId, idB, rankedOnly).then(summarize) : null,
  ]);

  const nameA = idA ? nameOf.get(idA.toString()) ?? searchParams.a : null;
  const nameB = idB ? nameOf.get(idB.toString()) ?? searchParams.b : null;

  return (
    <>
      <section className="panel">
        <h2>Player comparison — {season?.Name ?? "no season"}</h2>
        <form className="form-row" method="GET">
          <input
            className="input"
            style={{ maxWidth: 260 }}
            name="a"
            list="ladder-players"
            placeholder="Player A (SteamID64)"
            defaultValue={searchParams.a ?? ""}
          />
          <span className="muted" style={{ fontWeight: 800 }}>
            VS
          </span>
          <input
            className="input"
            style={{ maxWidth: 260 }}
            name="b"
            list="ladder-players"
            placeholder="Player B (SteamID64)"
            defaultValue={searchParams.b ?? ""}
          />
          <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" name="ranked" value="1" defaultChecked={rankedOnly} />
            Ranked only
          </label>
          <button className="btn" type="submit">
            Compare
          </button>
        </form>
        <datalist id="ladder-players">
          {ladder.map((entry) => (
            <option key={entry.Id} value={entry.SteamId.toString()}>
              {nameOf.get(entry.SteamId.toString()) ?? entry.SteamId.toString()} · {entry.Elo} CSR
            </option>
          ))}
        </datalist>
        <p className="muted" style={{ fontSize: "0.82rem", marginBottom: 0 }}>
          Start typing to pick from the ladder, or paste any SteamID64.
        </p>
      </section>

      {statsA && statsB && (
        <section className="panel">
          <div className="cmp-grid" style={{ marginBottom: 14 }}>
            <div className="cmp-name" style={{ textAlign: "right" }}>
              <a href={`/players/${searchParams.a}`}>{nameA}</a>
              <div className={`cmp-val ${ratingClass(statsA.rating)}`} style={{ fontSize: "1.6rem" }}>
                {statsA.rating.toFixed(2)}
              </div>
            </div>
            <div className="cmp-metric" style={{ alignSelf: "center" }}>
              RATING
            </div>
            <div className="cmp-name">
              <a href={`/players/${searchParams.b}`}>{nameB}</a>
              <div className={`cmp-val ${ratingClass(statsB.rating)}`} style={{ fontSize: "1.6rem" }}>
                {statsB.rating.toFixed(2)}
              </div>
            </div>
          </div>

          {METRICS.map((metric) => {
            const a = metric.value(statsA);
            const b = metric.value(statsB);
            const totalValue = a + b;
            const shareA = totalValue > 0 ? (a / totalValue) * 100 : 50;
            const shareB = totalValue > 0 ? (b / totalValue) * 100 : 50;
            const aWins = metric.lowerIsBetter ? a < b : a > b;
            const bWins = metric.lowerIsBetter ? b < a : b > a;

            return (
              <div key={metric.label} className="cmp-grid" style={{ marginBottom: 10 }}>
                <div>
                  <div className={`cmp-val ${aWins ? "rating-good" : ""}`} style={{ textAlign: "right" }}>
                    {metric.format(a)}
                  </div>
                  <div className="cmp-bar left">
                    <div className="fill" style={{ width: `${shareA}%`, opacity: aWins ? 1 : 0.35 }} />
                  </div>
                </div>
                <div className="cmp-metric">{metric.label}</div>
                <div>
                  <div className={`cmp-val ${bWins ? "rating-good" : ""}`}>{metric.format(b)}</div>
                  <div className="cmp-bar right">
                    <div className="fill" style={{ width: `${shareB}%`, opacity: bWins ? 1 : 0.35 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {(searchParams.a || searchParams.b) && (!statsA || !statsB) && (
        <section className="panel">
          <p className="empty-hint">Pick two valid players to see the head-to-head.</p>
        </section>
      )}
    </>
  );
}
