"use client";

import { useEffect, useState } from "react";
import { useSocket } from "@/components/SocketProvider";
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
  SteamId?: string;
  Name?: string;
  /** "A"/"B" in a competitive match, the raw team number otherwise. */
  Team?: string;
  /** 2 = T, 3 = CT. The reliable one for a bot, which has no roster. */
  TeamNum?: number;
  IsBot?: boolean;
  Kills?: number;
  Deaths?: number;
  Assists?: number;
  Damage?: number;
  Elo?: number;
};

type Live = {
  Map?: string;
  Mode?: string;
  IsCr?: boolean;
  IsRanked?: boolean;
  TeamAName?: string;
  TeamBName?: string;
  ScoreA?: number;
  ScoreB?: number;
  WinPredictionA?: string;
  WinPredictionB?: string;
  Players?: LivePlayer[];
  HeadToHead?: { KillerName?: string; VictimName?: string; Kills?: number }[];
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
  const { socket } = useSocket();
  const [state, setState] = useState<{ live: Live | null; stale?: boolean; ageMs?: number } | null>(null);

  /**
   * Two sources for one scoreline, and that is on purpose.
   *
   * The game server pushes over the socket as things happen, and writes the
   * same payload into WebLiveMatches every three seconds regardless. The socket
   * is the fast path; the row is the one that still works when the plugin's
   * connection is down, the socket server restarted, or this tab was opened
   * before any round ended. Polling continues either way at a rate that costs
   * nothing, and whichever arrives last wins — they are the same object.
   */
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

  useEffect(() => {
    if (!socket) return;

    const onLive = (payload: { state?: Live; at?: number } | null) => {
      if (!payload?.state) return;
      setState({ live: payload.state, stale: false, ageMs: 0 });
    };

    socket.on("rq:live:state", onLive);
    // Whatever the server last said, for a tab that opened mid-match.
    socket.emit("rq:live:get");

    return () => { socket.off("rq:live:state", onLive); };
  }, [socket]);

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

  const players = live.Players ?? [];

  /**
   * Who is on which side.
   *
   * A competitive match labels people by roster ("A"/"B"); everything else, and
   * every bot, carries the engine's team number instead. Both are read, because
   * a testing match has one of each on the same scoreboard.
   */
  const byTeam = (index: number) => {
    const roster = index === 0 ? "A" : "B";
    const teamNum = index === 0 ? 2 : 3;
    return players.filter((p) =>
      p.Team === roster || num(p.TeamNum) === teamNum
    );
  };

  return (
    <div className="rq-live">
      <header className="rq-live-head">
        {live.Map && <img src={mapImage(live.Map)} alt="" className="rq-live-map" />}
        <div>
          <h3>{live.Map ? mapName(live.Map) : t("lobby.live.unknownMap")}</h3>
          <p className="muted">{live.Mode ?? ""}</p>
        </div>
        <div className="rq-live-score">
          <span className="t">{num(live.ScoreA)}</span>
          <span className="sep">–</span>
          <span className="ct">{num(live.ScoreB)}</span>
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
            <h4>
              {(i === 0 ? live.TeamAName : live.TeamBName) ||
                t(`loadout.side.${i === 0 ? "T" : "CT"}`)}
            </h4>
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
                  <tr key={p.SteamId && p.SteamId !== "0" ? p.SteamId : `${i}-${n}`}>
                    <td>
                      {p.Name ?? p.SteamId ?? "—"}
                      {p.IsBot && <span className="rq-live-bot">{t("lobby.live.bot")}</span>}
                    </td>
                    <td>{num(p.Kills)}</td>
                    <td>{num(p.Deaths)}</td>
                    <td>{num(p.Assists)}</td>
                    <td>{num(p.Damage)}</td>
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
