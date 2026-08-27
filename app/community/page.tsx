import Link from "next/link";
import ConnectButton from "@/components/ConnectButton";
import { getActiveSeason, prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import AvatarImage from "@/components/AvatarImage";
import { resolveNames, nameFrom } from "@/lib/names";
import { resolveAvatars } from "@/lib/avatars";
import { getLastSessionStandout } from "@/lib/hero";
import Reveal from "@/components/home/Reveal";
import LadderRows, { type LadderRow } from "@/components/home/LadderRows";

import LiveCard from "@/components/home/LiveCard";
import CountUp from "@/components/home/CountUp";
import SkinsBanner from "@/components/home/SkinsBanner";
import ModesShowcase from "@/components/home/ModesShowcase";
import StatsPreview from "@/components/home/StatsPreview";
import SeasonTwo from "@/components/home/SeasonTwo";
import ClipsPreview from "@/components/home/ClipsPreview";
import Podium from "@/components/home/Podium";
import { getT } from "@/lib/serverI18n";

export const dynamic = "force-dynamic";
export const revalidate = 30;

// The horizontal gutter now comes from .container (--page-pad); PAD is the
// vertical rhythm only, so a page can no longer drift from the site gutter.
const PAD = "0px";

// The community page.
//
// This was the site's homepage until the tournament system took that slot. It
// is otherwise unchanged — the ladder, the live card, the podium, the stats
// preview and the clips are all still here, because a homepage being replaced
// is not a reason to delete what was on it.
export default async function CommunityPage() {
  const t = getT();
  const serverAddress = process.env.NEXT_PUBLIC_SERVER_ADDRESS ?? "127.0.0.1:27015";
  const season = await getActiveSeason();
  const session = getSession();

  if (!season) {
    return (
      <>
        <Hero serverAddress={serverAddress} activePlayers={null} season={null} />
        <section style={{ padding: `0 ${PAD} 80px` }}>
          <h2>{t("auto.page.ladder")}</h2>
          <p className="text-muted">{t("auto.page.no_season_yet_start_one_in_gam")}</p>
        </section>
      </>
    );
  }

  const [ladder, standout] = await Promise.all([
    prisma.playerSeasonStats.findMany({
      where: { SeasonId: season.Id, IsCalibrating: false, RankedRoundsPlayed: { gt: 0 } },
      orderBy: { Elo: "desc" },
      take: 20,
    }),
    getLastSessionStandout(season.Id),
  ]);

  const ids = ladder.map((e) => e.SteamId);

  // K/D, ADR and win rate for the hover readout. Prisma has no conditional
  // aggregate, so deaths and wins are their own grouped counts rather than a
  // sum over a computed column.
  const [totals, deaths, wins, names, avatars] = await Promise.all([
    prisma.playerRoundRecord.groupBy({
      by: ["SteamId"],
      where: { SeasonId: season.Id, IsRanked: true, SteamId: { in: ids } },
      _sum: { Kills: true, Damage: true },
      _count: { _all: true },
    }),
    prisma.playerRoundRecord.groupBy({
      by: ["SteamId"],
      where: { SeasonId: season.Id, IsRanked: true, SteamId: { in: ids }, Died: true },
      _count: { _all: true },
    }),
    prisma.playerRoundRecord.groupBy({
      by: ["SteamId"],
      where: { SeasonId: season.Id, IsRanked: true, SteamId: { in: ids }, WonRound: true },
      _count: { _all: true },
    }),
    resolveNames([...ids, ...(standout ? [standout.steamId] : [])]),
    resolveAvatars([...ids, ...(standout ? [standout.steamId] : [])]),
  ]);

  const totalOf = new Map(totals.map((t) => [t.SteamId.toString(), t]));
  const deathOf = new Map(deaths.map((d) => [d.SteamId.toString(), d._count._all]));
  const winOf = new Map(wins.map((w) => [w.SteamId.toString(), w._count._all]));

  const mySteamId = session?.steamId ?? null;

  const rows: LadderRow[] = ladder.map((e) => {
    const key = e.SteamId.toString();
    const t = totalOf.get(key);
    const rounds = t?._count._all ?? 0;
    const d = deathOf.get(key) ?? 0;
    const k = t?._sum.Kills ?? 0;
    return {
      steamId: key,
      name: nameFrom(names, e.SteamId),
      elo: e.Elo,
      avatar: avatars[key],
      // Deaths of 0 would divide by zero; a player with kills and no deaths
      // scores their kill count, which is what a K/D of "k/1" means anyway.
      kd: rounds ? k / Math.max(d, 1) : null,
      adr: rounds ? (t?._sum.Damage ?? 0) / rounds : null,
      winPct: rounds ? ((winOf.get(key) ?? 0) / rounds) * 100 : null,
      isYou: key === mySteamId,
    };
  });

  const activePlayers = await prisma.playerProfile
    .count({ where: { LastSeenAtUtc: { gt: new Date(Date.now() - 15 * 60 * 1000) } } })
    .catch(() => 0);

  // Real figures for the showcase — a landing page claiming numbers it does
  // not have is the one thing worse than not claiming them.
  const [roundCount, playerCount, killSum, clipCount] = await Promise.all([
    prisma.playerRoundRecord.count({ where: { SeasonId: season.Id, IsRanked: true } }).catch(() => 0),
    prisma.playerProfile.count().catch(() => 0),
    prisma.playerRoundRecord
      .aggregate({ where: { SeasonId: season.Id, IsRanked: true }, _sum: { Kills: true } })
      .then((a) => a._sum.Kills ?? 0)
      .catch(() => 0),
    prisma.feedClip.count({ where: { Unlisted: false } }).catch(() => 0),
  ]);
  const siteTotals = { rounds: roundCount, players: playerCount, kills: killSum, clips: clipCount };

  const marquee = rows.slice(0, 10).map((r) => `${r.name} · ${r.elo}`);

  return (
    <>
      {/* The ballot sits beside the hero and disappears entirely when no vote
          is running — the homepage should not carry an empty box for eleven
          months of the year. */}
      <div className="home-hero-row">
        <Hero serverAddress={serverAddress} activePlayers={activePlayers} season={season.Name ?? `Season ${season.Id}`} />

      </div>

      <Marquee items={marquee.length ? marquee : ["Garden Retakes", "Ranked sessions", "Season live"]} />

      {standout && (
        <Standout
          name={nameFrom(names, standout.steamId)}
          steamId={standout.steamId}
          avatar={avatars[standout.steamId]}
          elo={standout.elo}
          rating={standout.rating}
          kd={standout.kd}
          adr={standout.adr}
          winPct={standout.winPct}
          rounds={standout.rounds}
        />
      )}

      <Podium rows={rows} seasonName={season.Name ?? `Season ${season.Id}`} />

      <ClipsPreview />

      <StatsPreview
        totals={siteTotals}
        example={rows.find((r) => r.avatar) ?? rows[0] ?? null}
      />

      {/* Directly after the stats block, because that block is what establishes
          that rounds are scored at all — the Season 2 changes are only news to
          someone who has just been told there is a number to change. It also
          puts the two links to /stats within a screen of each other rather
          than scattering them down the page. */}
      <SeasonTwo />

      <ModesShowcase />

      <SkinsBanner />

      <section className="home-block home-final">
        <h2>{t("home.final.title")}</h2>
        <p className="home-block-lead">
{t("home.final.lead")}
        </p>
        <div className="home-cta-row">
          <ConnectButton serverAddress={serverAddress} />
          {!session && (
            <a className="btn btn-secondary" href="/api/auth/steam/login">{t("home.final.signIn")}</a>
          )}
          <Link href="/utility" className="btn btn-secondary">{t("home.final.lineups")}</Link>
        </div>
      </section>

    </>
  );
}

function Hero({
  serverAddress,
  activePlayers,
  season,
}: {
  serverAddress: string;
  activePlayers: number | null;
  season: string | null;
}) {
    const t = getT();

  return (
    <section style={{ position: "relative", padding: `clamp(48px, 9vw, 108px) ${PAD} 0`, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)",
          gap: "clamp(24px, 4vw, 56px)",
          alignItems: "start",
        }}
      >
        <div style={{ gridColumn: 1, position: "relative", zIndex: 2 }}>
          <span className="kicker" style={{ marginBottom: 18 }}>
            {t("auto.page.garden_retakes_cs2")}
                                </span>
          <h1
            style={{
              fontSize: "clamp(46px, 6.8vw, 96px)",
              lineHeight: 0.98,
              letterSpacing: "-0.025em",
              margin: "0 0 28px",
              marginLeft: "-0.04em",
            }}
          >
            <Reveal as="span" variant="line" delay={0.05}>
              {t("auto.page.retakes_with_a")}
                                      </Reveal>
            <Reveal as="span" variant="line" delay={0.2} style={{ color: "var(--color-accent)" }}>
              {t("auto.page.real_economy")}
                                      </Reveal>
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              maxWidth: "46ch",
              color: "color-mix(in srgb, var(--color-text) 78%, transparent)",
              margin: "0 0 32px",
            }}
          >
            {t("auto.page.ranked_sessions_competitive_2v")}
                                </p>
          {/* No connect button here — the CTA band at the foot of the page owns
              that action, so the hero stays a statement rather than a form. */}
          <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            <Link
              href="#ladder"
              className="link-underline"
              style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              {t("auto.page.see_the_ladder")}
                                      </Link>
            <Link
              href="/stats"
              className="link-underline"
              style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              {t("auto.page.season_stats")}
                                      </Link>
          </div>
        </div>

        <div style={{ gridColumn: 2, position: "relative", minHeight: "clamp(200px, 30vw, 380px)", zIndex: 1 }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              bottom: "6%",
              background: "var(--color-bg)",
              border: "2px solid var(--color-divider)",
              padding: "18px 22px",
              maxWidth: 240,
              zIndex: 2,
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-accent-700)",
                marginBottom: 6,
              }}
            >
              <span className="live-dot" style={{ marginRight: 6 }} />
              {season ? `${season} · Live` : "Server"}
            </div>
            {activePlayers == null ? (
              <div className="num" style={{ fontWeight: 700, fontSize: 30, lineHeight: 1, color: "var(--color-accent)" }}>—</div>
            ) : (
              <CountUp
                value={activePlayers}
                className="num"
                style={{ display: "block", fontWeight: 700, fontSize: 30, lineHeight: 1, color: "var(--color-accent)" }}
              />
            )}
            <div
              style={{
                fontSize: 12,
                color: "color-mix(in srgb, var(--color-text) 70%, transparent)",
                marginTop: 4,
              }}
            >
              {t("auto.page.players_seen_in_the_last_15_mi")}
                                      </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Marquee({ items }: { items: string[] }) {
  // Doubled so the -50% keyframe lands exactly on a seam and the loop is
  // invisible.
  const doubled = [...items, ...items];
  return (
    // Full-bleed: a marquee that stops short of the viewport edge reads as a
    // boxed widget rather than a rail running under the page.
    <div
      className="full-bleed"
      style={{
        borderTop: "2px solid var(--color-divider)",
        borderBottom: "2px solid var(--color-divider)",
        marginTop: "clamp(40px, 6vw, 72px)",
        overflow: "hidden",
        padding: "14px 0",
      }}
    >
      <div
        className="gr-marquee-track"
        style={{ display: "flex", width: "max-content", animation: "marquee-scroll 28s linear infinite", gap: 56 }}
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            className="num"
            style={{ fontSize: 14, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 10 }}
          >
            <span style={{ color: "var(--color-accent)" }}>★</span>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function Standout(p: {
  name: string;
  steamId: string;
  avatar: string;
  elo: number | null;
  rating: number;
  kd: number;
  adr: number;
  winPct: number;
  rounds: number;
}) {
    const t = getT();

  const stats = [
    { label: "K/D", value: p.kd, decimals: 2 },
    { label: "ADR", value: p.adr, decimals: 0 },
    { label: "Win %", value: p.winPct, decimals: 0, suffix: "%" },
    { label: "Rounds", value: p.rounds, decimals: 0 },
  ];

  return (
    <Reveal as="section" style={{ padding: `clamp(64px, 9vw, 120px) ${PAD}`, position: "relative" }}>
      <div style={{ maxWidth: 1280, marginInline: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <span
            className="gr-pop"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-bg)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "6px 10px",
              fontWeight: 600,
            }}
          >
            {t("auto.page._standout_today")}
                                </span>
          <span className="rule-draw" style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 4 }}>
            <AvatarImage
              steamId={p.steamId}
              src={p.avatar}
              alt={p.name}
              className="grayscale avatar avatar-xl"
            />
            <h2 style={{ fontSize: "clamp(32px, 4vw, 52px)", letterSpacing: "-0.02em", margin: 0 }}>
              <Link href={`/players/${p.steamId}`} className="link-underline" style={{ color: "inherit", textDecoration: "none" }}>
                {p.name}
              </Link>
            </h2>
          </div>
          <div
            style={{
              fontSize: 14,
              color: "color-mix(in srgb, var(--color-text) 70%, transparent)",
              marginBottom: 28,
            }}
          >
            {p.elo != null ? `${p.elo} CS Rating · ` : ""}{t("auto.page.rated")} {p.rating.toFixed(2)}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, auto)",
              gap: "32px 40px",
              borderTop: "2px solid var(--color-divider)",
              paddingTop: 24,
            }}
          >
            {stats.map((s) => (
              <div key={s.label}>
                <CountUp
                  value={s.value}
                  decimals={s.decimals}
                  suffix={s.suffix}
                  className="num"
                  style={{
                    display: "block",
                    fontWeight: 700,
                    fontSize: "clamp(28px, 3vw, 40px)",
                    color: "var(--color-accent)",
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                />
                <div
                  style={{
                    fontSize: 12,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "color-mix(in srgb, var(--color-text) 65%, transparent)",
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Reveal>
  );
}
