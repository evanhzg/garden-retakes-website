"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { formatRemaining } from "@/lib/tournament/edition";
import type { DraftTurn, RoleDef } from "@/lib/tournament/roles";
import RoleIcon from "./RoleIcon";
import "./roledraft.css";

// The role draft: the step between ready-up and the veto.
//
// Polled on the same two-second beat as the veto board, for the same reasons —
// the deadline is stored server-side, the GET advances an expired turn, so
// polling IS the clock's enforcement and no viewer can be left looking at a
// draft that has silently moved on.
//
// A turn settles both of a player's roles at once. Roles are per side, sides
// swap at halftime, and asking somebody to take two turns to describe one job
// would double the length of the draft for no information. The two columns are
// the whole of the interface.

export type DraftWire = {
  started: boolean;
  deadline: string | null;
  turnSeconds: number;
  firstTeamId: number | null;
  teamIdOf: { A: number | null; B: number | null };
  rosters: {
    A: DraftPlayer[];
    B: DraftPlayer[];
  };
  roles: { T: RoleDef[]; CT: RoleDef[] };
  available: {
    A: { T: RoleDef[]; CT: RoleDef[] };
    B: { T: RoleDef[]; CT: RoleDef[] };
  };
  state: {
    next: DraftTurn | null;
    done: boolean;
    order: DraftTurn[];
    taken: { A: { T: string[]; CT: string[] }; B: { T: string[]; CT: string[] } };
  };
};

export type DraftPlayer = {
  steamId: string;
  name: string;
  isCaptain: boolean;
  isBot: boolean;
  roleT: string | null;
  roleCt: string | null;
  picked: boolean;
  wasAuto: boolean;
  drafting: boolean;
};

export default function RoleDraft({
  matchId,
  wire,
  reload,
  /** The signed-in SteamID, or null. */
  mySteamId,
  /** Whether this viewer captains the team currently on the clock. */
  canActForTurn,
  isOrganizer,
  adminKey,
  /**
   * Tells the parent that a local change is happening now, so a poll already
   * in flight cannot land on top of it. Optional, so this component still
   * renders in isolation.
   */
  beginChange = () => {},
}: {
  matchId: number;
  wire: DraftWire;
  reload: () => void | Promise<void>;
  beginChange?: () => void;
  mySteamId: string | null;
  canActForTurn: boolean;
  isOrganizer: boolean;
  adminKey?: string;
}) {
  const { t } = useI18n();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Separate from the poll so the countdown moves every second rather than in
  // two-second jumps.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const turn = wire.state.next;

  const [wantT, setWantT] = useState<string | null>(null);
  const [wantCt, setWantCt] = useState<string | null>(null);

  /**
   * A pick that has been sent and not yet come back.
   *
   * Held so the board can show it as done the instant it is pressed. Cleared
   * when the server's own answer arrives carrying it — or immediately, if the
   * server refuses, because a refusal means it never happened.
   */
  const [pending, setPending] = useState<{
    steamId: string;
    roleT: string | null;
    roleCt: string | null;
  } | null>(null);

  // A new player on the clock clears the half-made choice belonging to the
  // previous one, which would otherwise be submitted for the wrong person.
  useEffect(() => {
    setWantT(null);
    setWantCt(null);
  }, [turn?.steamId]);

  // The real answer has landed and includes the pick, so the stand-in is no
  // longer needed. Comparing against the roster rather than clearing on any
  // reload matters: a reload that arrives BEFORE the write is visible would
  // otherwise drop the optimistic paint and flash the turn back.
  useEffect(() => {
    if (!pending) return;
    const player = [...wire.rosters.A, ...wire.rosters.B].find((p) => p.steamId === pending.steamId);
    if (player?.picked) setPending(null);
  }, [wire, pending]);

  /**
   * The board moves on the click, not on the round trip.
   *
   * A role pick used to POST, wait, and then reload — two to three seconds on
   * a thirty-second clock, during which the board still showed your own turn
   * and the roles you had just chosen sitting unconfirmed. It read as a button
   * that had not worked, so people pressed it again.
   *
   * `beginChange` tells the parent that anything it asked for before now is
   * out of date. Without it a poll already in flight lands after this and puts
   * the turn back — the same race that was undoing map bans.
   */
  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setNotice(null);
      beginChange();

      // Paint the pick immediately, and only for a real pick: the two admin
      // actions rewrite the whole board and there is nothing honest to guess.
      const optimistic = body.action === "pick" && typeof body.steamId === "string";
      if (optimistic) setPending({ steamId: body.steamId as string, roleT: wantT, roleCt: wantCt });

      try {
        const res = await fetch("/api/tournament/roles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, matchId, key: adminKey }),
        });
        const data = await res.json();
        if (data.error) {
          setNotice(data.error);
          setPending(null);
        }
        await reload();
      } catch (err) {
        setNotice(String(err));
        setPending(null);
      } finally {
        setBusy(false);
      }
    },
    [matchId, adminKey, reload, beginChange, wantT, wantCt],
  );

  const msLeft = wire.deadline ? Math.max(0, new Date(wire.deadline).getTime() - now) : 0;

  const onClockPlayer = turn
    ? [...wire.rosters.A, ...wire.rosters.B].find((p) => p.steamId === turn.steamId) ?? null
    : null;

  // Mine when it is my own turn, or when I captain the team on the clock, or I
  // run the tournament. The server checks all three again.
  const mine =
    turn !== null && (isOrganizer || canActForTurn || mySteamId === turn.steamId);

  const availT = turn ? wire.available[turn.team].T : [];
  const availCt = turn ? wire.available[turn.team].CT : [];

  if (wire.state.done) {
    return <p className="muted rd-lead">{t("roledraft.done")}</p>;
  }

  return (
    <div className="rd">
      {notice && <p className="rd-notice">{notice}</p>}

      <div className="rd-turn">
        <span className="rd-turn-who">{onClockPlayer?.name ?? "—"}</span>
        <span className="rd-turn-kind">{t("roledraft.toPick")}</span>

        <span className={`rd-clock num ${msLeft <= 10_000 ? "low" : ""}`}>
          {formatRemaining(msLeft)}
        </span>

        <div className="rd-bar" aria-hidden>
          <div
            className={`rd-bar-fill ${msLeft <= 10_000 ? "low" : ""}`}
            style={{ width: `${Math.min(100, (msLeft / (wire.turnSeconds * 1000)) * 100)}%` }}
          />
        </div>
      </div>

      {/* The order, so both teams can see what is coming rather than being
          surprised by their own turn. This is the part a League draft gets
          right and a spreadsheet does not. */}
      <ol className="rd-order">
        {wire.state.order.map((step) => {
          const player =
            [...wire.rosters.A, ...wire.rosters.B].find((p) => p.steamId === step.steamId) ?? null;
          // Ticked the moment it is sent, not when the server says so. The
          // "sent" class is what animates, so the step visibly lands under the
          // cursor instead of a second later.
          const sent = pending?.steamId === step.steamId;
          const done = (player?.picked ?? false) || sent;
          return (
            <li
              key={step.ordinal}
              className={`rd-step rd-team-${step.team.toLowerCase()} ${done ? "done" : ""} ${
                sent ? "sent" : ""
              } ${step.ordinal === turn?.ordinal && !sent ? "on" : ""}`}
            >
              <span className="rd-step-n num">{step.ordinal + 1}</span>
              <span className="rd-step-name">{player?.name ?? step.steamId}</span>
            </li>
          );
        })}
      </ol>

      <div className="rd-sides">
        <RoleColumn
          title={t("roledraft.tSide")}
          roles={wire.roles.T}
          available={availT}
          chosen={wantT}
          disabled={busy || !mine}
          onPick={setWantT}
        />
        <RoleColumn
          title={t("roledraft.ctSide")}
          roles={wire.roles.CT}
          available={availCt}
          chosen={wantCt}
          disabled={busy || !mine}
          onPick={setWantCt}
        />
      </div>

      <div className="rd-actions">
        <button
          className="btn btn-primary"
          disabled={busy || !mine || !wantT || !wantCt || pending !== null}
          onClick={() => act({ action: "pick", steamId: turn?.steamId, roleT: wantT, roleCt: wantCt })}
        >
          {t("roledraft.confirm")}
        </button>

        {!mine && (
          <span className="muted">
            {t("roledraft.notYours", { player: onClockPlayer?.name ?? "" })}
          </span>
        )}

        {isOrganizer && (
          <>
            <button className="btn" disabled={busy} onClick={() => act({ action: "admin-auto" })}>
              {t("roledraft.autoAll")}
            </button>
            <button className="btn" disabled={busy} onClick={() => act({ action: "admin-skip" })}>
              {t("roledraft.skip")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function RoleColumn({
  title,
  roles,
  available,
  chosen,
  disabled,
  onPick,
}: {
  title: string;
  roles: RoleDef[];
  available: RoleDef[];
  chosen: string | null;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  const { t } = useI18n();
  const free = new Set(available.map((r) => r.id));

  return (
    <section className="rd-col">
      <h4 className="rd-col-head">{title}</h4>

      <div className="rd-roles">
        {roles.map((role) => {
          // Taken roles are shown struck through rather than hidden. A role that
          // vanishes reads as a bug; one that is struck through reads as the
          // rule it is, and shows the other team what has gone.
          const gone = !free.has(role.id);
          return (
            <button
              key={role.id}
              className={`rd-role ${chosen === role.id ? "on" : ""} ${gone ? "gone" : ""}`}
              disabled={disabled || gone}
              aria-pressed={chosen === role.id}
              onClick={() => onPick(role.id)}
            >
              {/* The mark AND the name here, unlike the panels. This is where
                  the two are learned together, and it is the one screen where
                  the name is the thing being chosen. */}
              <RoleIcon role={role.id} size={16} labelled={false} />
              <span className="rd-role-name">{role.label}</span>
              {role.unique && (
                <span className="rd-role-tag">
                  {gone ? t("roledraft.taken") : t("roledraft.unique")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
