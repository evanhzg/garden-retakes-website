"use client";

import { useI18n } from "@/components/I18nProvider";
import { roleLabel } from "@/lib/tournament/roles";
import "./teampanel.css";

// One team, down the side of the veto and the match.
//
// The question this answers is the one everybody asks at a bracket and nobody
// could answer from this page: who is actually playing, and what are they
// playing. It sat in the admin roster tab, three clicks away, for viewers who
// were never going to find it.
//
// Roles are shown as a pair because that is what they are — one on T, one on CT
// — and collapsing them to a single word would mean picking a side to be
// truthful about.

export type PanelPlayer = {
  steamId: string;
  name: string;
  isCaptain: boolean;
  isBot: boolean;
  roleT: string | null;
  roleCt: string | null;
  /** Set during the draft: this player has answered. */
  picked?: boolean;
  /** Set during the draft: it is this player's turn. */
  onClock?: boolean;
};

export default function TeamPanel({
  name,
  tag,
  players,
  side,
  score,
  ready,
  /** Highlights the whole panel — whose turn it is in the veto or the draft. */
  active = false,
}: {
  name: string;
  tag?: string | null;
  players: PanelPlayer[];
  /** Which edge it sits on, which is all this changes visually. */
  side: "left" | "right";
  score?: number | null;
  /** Ready-up state, before anything has started. Undefined hides the tag. */
  ready?: boolean;
  active?: boolean;
}) {
  const { t } = useI18n();

  return (
    <aside className={`tp tp-${side} ${active ? "on" : ""}`}>
      <header className="tp-head">
        <div className="tp-id">
          {tag && <span className="tp-tag">{tag}</span>}
          <h4 className="tp-name">{name}</h4>
        </div>

        {score !== undefined && score !== null && <span className="tp-score num">{score}</span>}
      </header>

      {ready !== undefined && (
        <p className={`tp-ready ${ready ? "on" : ""}`}>
          {ready ? t("veto.ready") : t("veto.notReady")}
        </p>
      )}

      {players.length === 0 ? (
        <p className="muted tp-empty">{t("tournaments.noPlayers")}</p>
      ) : (
        <ul className="tp-players">
          {players.map((p) => (
            <li
              key={p.steamId}
              className={`tp-player ${p.onClock ? "clock" : ""} ${p.picked === false ? "waiting" : ""}`}
            >
              <a className="tp-player-name" href={`/players/${p.steamId}`}>
                {p.name}
              </a>

              {p.isCaptain && (
                <span className="tp-cap" title={t("scoreboard.captain")} aria-label={t("scoreboard.captain")}>
                  ★
                </span>
              )}

              {p.isBot && <span className="tp-bot">{t("scoreboard.bot")}</span>}

              {/* An em dash rather than an empty cell, so a roleless player reads
                  as "not chosen yet" rather than as a rendering fault. */}
              <span className="tp-roles">
                <span className="tp-role" title={t("scoreboard.roleT")}>
                  {roleLabel(p.roleT) || "—"}
                </span>
                <span className="tp-role-sep">/</span>
                <span className="tp-role" title={t("scoreboard.roleCt")}>
                  {roleLabel(p.roleCt) || "—"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
