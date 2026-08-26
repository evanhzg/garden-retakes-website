"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { formatRemaining } from "@/lib/tournament/edition";
import "./veto.css";

// Ready-up, then the veto, on one board.
//
// Polled rather than pushed. A veto is a handful of clicks over a couple of
// minutes and the deadline is stored server-side, so a two-second poll is
// indistinguishable from a socket here — and it cannot get stuck in a state
// where one viewer's connection dropped and their bracket froze.
//
// The clock is computed from the SERVER's deadline, not from a local counter.
// A local one drifts, and two captains watching different numbers argue.

type VetoStateWire = {
  next: { team: "A" | "B"; kind: "ban" | "pick" | "side" } | null;
  remaining: string[];
  picked: { map: string; pickedBy: "A" | "B" | null; startSideTeamA: string | null }[];
  done: boolean;
};

type Wire = {
  started: boolean;
  readyA: boolean;
  readyB: boolean;
  deadline: string | null;
  turnSeconds: number;
  pool: string[];
  state: VetoStateWire;
};

export default function VetoBoard({
  matchId,
  teamA,
  teamB,
  mySlot,
  isOrganizer,
  adminKey,
}: {
  matchId: number;
  teamA: string;
  teamB: string;
  /** Which side this viewer captains, if either. */
  mySlot: "A" | "B" | null;
  isOrganizer: boolean;
  adminKey?: string;
}) {
  const { t } = useI18n();

  const [wire, setWire] = useState<Wire | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournament/veto?matchId=${matchId}`, { cache: "no-store" });
      if (res.ok) setWire(await res.json());
    } catch {
      // A dropped poll is a stale board, not a broken one; the next one fixes
      // it. Saying so on screen would be noisier than the fault.
    }
  }, [matchId]);

  useEffect(() => {
    load();
    // Two seconds: fast enough that a ban appears while the other captain is
    // still looking at it, slow enough to be free. The GET also advances an
    // expired turn, so polling IS the clock's enforcement.
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [load]);

  // Separate from the poll so the countdown moves every second rather than in
  // two-second jumps.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch("/api/tournament/veto", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, matchId, key: adminKey }),
        });
        const data = await res.json();
        if (data.error) setNotice(data.error);
        await load();
      } catch (err) {
        setNotice(String(err));
      } finally {
        setBusy(false);
      }
    },
    [matchId, adminKey, load],
  );

  if (!wire) return <p className="muted">{t("veto.loading")}</p>;

  const msLeft = wire.deadline ? Math.max(0, new Date(wire.deadline).getTime() - now) : 0;
  const myTurn = wire.state.next !== null && (mySlot === wire.state.next.team || isOrganizer);
  const turnName = wire.state.next?.team === "A" ? teamA : teamB;

  // ------------------------------------------------------------ ready-up
  if (!wire.started) {
    return (
      <div className="vt">
        {notice && <p className="vt-notice">{notice}</p>}

        <p className="vt-lead">{t("veto.waiting")}</p>

        <div className="vt-ready">
          {(["A", "B"] as const).map((slot) => {
            const ready = slot === "A" ? wire.readyA : wire.readyB;
            const name = slot === "A" ? teamA : teamB;
            return (
              <div key={slot} className={`vt-side ${ready ? "on" : ""}`}>
                <strong>{name}</strong>
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
            <button className="btn btn-primary" disabled={busy} onClick={() => act({ action: "start-veto" })}>
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
              className={`vt-bar-fill ${msLeft <= 10_000 ? "low" : ""}`}
              style={{ width: `${Math.min(100, (msLeft / (wire.turnSeconds * 1000)) * 100)}%` }}
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
            const gone = !wire.state.remaining.includes(map);
            const picked = wire.state.picked.find((p) => p.map === map);
            return (
              <button
                key={map}
                className={`vt-map ${gone ? (picked ? "picked" : "banned") : ""}`}
                disabled={busy || gone || !myTurn || wire.state.done}
                onClick={() => act({ action: wire.state.next?.kind ?? "ban", map })}
              >
                <span className="vt-map-name">{map.replace(/^de_/, "")}</span>
                {picked && <span className="vt-map-tag">{t("veto.picked")}</span>}
                {gone && !picked && <span className="vt-map-tag">{t("veto.banned")}</span>}
              </button>
            );
          })}
        </div>
      )}

      {!myTurn && !wire.state.done && (
        <p className="muted vt-hint">{t("veto.notYourTurn", { team: turnName ?? "" })}</p>
      )}
    </div>
  );
}
