"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import RetakesIcon from "@/components/retakes/RetakesIcon";
import { mapImage, mapName } from "@/lib/maps";

/**
 * What the plugin says is happening, loosely typed.
 *
 * The shape is decided by LiveMatchBroadcaster on the game server, not here,
 * and it will grow fields before this file hears about it. Reading the ones we
 * draw and ignoring the rest is what stops a new field on that side blanking
 * this tab on ours.
 */
type LivePlayer = {
  steamId?: string;
  name?: string;
  team?: number | string;
  kills?: number;
  deaths?: number;
  assists?: number;
  damage?: number;
  rating?: number;
  elo?: number;
};

type Live = {
  map?: string;
  mode?: string;
  teams?: { name?: string; score?: number; side?: string }[];
  score?: { t?: number; ct?: number };
  players?: LivePlayer[];
  round?: number;
  maxRounds?: number;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * The live scoreboard.
 *
 * What this replaces: a component that waited a second on a setTimeout and then
 * rendered two invented matches with Player1 through Player10 in them, with a
 * comment saying "Mocking fetch". It has been on this page long enough that
 * people could reasonably have believed it.
 *
 * Everything here comes from WebLiveMatches, which the game server writes every
 * three seconds. When nothing is being played there is nothing to draw, and it
 * says that instead.
 */
export default function LiveTab() {
  const { t } = useI18n();
  const [state, setState] = useState<{ live: Live | null; stale?: boolean; ageMs?: number } | null>(null);

  useEffect(() => {
    let active = true;

    const pull = () =>
      fetch("/api/match/live")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (active) setState(d ?? { live: null }); })
        .catch(() => { if (active) setState({ live: null }); });

    pull();
    // Matched to the broadcaster's own three seconds. Polling faster would
    // return the same row; slower and the scoreline visibly lags the game.
    const timer = setInterval(pull, 3000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  if (state === null) return <p className="muted rq-empty">{t("lobby.live.loading")}</p>;

  const live = state.live;
  if (!live) {
    return (
      <div className="rq-empty-state">
        <RetakesIcon id="live" size={44} />
        <h3>{t("lobby.live.emptyTitle")}</h3>
        <p className="muted">{t("lobby.live.emptyBody")}</p>
      </div>
    );
  }

  const teams = live.teams ?? [];
  const players = live.players ?? [];
  const byTeam = (index: number) =>
    players.filter((p) => {
      const raw = p.team;
      if (typeof raw === "number") return raw === index || raw === index + 2;
      return String(raw ?? "").toUpperCase() === (index === 0 ? "T" : "CT");
    });

  return (
    <div className="rq-live">
      <header className="rq-live-head">
        {live.map && <img src={mapImage(live.map)} alt="" className="rq-live-map" />}
        <div>
          <h3>{live.map ? mapName(live.map) : t("lobby.live.unknownMap")}</h3>
          <p className="muted">
            {live.mode ?? ""}
            {live.round ? ` · ${t("lobby.live.round", { n: live.round, max: live.maxRounds ?? "?" })}` : ""}
          </p>
        </div>
        <div className="rq-live-score">
          <span className="t">{num(teams[0]?.score ?? live.score?.t)}</span>
          <span className="sep">–</span>
          <span className="ct">{num(teams[1]?.score ?? live.score?.ct)}</span>
        </div>
        {state.stale && (
          <span className="rq-live-stale" title={t("lobby.live.staleHint")}>
            {t("lobby.live.stale")}
          </span>
        )}
      </header>

      <div className="rq-live-teams">
        {[0, 1].map((i) => (
          <div key={i} className={`rq-live-team side-${i === 0 ? "T" : "CT"}`}>
            <h4>{teams[i]?.name ?? t(`loadout.side.${i === 0 ? "T" : "CT"}`)}</h4>
            <table>
              <thead>
                <tr>
                  <th>{t("lobby.live.player")}</th>
                  <th>K</th>
                  <th>D</th>
                  <th>A</th>
                  <th>{t("lobby.live.damage")}</th>
                </tr>
              </thead>
              <tbody>
                {byTeam(i).map((p, n) => (
                  <tr key={p.steamId ?? `${i}-${n}`}>
                    <td>{p.name ?? p.steamId ?? "—"}</td>
                    <td>{num(p.kills)}</td>
                    <td>{num(p.deaths)}</td>
                    <td>{num(p.assists)}</td>
                    <td>{num(p.damage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
