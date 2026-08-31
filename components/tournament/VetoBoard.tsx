"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { formatRemaining } from "@/lib/tournament/edition";
import "./veto.css";

// The veto board.
//
// Controlled rather than self-polling. It used to fetch its own state on a
// two-second timer, which was right when it was the only live thing on the
// page; now the ready-up, the role draft, the veto and the scoreboard are four
// stages of one screen, and four independent pollers would fight over which of
// them got to decide what stage the match is in. MatchStage owns the poll and
// hands the answer down.
//
// What changed beyond that is what the board SHOWS. It could say which maps had
// gone and not who took them or in what order — which is precisely the thing a
// veto gets argued about afterwards, and the reason the actions are a table.
// Bans read red, picks read green, and the order is on the face of the tile.

export type VetoStateWire = {
  next: { team: "A" | "B"; kind: "ban" | "pick" | "side" } | null;
  remaining: string[];
  picked: {
    map: string;
    pickedBy: "A" | "B" | null;
    startSideTeamA: string | null;
    isDecider?: boolean;
  }[];
  done: boolean;
};

export type VetoAction = {
  ordinal: number;
  team: "A" | "B" | null;
  kind: "ban" | "pick" | "side";
  map: string | null;
  side: "T" | "CT" | null;
  wasAuto: boolean;
};

export type VetoWire = {
  started: boolean;
  readyA: boolean;
  readyB: boolean;
  deadline: string | null;
  turnSeconds: number;
  pool: string[];
  state: VetoStateWire;
  actions: VetoAction[];
};

export default function VetoBoard({
  wire,
  teamA,
  teamB,
  mySlot,
  isOrganizer,
  hasBots = false,
  act,
  busy,
  notice,
}: {
  wire: VetoWire;
  teamA: string;
  teamB: string;
  /** Which side this viewer captains, if either. */
  mySlot: "A" | "B" | null;
  isOrganizer: boolean;
  /**
   * Whether either roster has a bot in it.
   *
   * The only thing it decides is whether an organizer is offered the
   * skip-the-veto strip. A bot cannot object to a map, so a veto against one is
   * a countdown nobody is participating in — an admin testing something should
   * be able to say "play Mirage" and be done.
   */
  hasBots?: boolean;
  act: (body: Record<string, unknown>) => void | Promise<void>;
  busy: boolean;
  notice: string | null;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  // Whether a real deadline has been seen yet.
  //
  // Without this the bar animates up from zero at the start of every turn: the
  // width comes from a countdown the component only learns on its first tick,
  // so frame one is an empty bar growing — which reads as time ELAPSED on a
  // control whose whole job is to show time LEFT.
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (wire.deadline) setSeeded(true);
  }, [wire.deadline]);

  // A second timer purely for the countdown, so it moves every second rather
  // than in whatever jumps the poll happens to arrive in.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const msLeft = wire.deadline ? Math.max(0, new Date(wire.deadline).getTime() - now) : 0;
  const myTurn = wire.state.next !== null && (mySlot === wire.state.next.team || isOrganizer);
  const turnName = wire.state.next?.team === "A" ? teamA : teamB;
  const nameOf = (slot: "A" | "B" | null) => (slot === "A" ? teamA : slot === "B" ? teamB : "");

  // What happened to each map, by name. Built once from the actions rather than
  // searched per tile, so a nine-map pool is nine lookups and not eighty-one.
  const fate = new Map<string, VetoAction>();
  for (const action of wire.actions) {
    if (action.map && (action.kind === "ban" || action.kind === "pick")) {
      fate.set(action.map, action);
    }
  }

  // ------------------------------------------------------------ ready-up
  if (!wire.started) {
    return (
      <div className="vt">
        {notice && <p className="vt-notice">{notice}</p>}

        <p className="vt-lead">{t("veto.waiting")}</p>

        <div className="vt-ready">
          {(["A", "B"] as const).map((slot) => {
            const ready = slot === "A" ? wire.readyA : wire.readyB;
            return (
              <div key={slot} className={`vt-side ${ready ? "on" : ""}`}>
                <strong>{nameOf(slot)}</strong>
                <span>{ready ? t("veto.ready") : t("veto.notReady")}</span>

                {mySlot === slot && (
                  <button
                    className={`btn ${ready ? "btn-secondary" : "btn-primary"}`}
                    disabled={busy}
                    onClick={() => act({ action: ready ? "unready" : "ready" })}
                  >
                    {ready ? t("veto.unready") : t("veto.readyUp")}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isOrganizer && (
          <div className="vt-force">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => act({ action: "start-veto" })}
            >
              {t("veto.forceStart")}
            </button>
            <span className="muted">{t("veto.forceHint")}</span>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- veto
  return (
    <div className="vt">
      {notice && <p className="vt-notice">{notice}</p>}

      {wire.state.done ? (
        <p className="vt-lead vt-done">{t("veto.done")}</p>
      ) : (
        <div className="vt-turn">
          <span className="vt-turn-team">{turnName}</span>
          <span className="vt-turn-kind">
            {wire.state.next?.kind === "ban" && t("veto.toBan")}
            {wire.state.next?.kind === "pick" && t("veto.toPick")}
            {wire.state.next?.kind === "side" && t("veto.toSide")}
          </span>

          {/* Red under ten seconds. The bar is the honest one — the number is
              easy to miss while reading map names. */}
          <span className={`vt-clock num ${msLeft <= 10_000 ? "low" : ""}`}>
            {formatRemaining(msLeft)}
          </span>

          <div className="vt-bar" aria-hidden>
            <div
              className={`vt-bar-fill ${msLeft <= 10_000 ? "low" : ""} ${seeded ? "" : "seeding"}`}
              style={{
                // Full until a deadline is known, so the first frame is a full
                // bar rather than an empty one filling.
                width: wire.deadline
                  ? `${Math.min(100, (msLeft / (wire.turnSeconds * 1000)) * 100)}%`
                  : "100%",
              }}
            />
          </div>
        </div>
      )}

      {wire.state.next?.kind === "side" ? (
        <div className="vt-sides">
          {(["T", "CT"] as const).map((side) => (
            <button
              key={side}
              className="btn btn-primary vt-side-btn"
              disabled={busy || !myTurn}
              onClick={() => act({ action: "side", side })}
            >
              {t("veto.start")} {side}
            </button>
          ))}
        </div>
      ) : (
        <div className="vt-maps">
          {wire.pool.map((map) => {
            const action = fate.get(map);
            const gone = !wire.state.remaining.includes(map);
            const kind = action?.kind ?? (gone ? "ban" : null);

            return (
              <button
                key={map}
                className={`vt-map ${kind === "pick" ? "picked" : ""} ${kind === "ban" ? "banned" : ""}`}
                disabled={busy || gone || !myTurn || wire.state.done}
                onClick={() => act({ action: wire.state.next?.kind ?? "ban", map })}
              >
                <span className="vt-map-name">{map.replace(/^de_/, "")}</span>

                {action && (
                  <>
                    {/* Who, and when. Both matter: "Cobras banned it" answers a
                        different argument from "it went third". */}
                    <span className="vt-map-tag">
                      {kind === "pick" ? t("veto.picked") : t("veto.banned")}
                    </span>
                    <span className="vt-map-by">
                      <span className="vt-map-ord num">{action.ordinal + 1}</span>
                      {nameOf(action.team)}
                      {action.wasAuto && <em className="vt-map-auto">{t("veto.auto")}</em>}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* The decider is nobody's pick, so it never appears in the action list
          and would otherwise be the one map on the board with no explanation. */}
      {wire.state.picked.some((p) => p.isDecider) && (
        <p className="vt-decider">
          {t("veto.decider", {
            map: (wire.state.picked.find((p) => p.isDecider)?.map ?? "").replace(/^de_/, ""),
          })}
        </p>
      )}

      {!myTurn && !wire.state.done && (
        <p className="muted vt-hint">{t("veto.notYourTurn", { team: turnName ?? "" })}</p>
      )}

      {/* Skip the whole thing and name the map.

          Organizers only, and only when a bot is playing. A bot has no opinion
          about a map, so a veto against one is a countdown with nobody on the
          other end of it — an admin testing something waits out three bans to
          reach a map they could have named. Against humans the veto is the
          point and this stays hidden, which is why it is gated on the rosters
          rather than on being an admin.

          One map, because a bot match is a BO1. admin-set-maps takes the whole
          series and would happily take three; offering that here would be a
          second way to build a series that disagrees with the bracket's. */}
      {isOrganizer && hasBots && !wire.state.done && (
        <div className="vt-skip">
          <span className="vt-skip-label">{t("veto.skipWithBots")}</span>

          <div className="vt-skip-maps">
            {wire.pool.map((map) => (
              <button
                key={map}
                className="vt-skip-map"
                disabled={busy}
                onClick={() => act({ action: "admin-set-maps", maps: [{ map }] })}
              >
                {map.replace(/^de_/, "")}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
