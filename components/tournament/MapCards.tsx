"use client";

import { Download, Trophy } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import AvatarImage from "@/components/AvatarImage";
import type { ScoreboardMap, ScoreboardRow } from "@/lib/tournament/scoreboard";
import "./mapcards.css";

// The series, as cards rather than a table row each.
//
// A row gave every map the same weight as a line of metadata, which is the
// wrong shape for the thing the page is actually about: which maps are being
// played, who chose them, and how they went. A card can carry the picture, and
// the picture is how anybody recognises a map — "de_anubis" is a string,
// Anubis is somewhere you have stood.
//
// The demo hangs off the card it belongs to rather than sitting in one list at
// the bottom, because a demo is of a map, and on a BO3 "which one is this"
// is exactly the question a single list makes you answer twice.

export default function MapCards({
  maps,
  teamA,
  teamB,
}: {
  maps: ScoreboardMap[];
  teamA: string;
  teamB: string;
}) {
  const { t } = useI18n();

  if (maps.length === 0) return null;

  return (
    <ol className="mc">
      {maps.map((m) => {
        const played = m.scoreA + m.scoreB > 0 || m.state !== "pending";

        return (
          <li key={m.id} className={`mc-card ${m.state === "live" ? "live" : ""}`}>
            {/* The picture is decoration and is marked as such: the map's name
                is already written underneath it, so a screen reader announcing
                the file name again would be noise. */}
            <div className="mc-art">
              {m.image ? (
                <img src={m.image} alt="" loading="lazy" />
              ) : (
                <span className="mc-art-none" aria-hidden />
              )}

              <span className="mc-ordinal num">{m.ordinal + 1}</span>
              {m.state === "live" && <span className="mc-live">{t("scoreboard.live")}</span>}
            </div>

            <div className="mc-body">
              <h4 className="mc-name">{m.label}</h4>

              <p className="mc-by">
                {/* The decider is nobody's pick — a fact about the series
                    rather than missing data, so it says so. */}
                {m.isDecider ? (
                  <span className="mc-decider">{t("match.decider")}</span>
                ) : m.pickedBy ? (
                  t("match.pickedByTeam", { team: m.pickedBy === "a" ? teamA : teamB })
                ) : (
                  "—"
                )}
              </p>

              <p className="mc-side muted">
                {t("match.startSide")}: {m.startSideTeamA ?? t("match.knife")}
              </p>

              {/* How the knife went. Only a map whose sides the veto did NOT
                  settle has one, and for those it is the only record of how the
                  sides came to be what they are. */}
              {m.knifeWinner && (
                <p className="mc-knife">
                  {t(m.knifeChoice === "switch" ? "match.knifeSwitched" : "match.knifeStayed", {
                    team: m.knifeWinner === "a" ? teamA : teamB,
                  })}
                </p>
              )}

              {played && (
                <p className={`mc-score num ${m.winner ? `won-${m.winner}` : ""}`}>
                  <span className={m.winner === "a" ? "mc-win" : ""}>{m.scoreA}</span>
                  <span className="mc-dash">–</span>
                  <span className={m.winner === "b" ? "mc-win" : ""}>{m.scoreB}</span>
                </p>
              )}

              {/* Who took the map, in words.
                  The scoreline already bolds the winning number, but that only
                  works if you know which side of the dash is which team — and
                  the card never names them, because the two team names live at
                  the top of the page, not on every card. On a BO3 where the
                  same two teams appear three times, "13-7" answers nothing on
                  its own. So a map that is OVER says who won it. */}
              {m.winner && (
                <p className="mc-won">
                  <Trophy size={12} aria-hidden />
                  <span>{t("match.mapWonBy", { team: m.winner === "a" ? teamA : teamB })}</span>
                </p>
              )}

              {/* The demo, and only what is true about it.
                  /api/tournament/demo records that a file EXISTS; the file is
                  still on the game server, and moving it is a collector's job
                  that does not exist yet — the route says so in its own header.
                  So this names the recording rather than offering a download
                  that would 404, because a dead button reads as the demo being
                  lost, which is worse than saying where it is. The moment a
                  collector publishes a URL this becomes the button. */}
              {m.demo && (
                <p className="mc-demo-name" title={m.demo}>
                  <Download size={13} aria-hidden />
                  <span>{t("match.demoRecorded")}</span>
                  <code>{m.demo.split("/").pop()}</code>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The best player of the match.
 *
 * Shown only once it is over. A live MVP changes hands every round and means
 * nothing until the end, so naming one early is a crown that gets taken away.
 */
export function MvpCard({
  mvp,
  teamA,
  teamB,
  roleIcons,
}: {
  mvp: ScoreboardRow;
  teamA: string;
  teamB: string;
  /** Rendered by the caller, which owns the role-icon component. */
  roleIcons?: React.ReactNode;
}) {
  const { t } = useI18n();

  return (
    <section className="mvp">
      <header className="mvp-head">
        <Trophy size={16} aria-hidden />
        <span>{t("match.mvp")}</span>
      </header>

      <div className="mvp-who">
        {/* The site's own avatar component, which resolves through
            /api/avatars and falls back to the placeholder. A bot has no Steam
            profile at all, so the fallback is the normal case here rather than
            an edge one. */}
        <AvatarImage steamId={mvp.steamId} className="mvp-avatar" alt="" />

        <div className="mvp-id">
          <a className="mvp-name" href={`/players/${mvp.steamId}`}>
            {mvp.name}
          </a>
          <span className="mvp-team">
            {mvp.slot === "a" ? teamA : mvp.slot === "b" ? teamB : ""}
          </span>
        </div>

        {roleIcons && <span className="mvp-roles">{roleIcons}</span>}
      </div>

      <dl className="mvp-stats">
        <div>
          <dt>{t("tstats.rating")}</dt>
          <dd className="num mvp-lead">{mvp.ratingAvg.toFixed(2)}</dd>
        </div>
        <div>
          <dt>{t("scoreboard.kda")}</dt>
          <dd className="num">
            {mvp.kills}–{mvp.deaths}–{mvp.assists}
          </dd>
        </div>
        <div>
          <dt>{t("tstats.adr")}</dt>
          <dd className="num">{mvp.adr}</dd>
        </div>
      </dl>
    </section>
  );
}
