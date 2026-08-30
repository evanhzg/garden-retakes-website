"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useI18n } from "@/components/I18nProvider";
import WeaponIcon, { BombIcon, DefuseIcon, HeadshotIcon } from "./WeaponIcon";
import "./killfeed.css";

type Who = { steamId: string; name: string | null; slot: string | null } | null;

type Entry = {
  id: number;
  kind: string;
  winnerSlot: string | null;
  reason: string | null;
  round: number;
  mapOrdinal: number;
  attacker: Who;
  victim: Who;
  assister: Who;
  weapon: string;
  headshot: boolean;
  teamKill: boolean;
  penetrated: boolean;
  noScope: boolean;
  throughSmoke: boolean;
  attackerBlind: boolean;
};

/** How many lines the panel keeps. */
const KEEP = 7;

/**
 * Faster than the rest of the page on purpose.
 *
 * A scoreboard that lags five seconds is a scoreboard; a feed that lags five
 * seconds is a list. The payload is a handful of rows and usually empty —
 * `after` means the steady state returns nothing at all.
 */
const POLL_MS = 1500;

/**
 * The match feed: kills, defuses and how each round ended.
 *
 * Nothing on the match page said what happened inside a round. The scoreboard
 * moves, but totals cannot tell you the AWP traded into a retake, and they
 * certainly cannot tell you a round was won on the defuse with two down — which
 * is the part anybody watching actually talks about.
 *
 * Three row shapes, one grid. Every row puts the actor on the left, the icon in
 * the middle and the subject on the right, in fixed columns, so the icons form
 * a straight line down the panel instead of sliding around with the length of
 * the names beside them.
 */
export default function KillFeed({
  matchId,
  live,
  teamA,
  teamB,
}: {
  matchId: number;
  live: boolean;
  /** Names, so a round line can say who took it rather than "A". */
  teamA: string;
  teamB: string;
}) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<Entry[]>([]);
  /** Highest id seen, so the poll asks only for what is new. */
  const cursor = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const url = `/api/tournament/killfeed?matchId=${matchId}` +
          (cursor.current === null ? "" : `&after=${cursor.current}`);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;

        const data: { kills: Entry[] } = await res.json();
        if (!alive || data.kills.length === 0) return;

        cursor.current = data.kills[data.kills.length - 1].id;
        // Appended and trimmed from the front: the newest line is at the
        // bottom, the way a feed in game reads.
        setEntries((prev) => [...prev, ...data.kills].slice(-KEEP));
      } catch {
        // A dropped poll costs one line's latency. Saying so on screen would be
        // noisier than the fault.
      }
    };

    load();

    // A finished match still loads once, so the last rounds are there to read
    // afterwards, but there is nothing left to poll for.
    if (!live) return () => { alive = false; };

    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [matchId, live]);

  if (entries.length === 0) return null;

  const name = (who: Who, slot?: string | null) => (
    <span className={`kf-name slot-${(who?.slot ?? slot ?? "none").toLowerCase()}`}>
      {who?.name ?? "—"}
    </span>
  );

  return (
    <section className="kf" aria-label={t("match.feed")}>
      <header className="kf-head">
        <h3>{t("match.feed")}</h3>
        {live && <span className="kf-live" aria-hidden="true" />}
      </header>

      <ul className="kf-list">
        <AnimatePresence initial={false}>
          {entries.map((e) => (
            <motion.li
              key={e.id}
              className={[
                "kf-row",
                `kind-${e.kind}`,
                e.teamKill ? "teamkill" : "",
              ].filter(Boolean).join(" ")}
              // Slides in from the side it is written towards, so a new line
              // reads as arriving rather than as the list jumping.
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              layout
            >
              {e.kind === "round" ? (
                <>
                  <span className="kf-left kf-round-label">
                    {t("match.feedRound", { n: String(e.round) })}
                  </span>
                  <span className="kf-mid">
                    {e.reason === "bomb" || e.reason === "defused"
                      ? (e.reason === "bomb" ? <BombIcon className="kf-weapon" /> : <DefuseIcon className="kf-weapon" />)
                      : <span className="kf-reason">{t(`match.feedReason.${e.reason ?? "elimination"}`)}</span>}
                  </span>
                  <span className="kf-right">
                    <span className={`kf-name slot-${(e.winnerSlot ?? "none").toLowerCase()}`}>
                      {e.winnerSlot === "A" ? teamA : e.winnerSlot === "B" ? teamB : "—"}
                    </span>
                  </span>
                </>
              ) : e.kind === "defuse" ? (
                <>
                  <span className="kf-left">{name(e.victim)}</span>
                  <span className="kf-mid">
                    <DefuseIcon className="kf-weapon" />
                  </span>
                  <span className="kf-right kf-verb">{t("match.feedDefused")}</span>
                </>
              ) : (
                <>
                  {/* The attacker, and nobody at all when the bomb or a fall did
                      it. An empty left column reads as "no killer", which is
                      what happened — naming it "world" invented a player who
                      does not exist and put them on a scoreboard nobody can
                      click. */}
                  <span className="kf-left">
                    {e.attacker ? name(e.attacker) : <span className="kf-nokiller" aria-hidden="true" />}
                    {e.assister && (
                      <span className="kf-assist">+ {name(e.assister)}</span>
                    )}
                  </span>

                  <span className="kf-mid">
                    {e.throughSmoke && <i className="kf-tag" title="through smoke">S</i>}
                    {e.penetrated && <i className="kf-tag" title="wallbang">W</i>}
                    {e.noScope && <i className="kf-tag" title="no scope">N</i>}
                    <WeaponIcon weapon={e.weapon} className="kf-weapon" />
                    {e.headshot && <HeadshotIcon className="kf-hs" />}
                  </span>

                  <span className="kf-right">{name(e.victim)}</span>
                </>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
