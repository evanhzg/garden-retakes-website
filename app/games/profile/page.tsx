import React from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AvatarImage from "@/components/AvatarImage";
import GamesPopCard from "@/components/games/GamesPopCard";
import "./profile.css";
import { getT } from '@/lib/serverI18n';

export const dynamic = "force-dynamic";

// Labels for the ids stored in WebGameStats.GameId. Kept next to the page that
// renders them; the hub owns its own copy for the cards.
const GAME_LABELS: Record<string, string> = {
  monopoly: "MONOPO7Y",
  uno: "OUNO",
  skribbl: "FREE-DRAW",
  meme: "HASAMEME",
  codenames: "CODENAMES",
  cah: "PILE OF...",
  headshot: "HEADSHOT",
  buymenu: "BUY MENU",
  pentakill: "PENTAKILL",
  buildpath: "BUILD PATH",
};

const label = (id: string) => GAME_LABELS[id] ?? id.toUpperCase();

function SignedOut() {
    const t = getT();

  return (
    <div className="gprofile-empty">
      <span className="gprofile-kicker hand">{t("auto.page.your_record_in_one_place")}</span>
      <h1>{t("auto.page.games_profile")}</h1>
      <p>
        {t("auto.page.sign_in_to_keep_your_elo_win_r")}
                    </p>
      <div className="gprofile-empty-actions">
        <Link href="/games/login?returnTo=/games/profile" className="gprofile-cta">
          {t("auto.page.sign_in")}
                          </Link>
        <Link href="/games" className="gprofile-ghost">
          {t("auto.page.back_to_the_hub")}
                          </Link>
      </div>
    </div>
  );
}

export default async function GamesProfilePage() {
    const t = getT();

  const session = getSession();
  if (!session) return <SignedOut />;

  const steamId = BigInt(session.steamId);

  const [rows, profile, webProfile] = await Promise.all([
    prisma.webGameStats.findMany({ where: { SteamId: steamId }, orderBy: { Elo: "desc" } }),
    prisma.playerProfile.findUnique({
      where: { SteamId: steamId },
      select: { LastKnownName: true },
    }),
    // The Pop config the CS2 profile used to own.
    prisma.gardenWebProfile.findUnique({
      where: { SteamId: steamId },
      select: { PopConfig: true },
    }),
  ]);

  const displayName = profile?.LastKnownName ?? session.name ?? session.steamId;

  const played = rows.reduce((n, r) => n + r.MatchesPlayed, 0);
  const won = rows.reduce((n, r) => n + r.MatchesWon, 0);
  const winRate = played ? Math.round((won / played) * 100) : 0;
  const bestElo = rows.length ? Math.max(...rows.map((r) => r.Elo)) : 0;

  // Rank per game, resolved in one query per game the player actually appears in
  // rather than pulling the whole ladder.
  const ranks = await Promise.all(
    rows.map(async (r) => ({
      gameId: r.GameId,
      rank: (await prisma.webGameStats.count({
        where: { GameId: r.GameId, Elo: { gt: r.Elo } },
      })) + 1,
    })),
  );
  const rankFor = Object.fromEntries(ranks.map((r) => [r.gameId, r.rank]));

  return (
    <div className="gprofile">
      <header className="gprofile-head">
        <div className="gprofile-id">
          <div className="gprofile-avatar">
            <AvatarImage steamId={session.steamId} src={session.avatar} />
          </div>
          <div>
            <span className="gprofile-kicker hand">{t("auto.page.games_profile")}</span>
            <h1>{displayName}</h1>
            <Link href="/games" className="gprofile-back">
              {t("auto.page._games_hub")}
                                      </Link>
          </div>
        </div>

        <GamesPopCard initialPopConfig={webProfile?.PopConfig ?? null} />

        <dl className="gprofile-stats">
          <div><dt>{t("auto.page.games_played")}</dt><dd>{played}</dd></div>
          <div><dt>{t("auto.page.win_rate")}</dt><dd>{played ? `${winRate}%` : "—"}</dd></div>
          <div><dt>{t("auto.page.best_elo")}</dt><dd>{bestElo || "—"}</dd></div>
          <div><dt>{t("auto.page.titles_tracked")}</dt><dd>{rows.length}</dd></div>
        </dl>
      </header>

      <section className="gprofile-section">
        <div className="gprofile-section-head">
          <h2>{t("auto.page.per_game_standing")}</h2>
          <Link href="/games/ladder">{t("auto.page.full_ladder")}</Link>
        </div>

        {rows.length === 0 ? (
          <div className="gprofile-none">
            <p>{t("auto.page.no_ranked_games_yet")}</p>
            <Link href="/games" className="gprofile-cta">{t("auto.page.pick_a_game")}</Link>
          </div>
        ) : (
          <ul className="gprofile-games">
            {rows.map((r) => {
              const rate = r.MatchesPlayed
                ? Math.round((r.MatchesWon / r.MatchesPlayed) * 100)
                : 0;
              return (
                <li key={r.GameId} className="gprofile-game">
                  <div className="gprofile-game-top">
                    <span className="gprofile-game-name">{label(r.GameId)}</span>
                    <span className="gprofile-game-rank">#{rankFor[r.GameId]}</span>
                  </div>
                  <div className="gprofile-game-elo">
                    {r.Elo}
                    <small>{t("auto.page.elo")}</small>
                  </div>
                  <div className="gprofile-bar" role="img" aria-label={`${rate}% win rate`}>
                    <span style={{ width: `${rate}%` }} />
                  </div>
                  <div className="gprofile-game-meta">
                    {r.MatchesWon}{t("auto.page.w")} {r.MatchesPlayed - r.MatchesWon}{t("auto.page.l")} {rate}%
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
