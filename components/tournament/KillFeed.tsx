"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useI18n } from "@/components/I18nProvider";
import WeaponIcon, { HeadshotIcon } from "./WeaponIcon";
import "./killfeed.css";

type Who = { steamId: string; name: string | null; slot: string | null } | null;

type Kill = {
  id: number;
  round: number;
  mapOrdinal: number;
  attacker: Who;
  victim: NonNullable<Who>;
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
const KEEP = 6;

/**
 * Faster than the rest of the page on purpose.
 *
 * A scoreboard that lags five seconds is a scoreboard; a killfeed that lags
 * five seconds is a list. The payload is a handful of rows and usually empty —
 * `after` means the steady state returns nothing at all — so this is cheap
 * enough to run at the speed the thing is worth watching.
 */
const POLL_MS = 1500;

/**
 * The killfeed, as a panel rather than an overlay.
 *
 * Nothing on the match page said what was happening inside a round. The
 * scoreboard moves, but totals do not tell you that the AWP just traded into a
 * retake — and that is the part anybody watching actually talks about.
 *
 * Capped at six lines and fixed in height. A feed that grows pushes the page
 * around every few seconds, which is worse than showing less: the whole value
 * is that it sits still and changes in place.
 */
export default function KillFeed({ matchId, live }: { matchId: number; live: boolean }) {
  const { t } = useI18n();
  const [kills, setKills] = useState<Kill[]>([]);
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

        const data: { kills: Kill[] } = await res.json();
        if (!alive || data.kills.length === 0) return;

        cursor.current = data.kills[data.kills.length - 1].id;
        // Appended and trimmed from the front: the newest line is the one at
        // the bottom, the way a feed in game reads.
        setKills((prev) => [...prev, ...data.kills].slice(-KEEP));
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

  if (kills.length === 0) return null;

  return (
    <section className="kf" aria-label={t("match.killfeed")}>
      <header className="kf-head">
        <h3>{t("match.killfeed")}</h3>
        {live && <span className="kf-live" aria-hidden="true" />}
      </header>

      <ul className="kf-list">
        <AnimatePresence initial={false}>
          {kills.map((k) => (
            <motion.li
              key={k.id}
              className={[
                "kf-row",
                k.teamKill ? "teamkill" : "",
              ].filter(Boolean).join(" ")}
              // Slides in from the side it is written towards, so a new line
              // reads as arriving rather than as the list jumping.
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              layout
            >
              <span className={`kf-name slot-${k.attacker?.slot?.toLowerCase() ?? "none"}`}>
                {k.attacker?.name ?? t("match.killfeedWorld")}
              </span>

              {k.assister && (
                <span className="kf-assist">
                  + <span className={`kf-name slot-${k.assister.slot?.toLowerCase() ?? "none"}`}>
                    {k.assister.name ?? "—"}
                  </span>
                </span>
              )}

              <span className="kf-mid">
                {k.throughSmoke && <i className="kf-tag" title="through smoke">S</i>}
                {k.penetrated && <i className="kf-tag" title="wallbang">W</i>}
                {k.noScope && <i className="kf-tag" title="no scope">N</i>}
                {k.attackerBlind && <i className="kf-tag" title="blind">B</i>}
                <WeaponIcon weapon={k.weapon} className="kf-weapon" />
                {k.headshot && <HeadshotIcon className="kf-hs" />}
              </span>

              <span className={`kf-name slot-${k.victim.slot?.toLowerCase() ?? "none"}`}>
                {k.victim.name ?? k.victim.steamId}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
