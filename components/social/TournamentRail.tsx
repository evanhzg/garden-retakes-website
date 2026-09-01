"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Globe, Plus } from "lucide-react";

import { useI18n } from "@/components/I18nProvider";

type RailTournament = {
  id: number;
  slug: string;
  name: string;
  state: string;
  live: boolean;
  startsAt: string | null;
  hasAvatar: boolean;
};

type Wire = {
  organised: RailTournament[];
  playing: RailTournament[];
  upcoming: RailTournament[];
  running: RailTournament[];
  canCreate: boolean;
};

const EMPTY: Wire = { organised: [], playing: [], upcoming: [], running: [], canCreate: false };

/**
 * Tournaments, where FaceIT puts clubs.
 *
 * Four lists rather than one, because they answer different questions and a
 * combined list sorted by date puts them in each other's way:
 *
 *   Running     — you organise it. You are responsible for it.
 *   Playing     — you are in it and it is on NOW. Go there.
 *   Upcoming    — you are in it and it has not started. Be ready.
 *   On now      — everybody else's, for when none of the above applies.
 *
 * A name appears in exactly one: something you organise is not also listed as
 * something you play in, and the public list excludes anything already named
 * above it. Two entries for one tournament reads as two tournaments.
 *
 * The avatar comes from its own route rather than this payload — see
 * /api/tournaments/mine for why a list must never select the blob.
 */
export default function TournamentRail() {
  const { t } = useI18n();
  const [wire, setWire] = useState<Wire>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/tournaments/mine", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : EMPTY))
      .then((d: Wire) => {
        if (!cancelled) setWire({ ...EMPTY, ...d });
      })
      .catch(() => {
        // An empty section, not a broken one. The rest of the panel is
        // unaffected and there is nothing useful to say about it here.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const groups: { key: string; label: string; items: RailTournament[] }[] = [
    { key: "organised", label: t("social.tournamentsOrganised"), items: wire.organised },
    { key: "playing", label: t("social.tournamentsPlaying"), items: wire.playing },
    { key: "upcoming", label: t("social.tournamentsUpcoming"), items: wire.upcoming },
    { key: "running", label: t("social.tournamentsOnNow"), items: wire.running },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="tr">
      <div className="tr-head">
        <span className="tr-title">{t("social.tournaments")}</span>

        <span className="tr-actions">
          {wire.canCreate && (
            <Link className="tr-btn" href="/admin/tournaments" title={t("social.tournamentsCreate")}>
              <Plus size={14} />
            </Link>
          )}
          <Link className="tr-btn" href="/tournaments" title={t("social.tournamentsExplore")}>
            <Globe size={14} />
          </Link>
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="tr-none">{t("social.tournamentsNone")}</p>
      ) : (
        groups.map((g, gi) => (
          <div className="tr-group" key={g.key}>
            <span className="tr-group-title">{g.label}</span>

            <ul className="tr-list">
              {g.items.map((x, i) => (
                <motion.li
                  key={x.id}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  // Staggered across the whole panel rather than per group, so
                  // the sections read as one list arriving and not four.
                  transition={{
                    duration: 0.18,
                    delay: 0.02 * (gi * 3 + i),
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <Link className="tr-item" href={`/tournaments/${x.slug}`} title={x.name}>
                    <span className="tr-face">
                      {x.hasAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/tournaments/${x.slug}/avatar`} alt="" loading="lazy" />
                      ) : (
                        // Initials rather than a placeholder graphic: an event
                        // with no picture is the normal case, and a column of
                        // identical grey squares tells you less than a column
                        // of different letter pairs.
                        <span className="tr-initials">{initials(x.name)}</span>
                      )}
                      {x.live && <i className="tr-live" aria-hidden />}
                    </span>

                    <span className="tr-lines">
                      <span className="tr-name">{x.name}</span>
                      {/* When, but only for the ones that have not started —
                          a date on a tournament being played is noise. */}
                      {!x.live && x.startsAt && (
                        <span className="tr-when">{whenLabel(x.startsAt)}</span>
                      )}
                    </span>
                  </Link>
                </motion.li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

/** Up to two letters, from the words people would say out loud. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * A short "when", in the reader's own locale.
 *
 * Deliberately not a countdown: this is a list you glance at, and a ticking
 * number in it is a thing that moves while you are reading something else.
 */
function whenLabel(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";

  const days = Math.round((when.getTime() - Date.now()) / 86_400_000);

  // Intl handles the plural and the language; hard-coding "in 3 days" would
  // need a rule per locale for something the platform already knows.
  const rel = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return Math.abs(days) < 1
    ? when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : rel.format(days, "day");
}
