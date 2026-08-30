"use client";

import { useI18n } from "@/components/I18nProvider";
import { RolePair } from "./RoleIcon";
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
  /** Whoever is reading, so they can find themselves on the roster. */
  mySteamId = null,
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
  mySteamId?: string | null;
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
              className={`tp-player ${p.onClock ? "clock" : ""} ${p.picked === false ? "waiting" : ""} ${
                mySteamId && p.steamId === mySteamId ? "me" : ""
              }`}
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

              {/* Marks, not words. Two role names per player across ten players
                  is more text than the names themselves, and it pushed the
                  panel wide enough to squeeze the board it sits beside. The
                  legend on the page is what makes them readable; the em dash
                  inside a mark is "not chosen yet" rather than a failed draw. */}
              <span className="tp-roles">
                <RolePair roleT={p.roleT} roleCt={p.roleCt} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
