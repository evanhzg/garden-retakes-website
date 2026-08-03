import Link from "next/link";
import { getActiveSeason, prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveName } from "@/lib/names";
import { resolveAvatar } from "@/lib/avatars";
import AvatarImage from "@/components/AvatarImage";
import { Columns, HBars, Histogram } from "@/components/stats/charts";
import CategoryRadar from "@/components/insights/CategoryRadar";
import Reveal from "@/components/home/Reveal";
import CountUp from "@/components/home/CountUp";
import {
  metricsOf, buildPopulation, scoreCategories, overallScore, buildSuggestions,
  byMap, bySide, clutchBreakdown, deathTiming, formTrend, consistency,
  multiKills, openingDuels, eloByMap, byHour, objectiveImpact,
  CATEGORY_LABEL, METRIC_LABEL, DEMO_DERIVED, type Round,
} from "@/lib/leetify";
import { loadBenchmark, availableBands, percentileAgainst } from "@/lib/benchmarks";
import { getT } from '@/lib/serverI18n';

export const dynamic = "force-dynamic";
export const revalidate = 120;

export const metadata = {
  title: "Insights",
  description: "Aim, utility, teamplay, positioning and trading — scored against the server.",
};

// The horizontal gutter now comes from .container (--page-pad); PAD is the
// vertical rhythm only, so a page can no longer drift from the site gutter.
const PAD = "0px";
const RECENT_ROUNDS = 150;
const MIN_ROUNDS = 25;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams?: { player?: string };
}) {
    const t = getT();

  const session = getSession();
  const target = searchParams?.player ?? session?.steamId ?? null;
  const season = await getActiveSeason();

  if (!season) return <Empty title={t("auto.page.no_active_season")} body="Start a season in-game to collect data." />;
  if (!target) {
    return (
      <Empty
        title={t("auto.page.sign_in_to_see_your_insights")}
        body="Your aim, utility, teamplay, positioning and trading, scored against everyone else on the server."
        cta={{ href: "/games/login?returnTo=/insights", label: "Sign in" }}
      />
    );
  }

  const select = {
    Map: true, PlayedAtUtc: true, TeamNum: true, WonRound: true, Kills: true, Headshots: true,
    Assists: true, FlashAssists: true, Damage: true, UtilityDamage: true, EnemiesFlashed: true,
    EnemyBlindDuration: true, Died: true, DiedAtSeconds: true, WasTeamKilled: true,
    KilledTeammate: true, DiedEarly: true, OpeningKill: true, OpeningDeath: true, TradeKills: true,
    TradedDeath: true, Kast: true, MultiKillCount: true, ClutchVersus: true, ClutchWon: true,
    BombPlanted: true, BombDefused: true, WasAfk: true, Rating: true, EloDelta: true,
  } as const;

  const [mine, everyone, name, avatar] = await Promise.all([
    prisma.playerRoundRecord.findMany({
      where: { SeasonId: season.Id, IsRanked: true, SteamId: BigInt(target) },
      select,
      orderBy: { PlayedAtUtc: "asc" },
    }) as unknown as Promise<Round[]>,
    prisma.playerRoundRecord.findMany({
      where: { SeasonId: season.Id, IsRanked: true },
      select: { ...select, SteamId: true },
    }) as unknown as Promise<(Round & { SteamId: bigint })[]>,
    resolveName(target),
    resolveAvatar(target),
  ]);

  if (mine.length < MIN_ROUNDS) {
    return (
      <Empty
        title={t("auto.page.not_enough_rounds_yet")}
        body={`Insights need at least ${MIN_ROUNDS} ranked rounds to say anything honest. You have ${mine.length}.`}
        cta={{ href: "/", label: "Back to the ladder" }}
      />
    );
  }

  // Population baseline: every qualifying player's career metrics this season.
  const byPlayer = new Map<string, Round[]>();
  for (const r of everyone) {
    const k = r.SteamId.toString();
    const b = byPlayer.get(k);
    if (b) b.push(r);
    else byPlayer.set(k, [r]);
  }
  const population = buildPopulation(
    Array.from(byPlayer.values()).filter((rs) => rs.length >= MIN_ROUNDS).map(metricsOf),
  );

  const career = metricsOf(mine);
  const recent = metricsOf(mine.slice(-RECENT_ROUNDS));
  const scores = scoreCategories(career, population);
  const overall = overallScore(scores);
  const suggestions = buildSuggestions(recent, career, population, scores);

  const maps = byMap(mine);
  const sides = bySide(mine);
  const clutches = clutchBreakdown(mine);
  const deaths = deathTiming(mine);
  const form = formTrend(mine);
  const steady = consistency(mine);
  const multis = multiKills(mine);
  const entries = openingDuels(mine);
  const elo = eloByMap(mine);
  const hours = byHour(mine);
  const objective = objectiveImpact(mine);

  const globalAvg = metricsOf(everyone as Round[]);

  // FACEIT ladders from the local demo ingest; absent until it has been run.
  const benchmark = loadBenchmark();
  const bands = availableBands(benchmark);

  return (
    <div style={{ padding: `clamp(40px, 6vw, 72px) ${PAD} 96px` }}>
      {/* ── header ─────────────────────────────────────────────────────── */}
      <header style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 10 }}>
        <AvatarImage steamId={target} src={avatar} alt={name} className="avatar avatar-xl grayscale" />
        <div>
          <span className="kicker">{t("auto.page.insights")} {season.Name ?? `Season ${season.Id}`}</span>
          <h1 style={{ fontSize: "clamp(32px, 5vw, 58px)", margin: "4px 0 0" }}>{name}</h1>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <CountUp
            value={overall}
            className="num"
            style={{ display: "block", fontSize: "clamp(40px, 6vw, 68px)", fontWeight: 700, lineHeight: 1, color: "var(--color-accent)" }}
          />
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }} className="text-muted">
            {t("auto.page.overall_percentile")} {career.rounds} {t("auto.page.rounds")}
                                </div>
        </div>
      </header>

      <p className="text-muted" style={{ maxWidth: "62ch", marginBottom: 32 }}>
        {t("auto.page.every_score_is_a_percentile_ag")} {MIN_ROUNDS}{t("auto.page._ranked_rounds_this_season_so")} {RECENT_ROUNDS} {t("auto.page.rounds")}
                    </p>

      {/* ── 1. category scores + radar ─────────────────────────────────── */}
      <Reveal>
        <Section title={t("auto.page.1_category_scores")}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 300px) minmax(0, 1fr)", gap: 40, alignItems: "center" }}>
            <CategoryRadar points={scores.map((s) => ({ label: CATEGORY_LABEL[s.category], score: s.score }))} />
            <div style={{ display: "grid", gap: 14 }}>
              {scores.map((s) => (
                <div key={s.category}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <strong style={{ fontSize: 14 }}>{CATEGORY_LABEL[s.category]}</strong>
                    <span className="num" style={{ fontWeight: 700, color: "var(--color-accent)" }}>
                      {Math.round(s.score)}
                    </span>
                  </div>
                  <div className="gprofile-bar"><span style={{ width: `${s.score}%` }} /></div>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                    {s.parts.map((p) => `${p.label} ${Math.round(p.percentile)}`).join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </Reveal>

      {/* ── 2. coaching ────────────────────────────────────────────────── */}
      <Reveal>
        <Section title={t("auto.page.2_what_to_work_on")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 2, background: "var(--color-divider)", border: "1px solid var(--color-divider)" }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{ background: "var(--color-bg)", padding: 18 }}>
                <span
                  className="tag"
                  style={{
                    background:
                      s.severity === "strength" ? "var(--color-accent-2-100)"
                      : s.severity === "critical" ? "var(--color-accent-200)"
                      : "var(--color-neutral-100)",
                    color:
                      s.severity === "strength" ? "var(--color-accent-2-800)"
                      : s.severity === "critical" ? "var(--color-accent-800)"
                      : "var(--color-neutral-800)",
                  }}
                >
                  {s.severity === "strength" ? "Strength" : s.severity === "critical" ? "Critical" : "Work on"}
                </span>
                <h4 style={{ margin: "10px 0 6px", fontSize: 15 }}>{s.title}</h4>
                <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>{s.detail}</p>
                {s.drill && (
                  <p style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
                    <strong>{t("auto.page.drill")} </strong>{s.drill}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      </Reveal>

      {/* ── 3. recent vs career vs server ──────────────────────────────── */}
      <Reveal>
        <Section title={t("auto.page.3_recent_form_vs_your_average")}>
          <table className="table">
            <thead>
              <tr>
                <th>{t("auto.page.metric")}</th>
                <th style={{ textAlign: "right" }}>{t("auto.page.last")} {RECENT_ROUNDS}</th>
                <th style={{ textAlign: "right" }}>{t("auto.page.your_average")}</th>
                <th style={{ textAlign: "right" }}>{t("auto.page.server_average")}</th>
              </tr>
            </thead>
            <tbody>
              {([
                ["ADR", "adr", 0], ["KAST", "kast", 1], ["Headshot %", "hsPct", 1],
                ["Kills / round", "kpr", 2], ["Utility dmg / round", "utilDmgPerRound", 1],
                ["Trade kills / round", "tradeKillsPerRound", 2], ["Survival %", "survivalPct", 1],
                ["Opening deaths %", "openingDeathRate", 1], ["Deaths traded %", "tradedDeathPct", 1],
              ] as const).map(([label, key, dp]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{recent[key].toFixed(dp)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{career[key].toFixed(dp)}</td>
                  <td className="num text-muted" style={{ textAlign: "right" }}>{globalAvg[key].toFixed(dp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </Reveal>

      {/* ── 4–6 ───────────────────────────────────────────────────────── */}
      <div className="chart-grid-2" style={{ gap: 24 }}>
        <Reveal><Section title={t("auto.page.4_form_trend")}><Columns data={form.map(f => ({ label: f.label, value: Number(f.value.toFixed(2)), hint: f.hint }))} /></Section></Reveal>
        <Reveal><Section title={t("auto.page.5_when_you_die")}><Histogram buckets={deaths} color="var(--color-accent)" /></Section></Reveal>
      </div>

      <div className="chart-grid-2" style={{ gap: 24 }}>
        <Reveal>
          <Section title={t("auto.page.6_map_profile")}>
            <table className="table">
              <thead><tr><th>{t("auto.page.map")}</th><th style={{textAlign:"right"}}>{t("auto.page.rating")}</th><th style={{textAlign:"right"}}>{t("auto.page.adr")}</th><th style={{textAlign:"right"}}>{t("auto.page.win")}</th><th style={{textAlign:"right"}}>{t("auto.page.rds")}</th></tr></thead>
              <tbody>
                {maps.map((m) => (
                  <tr key={m.label}>
                    <td>{m.label}</td>
                    <td className="num" style={{textAlign:"right", fontWeight:700}}>{m.metrics.rating.toFixed(2)}</td>
                    <td className="num" style={{textAlign:"right"}}>{m.metrics.adr.toFixed(0)}</td>
                    <td className="num" style={{textAlign:"right"}}>{m.metrics.winPct.toFixed(0)}%</td>
                    <td className="num text-muted" style={{textAlign:"right"}}>{m.rounds}</td>
                  </tr>
                ))}
                {maps.length === 0 && <tr><td colSpan={5} className="text-muted">{t("auto.page.not_enough_rounds_per_map_yet")}</td></tr>}
              </tbody>
            </table>
          </Section>
        </Reveal>

        <Reveal>
          <Section title={t("auto.page.7_t_vs_ct")}>
            <table className="table">
              <thead><tr><th>{t("auto.page.side")}</th><th style={{textAlign:"right"}}>{t("auto.page.rating")}</th><th style={{textAlign:"right"}}>{t("auto.page.adr")}</th><th style={{textAlign:"right"}}>{t("auto.page.kast")}</th><th style={{textAlign:"right"}}>{t("auto.page.open")}</th></tr></thead>
              <tbody>
                {sides.map((s) => (
                  <tr key={s.label}>
                    <td><span className={`tag ${s.label === "T" ? "tag-accent" : "tag-accent-2"}`}>{s.label}</span></td>
                    <td className="num" style={{textAlign:"right", fontWeight:700}}>{s.metrics.rating.toFixed(2)}</td>
                    <td className="num" style={{textAlign:"right"}}>{s.metrics.adr.toFixed(0)}</td>
                    <td className="num" style={{textAlign:"right"}}>{s.metrics.kast.toFixed(0)}%</td>
                    <td className="num" style={{textAlign:"right"}}>{s.metrics.openingWinPct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </Reveal>
      </div>

      {/* ── 8–12 ──────────────────────────────────────────────────────── */}
      <div className="chart-grid-2" style={{ gap: 24 }}>
        <Reveal>
          <Section title={t("auto.page.8_clutches")}>
            <table className="table">
              <thead><tr><th>{t("auto.page.situation")}</th><th style={{textAlign:"right"}}>{t("auto.page.won")}</th><th style={{textAlign:"right"}}>{t("auto.page.attempts")}</th><th style={{textAlign:"right"}}>{t("auto.page.rate")}</th></tr></thead>
              <tbody>
                {clutches.filter(c => c.attempts > 0).map((c) => (
                  <tr key={c.versus}>
                    <td className="num">{t("auto.page.1v")}{c.versus}</td>
                    <td className="num" style={{textAlign:"right", fontWeight:700}}>{c.won}</td>
                    <td className="num" style={{textAlign:"right"}}>{c.attempts}</td>
                    <td className="num" style={{textAlign:"right"}}>{c.pct.toFixed(0)}%</td>
                  </tr>
                ))}
                {clutches.every(c => c.attempts === 0) && <tr><td colSpan={4} className="text-muted">{t("auto.page.no_clutch_situations_recorded")}</td></tr>}
              </tbody>
            </table>
          </Section>
        </Reveal>

        <Reveal>
          <Section title={t("auto.page.9_opening_duels_by_side")}>
            <table className="table">
              <thead><tr><th>{t("auto.page.side")}</th><th style={{textAlign:"right"}}>{t("auto.page.won")}</th><th style={{textAlign:"right"}}>{t("auto.page.lost")}</th><th style={{textAlign:"right"}}>{t("auto.page.rate")}</th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.side}>
                    <td><span className={`tag ${e.side === "T" ? "tag-accent" : "tag-accent-2"}`}>{e.side}</span></td>
                    <td className="num" style={{textAlign:"right", fontWeight:700}}>{e.wins}</td>
                    <td className="num" style={{textAlign:"right"}}>{e.losses}</td>
                    <td className="num" style={{textAlign:"right"}}>{e.pct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </Reveal>
      </div>

      <div className="chart-grid-2" style={{ gap: 24 }}>
        <Reveal><Section title={t("auto.page.10_elo_earned_per_map")}><HBars rows={elo} color="var(--color-accent)" formatValue={(v) => `${v > 0 ? "+" : ""}${v}`} /></Section></Reveal>
        <Reveal><Section title={t("auto.page.11_multi_kill_rounds")}><HBars rows={multis.map(m => ({ label: m.label, value: m.count }))} color="var(--color-accent)" /></Section></Reveal>
      </div>

      <div className="chart-grid-2" style={{ gap: 24 }}>
        <Reveal>
          <Section title={t("auto.page.12_consistency")}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <CountUp value={steady.steadiness} className="num" style={{ fontSize: 44, fontWeight: 700, color: "var(--color-accent)" }} />
              <span className="text-muted" style={{ fontSize: 13 }}>
                {t("auto.page.steadiness_mean_rating")} {steady.mean.toFixed(2)}{t("auto.page._spread")}{steady.stdDev.toFixed(2)}
              </span>
            </div>
            <p className="text-muted" style={{ fontSize: 13, marginTop: 10 }}>
              {t("auto.page.high_steadiness_means_you_turn")}
                                      </p>
          </Section>
        </Reveal>

        <Reveal>
          <Section title={t("auto.page.13_objective_impact")}>
            <p style={{ margin: 0 }}>
              {t("auto.page.you_win")} <strong className="num">{objective.withObj.winPct.toFixed(0)}%</strong> {t("auto.page.of_rounds_where_you_plant_or_d")}{objective.withObj.rounds} {t("auto.page.rounds_against")}{" "}
              <strong className="num">{objective.without.winPct.toFixed(0)}%</strong> {t("auto.page.otherwise")}
                                      </p>
          </Section>
        </Reveal>
      </div>

      {hours.length > 0 && (
        <Reveal>
          <Section title={t("auto.page.14_rating_by_hour_utc")}>
            <Columns data={hours.map(h => ({ label: h.label, value: Number(h.value.toFixed(2)), hint: h.hint }))} />
          </Section>
        </Reveal>
      )}

      {/* ── 15. FACEIT benchmark ──────────────────────────────────────── */}
      {benchmark && bands.length > 0 && (
        <Reveal>
          <Section title={t("auto.page.15_against_faceit")}>
            <p className="text-muted" style={{ maxWidth: "62ch", marginBottom: 16 }}>
              {t("auto.page.the_same_metrics_scored_agains")} {new Date(benchmark.generatedAt).toLocaleDateString()}.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("auto.page.metric")}</th>
                  <th style={{ textAlign: "right" }}>{t("auto.page.you")}</th>
                  {bands.map((b) => (
                    <th key={b} style={{ textAlign: "right" }}>
                      {b === "pro" ? "Pro" : `Lvl ${b}`}
                      <br />
                      <span className="text-muted" style={{ fontWeight: 400 }}>
                        {benchmark.bands[b].samples}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["adr", "kast", "hsPct", "utilDmgPerRound", "tradeKillsPerRound", "openingWinPct"] as const).map((key) => (
                  <tr key={key}>
                    <td>{METRIC_LABEL[key] ?? key}</td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>
                      {career[key].toFixed(1)}
                    </td>
                    {bands.map((b) => {
                      const p = percentileAgainst(benchmark.bands[b], key, career[key], benchmark.ladder);
                      return (
                        <td key={b} className="num" style={{ textAlign: "right" }}>
                          {p == null ? "—" : `${Math.round(p)}th`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </Reveal>
      )}

      {!benchmark && (
        <Reveal>
          <Section title={t("auto.page.15_against_faceit")}>
            <p className="text-muted" style={{ maxWidth: "62ch" }}>
              {t("auto.page.no_faceit_benchmark_ingested_y")}
                                      </p>
            <pre
              style={{
                marginTop: 12, padding: 14, overflowX: "auto",
                background: "var(--color-surface)", border: "1px solid var(--color-divider)",
                fontFamily: "var(--font-mono)", fontSize: 12,
              }}
            >{`node scripts/demo-ingest/ingest.mjs --player <nickname> --matches 20`}</pre>
          </Section>
        </Reveal>
      )}

      {/* ── honesty about demos ───────────────────────────────────────── */}
      <Reveal>
        <Section title={t("auto.page.not_measured_yet")}>
          <p className="text-muted" style={{ maxWidth: "62ch" }}>
            {t("auto.page.everything_above_comes_from_pe")}
                                </p>
          <ul className="text-muted" style={{ fontSize: 13, columns: 2, columnGap: 32, marginTop: 12 }}>
            {DEMO_DERIVED.map((d) => <li key={d} style={{ marginBottom: 4 }}>{d}</li>)}
          </ul>
        </Section>
      </Reveal>

      <div style={{ marginTop: 40, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/stats" className="btn btn-secondary">{t("auto.page.server_stats")}</Link>
        <Link href={`/players/${target}`} className="btn btn-secondary">{t("auto.page.full_profile")}</Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ins-section">
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <h2 style={{ fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>{title}</h2>
        <span className="rule-draw" style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
      </div>
      {children}
    </section>
  );
}

function Empty({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
    const t = getT();

  return (
    <div style={{ padding: `clamp(64px, 10vw, 140px) ${PAD}`, maxWidth: 640, marginInline: "auto", textAlign: "center" }}>
      <span className="kicker">{t("auto.page.insights")}</span>
      <h1 style={{ margin: "8px 0 12px" }}>{title}</h1>
      <p className="text-muted" style={{ marginBottom: 28 }}>{body}</p>
      {cta && <Link href={cta.href} className="btn btn-primary">{cta.label}</Link>}
    </div>
  );
}
