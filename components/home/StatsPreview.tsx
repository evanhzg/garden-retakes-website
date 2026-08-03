import Link from "next/link";
import AvatarImage from "@/components/AvatarImage";
import type { LadderRow } from "@/components/home/LadderRows";
import { getT } from "@/lib/serverI18n";

// What the tracking actually gives you, shown rather than described.
//
// A real profile card beside real server totals: the numbers are the product,
// so the section is made of them instead of a list of bullet points claiming
// they exist.

export default function StatsPreview({
  totals,
  example,
}: {
  totals: { rounds: number; players: number; kills: number; clips: number };
  example: LadderRow | null;
}) {
  const t = getT();
  return (
    <section className="home-block home-split">
      <div>
        <span className="kicker">{t("home.stats.kicker")}</span>
        <h2>{t("home.stats.title")}</h2>
        <p className="home-block-lead">
          {t("auto.statspreview.rating_cs_rating_k_d_adr_kast")}
                          </p>

        <dl className="home-figures">
          <div><dt>{t("home.stats.rounds")}</dt><dd className="num">{totals.rounds.toLocaleString()}</dd></div>
          <div><dt>{t("home.stats.players")}</dt><dd className="num">{totals.players.toLocaleString()}</dd></div>
          <div><dt>{t("home.stats.kills")}</dt><dd className="num">{totals.kills.toLocaleString()}</dd></div>
          <div><dt>{t("home.stats.clips")}</dt><dd className="num">{totals.clips.toLocaleString()}</dd></div>
        </dl>

        <div className="home-cta-row">
          <Link href="/stats" className="btn btn-primary">{t("home.stats.cta")}</Link>
          <Link href="/stats#how" className="btn btn-secondary">{t("home.stats.how")}</Link>
        </div>
      </div>

      {/* An actual profile, not a mock-up — a fake one would be the only thing
          on this page that is not real. */}
      {example && (
        <Link href={`/players/${example.steamId}`} className="home-profile-card">
          <span className="home-profile-top">
            <AvatarImage steamId={example.steamId} src={example.avatar} alt={example.name} className="avatar avatar-xl" />
            <span>
              <span className="kicker">{t("auto.statspreview.profile")}</span>
              <strong className="home-profile-name">{example.name}</strong>
            </span>
          </span>
          <span className="home-profile-figures">
            <span><em className="num">{example.elo}</em> {t("auto.statspreview.cs_rating")}</span>
            {example.kd !== null && <span><em className="num">{example.kd.toFixed(2)}</em> {t("auto.statspreview.k_d")}</span>}
            {example.adr !== null && <span><em className="num">{example.adr.toFixed(0)}</em> {t("auto.statspreview.adr")}</span>}
            {example.winPct !== null && <span><em className="num">{example.winPct.toFixed(0)}%</em> {t("auto.statspreview.wins")}</span>}
          </span>
          <span className="home-profile-foot">{t("home.profile.more")}</span>
        </Link>
      )}
    </section>
  );
}
