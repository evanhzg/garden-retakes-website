"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import RoleDraft, { type DraftWire } from "./RoleDraft";
import VetoBoard, { type VetoWire } from "./VetoBoard";
import Scoreboard from "./Scoreboard";
import KillFeed from "./KillFeed";
import RoomChat from "./RoomChat";
import TeamPanel, { type PanelPlayer } from "./TeamPanel";
import type { Scoreboard as Board } from "@/lib/tournament/scoreboard";
import "./teampanel.css";

// One match, as the four things it is in turn: ready-up, the role draft, the
// veto, and the match itself.
//
// It exists because those used to be four different places. The bracket said
// "veto"; the veto board said "the veto is finished" and then sat there for
// ever; the maps and the scores were a separate table further down that nobody
// scrolled to. A veto that ends is a match that starts, and the page should say
// so without anybody reloading it.
//
// One poller for all of it. Two components each fetching their own state would
// disagree about which stage the match was in for a second or two every time it
// changed, and "for a second or two every time it changed" is the whole of what
// a viewer sees.

type Team = { id: number | null; name: string; tag: string | null };

export type Stage = "roles" | "veto" | "match";

export default function MatchStage({
  matchId,
  teamA,
  teamB,
  mySlot,
  mySteamId,
  isOrganizer,
  adminKey,
  initialBoard,
  /** True once the maps are decided, so the first paint is already right. */
  initialDecided,
}: {
  matchId: number;
  teamA: Team;
  teamB: Team;
  mySlot: "A" | "B" | null;
  mySteamId: string | null;
  isOrganizer: boolean;
  adminKey?: string;
  initialBoard: Board;
  initialDecided: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [veto, setVeto] = useState<VetoWire | null>(null);
  const [draft, setDraft] = useState<DraftWire | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Whether the maps are settled. Seeded from the server so a link to a decided
  // match renders the scoreboard rather than a flash of the veto board.
  const [decided, setDecided] = useState(initialDecided);

  const load = useCallback(async () => {
    try {
      const [v, d] = await Promise.all([
        fetch(`/api/tournament/veto?matchId=${matchId}`, { cache: "no-store" }),
        fetch(`/api/tournament/roles?matchId=${matchId}`, { cache: "no-store" }),
      ]);

      if (v.ok) {
        const wire: VetoWire = await v.json();
        setVeto(wire);
        if (wire.state.done) setDecided(true);
      }

      if (d.ok) setDraft(await d.json());
    } catch {
      // A dropped poll is a stale board, not a broken one; the next one fixes
      // it. Saying so on screen would be noisier than the fault.
    }
  }, [matchId]);

  // Stop polling once the maps are settled. From then on the only thing that
  // moves is the scoreboard, which polls for itself on a slower beat.
  useEffect(() => {
    load();
    if (decided) return;

    // Two seconds: fast enough that a ban appears while the other captain is
    // still looking at it, slow enough to be free. Both GETs also advance an
    // expired turn, so polling IS the clock's enforcement.
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [load, decided]);

  // The moment the veto finishes, ask the server for the page again. The maps,
  // the sides and the first scoreboard are all server-rendered, and without
  // this they would arrive whenever somebody happened to reload.
  const refreshed = useRef(initialDecided);
  useEffect(() => {
    if (decided && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [decided, router]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setNotice(null);

      /**
       * The tile flips now, not after the round trip.
       *
       * A ban took two to three seconds to show, which on a thirty-second clock
       * reads as a board that ignored you — so people clicked again. The server
       * is still the authority and the next poll reconciles; this only removes
       * the wait between pressing and seeing.
       *
       * Kept so it can be rolled back: if the server refuses, the optimistic
       * state has to go away rather than sit there looking accepted.
       */
      const rollback = veto;
      const kind = body.action;
      const map = typeof body.map === "string" ? body.map : null;

      if (veto && map && (kind === "ban" || kind === "pick")) {
        setVeto({
          ...veto,
          state: {
            ...veto.state,
            remaining: veto.state.remaining.filter((m) => m !== map),
            picked:
              kind === "pick"
                ? [...veto.state.picked, { map, pickedBy: veto.state.next?.team ?? null, startSideTeamA: null }]
                : veto.state.picked,
            // The turn is cleared rather than advanced: working out whose turn
            // is next means re-deriving the sequence, and the poll a moment
            // later knows the real answer. Blank for an instant is honest;
            // guessing wrong and correcting is not.
            next: null,
          },
          actions: [
            ...veto.actions,
            {
              ordinal: veto.actions.length,
              team: veto.state.next?.team ?? null,
              kind,
              map,
              side: null,
              wasAuto: false,
            },
          ],
        });
      }

      try {
        const res = await fetch("/api/tournament/veto", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, matchId, key: adminKey }),
        });
        const data = await res.json();

        if (data.error) {
          setNotice(data.error);
          if (rollback) setVeto(rollback);
        }

        await load();
      } catch (err) {
        setNotice(String(err));
        if (rollback) setVeto(rollback);
      } finally {
        setBusy(false);
      }
    },
    [matchId, adminKey, load, veto],
  );

  const stage: Stage = useMemo(() => {
    if (decided) return "match";
    if (draft?.started && !draft.state.done && !veto?.started) return "roles";
    return "veto";
  }, [decided, draft, veto]);

  // The panels are drawn from the roles payload, which carries both rosters
  // with their roles attached — so there is one answer to "who is playing what"
  // rather than one per stage.
  const panelFor = useCallback(
    (slot: "A" | "B"): PanelPlayer[] => {
      if (!draft) return [];

      const key = draft.teamIdOf.A === (slot === "A" ? teamA.id : teamB.id) ? "A" : "B";
      const onClock = draft.state.next?.steamId ?? null;

      return draft.rosters[key].map((p) => ({
        steamId: p.steamId,
        name: p.name,
        isCaptain: p.isCaptain,
        isBot: p.isBot,
        roleT: p.roleT,
        roleCt: p.roleCt,
        picked: p.picked,
        onClock: stage === "roles" && p.steamId === onClock,
      }));
    },
    [draft, teamA.id, teamB.id, stage],
  );

  // Which panel is highlighted: the team on the clock, in whichever of the two
  // stages has a clock.
  const activeSlot: "A" | "B" | null = useMemo(() => {
    if (stage === "veto") return veto?.state.next?.team ?? null;

    if (stage === "roles" && draft?.state.next) {
      const teamId = draft.teamIdOf[draft.state.next.team];
      return teamId === teamA.id ? "A" : teamId === teamB.id ? "B" : null;
    }

    return null;
  }, [stage, veto, draft, teamA.id, teamB.id]);

  // Whether this viewer may answer the draft turn on the clock — they captain
  // that team. The server checks it again; this only decides whether the
  // buttons are live.
  const canActForTurn = useMemo(() => {
    if (!draft?.state.next || !mySlot) return false;

    const teamId = draft.teamIdOf[draft.state.next.team];
    return teamId === (mySlot === "A" ? teamA.id : teamB.id);
  }, [draft, mySlot, teamA.id, teamB.id]);

  return (
    <div className={`tp-frame ${stage === "match" ? "with-room" : ""}`}>
      <TeamPanel
        name={teamA.name}
        tag={teamA.tag}
        side="left"
        players={panelFor("A")}
        mySteamId={mySteamId}
        active={activeSlot === "A"}
        score={stage === "match" ? initialBoard.scoreA : undefined}
        ready={stage === "veto" && !veto?.started ? veto?.readyA : undefined}
      />

      <div className="tp-frame-main">
        {/* One heading that says which of the four things this is. The panel
            used to be titled "Maps" throughout, including while it was showing
            ready-up buttons. */}
        {/* No heading on the match stage.
            "Stats" described neither of the two things under it, and unlike the
            other three stages this one does not need announcing: a scoreboard
            and a feed are self-evidently a scoreboard and a feed. */}
        {stage !== "match" && (
          <h3 className="tp-stage-head">
            {stage === "roles" && t("roledraft.title")}
            {stage === "veto" && t("match.veto")}
          </h3>
        )}

        {stage === "roles" && <p className="muted tp-stage-lead">{t("roledraft.lead")}</p>}

        {stage === "roles" && draft && (
          <RoleDraft
            matchId={matchId}
            wire={draft}
            reload={load}
            mySteamId={mySteamId}
            canActForTurn={canActForTurn}
            isOrganizer={isOrganizer}
            adminKey={adminKey}
          />
        )}

        {stage === "veto" &&
          (veto ? (
            <VetoBoard
              wire={veto}
              teamA={teamA.name}
              teamB={teamB.name}
              mySlot={mySlot}
              isOrganizer={isOrganizer}
              act={act}
              busy={busy}
              notice={notice}
            />
          ) : (
            <p className="muted">{t("veto.loading")}</p>
          ))}

        {stage === "match" && (
          <>
            {/* Above the scoreboard, and centred.

                The feed is what is happening; the scoreboard is what has
                happened. Under the table it was below the fold on a laptop for
                the whole of a live match — the one time anybody wants it — and
                a narrow panel left-aligned under a wide table reads as
                something that failed to fill its space rather than as something
                deliberately small. */}
            <KillFeed
              matchId={matchId}
              // "live" is per tab on the board, not a property of the match, so
              // it is derived: any map still being played means the feed has
              // something to poll for. A finished match still loads once, so the
              // last rounds can be read afterwards.
              live={initialBoard.tabs.some((tab) => tab.live)}
              teamA={teamA.name}
              teamB={teamB.name}
            />

            <Scoreboard initial={initialBoard} />
          </>
        )}
      </div>

      <TeamPanel
        name={teamB.name}
        tag={teamB.tag}
        side="right"
        players={panelFor("B")}
        mySteamId={mySteamId}
        active={activeSlot === "B"}
        score={stage === "match" ? initialBoard.scoreB : undefined}
        ready={stage === "veto" && !veto?.started ? veto?.readyB : undefined}
      />

      {/* The room, to the right of everything else.

          Only once there is a match to talk about. During the role draft and
          the veto the page is a sequence of turns with its own instructions,
          and a chat column beside them is somewhere for two captains to argue
          about a decision the interface is already making for them. */}
      {stage === "match" && <RoomChat matchId={matchId} />}
    </div>
  );
}
