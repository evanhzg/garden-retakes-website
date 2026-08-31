"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Plus } from "lucide-react";

import { useI18n } from "@/components/I18nProvider";

type RailTournament = {
  id: number;
  slug: string;
  name: string;
  state: string;
  live: boolean;
  hasAvatar: boolean;
};

/**
 * Tournaments, where FaceIT puts clubs.
 *
 * The ones you are in, then the ones that are on. Both matter and they are
 * different questions — "where do I have to be" and "what is happening" — but
 * they want the same row, and separating them into two lists in a 300px column
 * would be two headings above two short lists.
 *
 * Two controls at the top:
 *
 *   + create, for admins and organizers only. Somebody who cannot run an event
 *     does not want a button that takes them to a page telling them so.
 *   globe explore, for everybody, which is the directory.
 *
 * The avatar is fetched per tournament from its own route rather than carried
 * in this payload — see /api/tournaments/mine for why a list must never select
 * the blob.
 */
export default function TournamentRail() {
  const { t } = useI18n();
  const [tournaments, setTournaments] = useState<RailTournament[]>([]);

  /**
   * Whether to draw the create button.
   *
   * Comes back with the list rather than from a second endpoint: it is the same
   * question about the same viewer, and two requests to learn one screen's
   * worth of state is one too many.
   */
  const [canCreate, setCanCreate] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/tournaments/mine", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tournaments: [] }))
      .then((d) => {
        if (cancelled) return;
        setTournaments(d.tournaments ?? []);
        setCanCreate(Boolean(d.canCreate));
      })
      .catch(() => {
        // An empty section, not a broken one. The rest of the panel is
        // unaffected and there is nothing useful to say about it here.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="tr">
      <div className="tr-head">
        <span className="tr-title">{t("social.tournaments")}</span>

        <span className="tr-actions">
          {canCreate && (
            <Link className="tr-btn" href="/admin/tournaments" title={t("social.tournamentsCreate")}>
              <Plus size={14} />
            </Link>
          )}
          <Link className="tr-btn" href="/tournaments" title={t("social.tournamentsExplore")}>
            <Globe size={14} />
          </Link>
        </span>
      </div>

      {tournaments.length === 0 ? (
        <p className="tr-none">{t("social.tournamentsNone")}</p>
      ) : (
        <ul className="tr-list">
          {tournaments.map((x) => (
            <li key={x.id}>
              <Link className="tr-item" href={`/tournaments/${x.slug}`} title={x.name}>
                <span className="tr-face">
                  {x.hasAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/tournaments/${x.slug}/avatar`} alt="" loading="lazy" />
                  ) : (
                    // Initials rather than a placeholder graphic: an event with
                    // no picture is the normal case, and twelve identical grey
                    // squares tell you less than twelve different pairs of
                    // letters.
                    <span className="tr-initials">{initials(x.name)}</span>
                  )}
                  {x.live && <i className="tr-live" aria-hidden />}
                </span>

                <span className="tr-name">{x.name}</span>
              </Link>
            </li>
          ))}
        </ul>
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
