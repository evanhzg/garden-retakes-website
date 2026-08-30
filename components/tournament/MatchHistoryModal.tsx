"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  roundDelta,
  type BackupRow,
  type RoundDetail,
  type RoundPlayer,
} from "@/lib/tournament/backups";
import "./matchhistory.css";

// What happened, round by round.
//
// Assembled out of two records that already existed and were never read. The
// game server writes a backup file per round — score, sides, every player's
// money, their loadout and their running figures — and the site writes an audit
// line for every admin action. Between them they are a complete account of a
// match, and until now the only way to see either was to SSH to the box or read
// the site-wide admin log and work out which of six matches a line belonged to.
//
// Rounds are listed from the backups and their detail is fetched only when a
// round is opened. A BO3 is ninety round files and each one carries a loadout
// per player; pulling all of that over RCON to render a list nobody has scrolled
// to yet would take longer than the match.

type Entry = { at: string; actor: string; action: string; detail: string };

/** A weapon_ prefix is noise once you know you are looking at a loadout. */
const weapon = (item: string) => item.replace(/^weapon_/, "").replace(/_/g, " ");


/**
 * Cash, for the loadout view.
 *
 * Still used there and only there. The round row above dropped its economy
 * column because a CS2 backup carries no cash at all; this survives because the
 * per-player block is drawn only when the file DID yield players, and a file
 * that yields players yields their money with them.
 */
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** One line of the feed, as the history panel needs it. */
type FeedLine = {
  id: number;
  kind: string;
  winnerSlot: string | null;
  reason: string | null;
  attacker: { name: string | null; slot: string | null } | null;
  victim: { name: string | null; slot: string | null } | null;
  weapon: string;
  headshot: boolean;
};

export default function MatchHistoryModal({
  matchId,
  teamA,
  teamB,
  adminKey,
  onClose,
}: {
  matchId: number;
  teamA: string;
  teamB: string;
  adminKey?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const [rounds, setRounds] = useState<BackupRow[] | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);

  // Which rounds are open, and what has been fetched for them. Kept apart so an
  // open round that is still loading renders as "loading" rather than as empty.
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<Map<number, RoundDetail | null>>(new Map());

  /**
   * What actually happened in a round, from the feed.
   *
   * The loadout view below is fed by the round backup, and a CS2 backup holds
   * no players and no cash — so on its own an opened round showed nothing at
   * all. The feed does have the round: every kill in it, the defuse, and how it
   * ended. That is the history anybody opening this panel is looking for.
   */
  const [feed, setFeed] = useState<Map<number, FeedLine[]>>(new Map());

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/tournaments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, key: adminKey }),
      });
      return res.json();
    },
    [adminKey],
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [b, l] = await Promise.all([
          post({ action: "backups", matchId }),
          post({ action: "adminlog", matchId }),
        ]);

        if (!alive) return;
        setRounds(Array.isArray(b.backups) ? b.backups : []);
        setEntries(Array.isArray(l.entries) ? l.entries : []);
      } catch {
        if (!alive) return;
        setRounds([]);
        setEntries([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [matchId, post]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const scroller = document.querySelector<HTMLElement>(".main-content");
    const previous = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      if (scroller) scroller.style.overflow = previous;
    };
  }, [onClose]);

  /**
   * Opens a round, fetching it and the one before it.
   *
   * Both, because the files hold running totals and a round's own kills are the
   * difference between them. The previous one is usually already cached from
   * having been opened, and asking twice for it is cheaper than keeping a
   * second cache honest.
   */
  const toggle = useCallback(
    async (round: number) => {
      setOpen((o) => {
        const next = new Set(o);
        if (next.has(round)) next.delete(round);
        else next.add(round);
        return next;
      });

      // The feed for this round, which is the part that always has something in
      // it. Fetched independently of the backup detail below, so a match with
      // no readable backups still opens into a useful history.
      if (!feed.has(round)) {
        try {
          const res = await fetch(
            `/api/tournament/killfeed?matchId=${matchId}&round=${round}`,
            { cache: "no-store" },
          );
          if (res.ok) {
            const data: { kills: FeedLine[] } = await res.json();
            setFeed((m) => new Map(m).set(round, data.kills ?? []));
          }
        } catch {
          setFeed((m) => new Map(m).set(round, []));
        }
      }

      if (detail.has(round)) return;

      const wanted = [round, round - 1].filter((n) => n >= 0 && !detail.has(n));

      const got = await Promise.all(
        wanted.map(async (n) => {
          try {
            const data = await post({ action: "roundinfo", matchId, round: n });
            return [n, (data.detail ?? null) as RoundDetail | null] as const;
          } catch {
            return [n, null] as const;
          }
        }),
      );

      setDetail((d) => {
        const next = new Map(d);
        for (const [n, v] of got) next.set(n, v);
        return next;
      });
    },
    [detail, feed, matchId, post],
  );

  const roundBody = (round: number) => {
    const lines = feed.get(round) ?? [];

    // The feed first, because it is the part that is always there. The loadout
    // view under it comes from the round backup, which on CS2 carries no
    // players at all — so it is drawn when there is something to draw and
    // silently absent when there is not, rather than showing a row of dashes.
    const feedBlock = lines.length > 0 && (
      <ul className="mh-feed">
        {lines.map((l) => (
          <li key={l.id} className={`mh-feed-${l.kind}`}>
            {l.kind === "round" ? (
              <>
                <span className="mh-feed-verb">{t("history.roundWon")}</span>
                <b className={`slot-${(l.winnerSlot ?? "none").toLowerCase()}`}>
                  {l.winnerSlot === "A" ? "A" : l.winnerSlot === "B" ? "B" : "—"}
                </b>
                <span className="mh-feed-reason">{l.reason}</span>
              </>
            ) : l.kind === "defuse" ? (
              <>
                <b className={`slot-${(l.victim?.slot ?? "none").toLowerCase()}`}>{l.victim?.name}</b>
                <span className="mh-feed-verb">{t("match.feedDefused")}</span>
              </>
            ) : (
              <>
                <b className={`slot-${(l.attacker?.slot ?? "none").toLowerCase()}`}>
                  {l.attacker?.name ?? "—"}
                </b>
                <code className="mh-feed-weapon">{l.weapon}{l.headshot ? " · hs" : ""}</code>
                <b className={`slot-${(l.victim?.slot ?? "none").toLowerCase()}`}>{l.victim?.name}</b>
              </>
            )}
          </li>
        ))}
      </ul>
    );

    if (!detail.has(round)) {
      return feedBlock || <p className="mh-note">{t("history.loading")}</p>;
    }

    const here = detail.get(round) ?? null;
    if (!here) return feedBlock || <p className="mh-note">{t("history.noDetail")}</p>;

    const before = detail.get(round - 1) ?? null;
    const played = roundDelta(before, here);

    const side = (which: "t" | "ct") => {
      const rows = played.filter((p) => p.side === which);
      if (rows.length === 0) return null;

      return (
        <div className={`mh-side mh-${which}`}>
          <h5>
            {which === "t" ? "T" : "CT"} · {(which === "t" ? here.t.team : here.ct.team) || "—"}
          </h5>

          <ul className="mh-players">
            {rows.map((p: RoundPlayer) => (
              <li key={`${which}-${p.name}`}>
                <span className="mh-pname">{p.name}</span>

                <span className="mh-kda num">
                  {p.kills}–{p.deaths}–{p.assists}
                </span>

                <span className="mh-cash num">{money(p.cash)}</span>

                {/* The loadout is the point of the whole view: "how did they
                    lose a 3-0 lead" is usually answered by what they bought. */}
                <span className="mh-items">
                  {p.items.length === 0
                    ? "—"
                    : p.items.map((i) => (
                        <code key={i} className="mh-item">
                          {weapon(i)}
                        </code>
                      ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    };

    return (
      <div className="mh-round-body">
        {side("t")}
        {side("ct")}
      </div>
    );
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="mh-backdrop" onClick={onClose} role="presentation">
      <div
        className="mh-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("history.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mh-head">
          <h3>{t("history.title")}</h3>
          <span className="mh-teams">
            {teamA} <span className="muted">v</span> {teamB}
          </span>
          <button className="mh-close" onClick={onClose} aria-label={t("commands.close")}>
            <X size={18} />
          </button>
        </header>

        <div className="mh-body">
          <section className="mh-section">
            <h4>{t("history.rounds")}</h4>

            {rounds === null ? (
              <p className="mh-note">{t("history.loading")}</p>
            ) : rounds.length === 0 ? (
              <p className="mh-note">{t("history.noRounds")}</p>
            ) : (
              <ul className="mh-rounds">
                {rounds.map((r) => (
                  <li key={r.round} className={open.has(r.round) ? "open" : ""}>
                    <button className="mh-round" onClick={() => toggle(r.round)}>
                      {open.has(r.round) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}

                      <span className="mh-rn num">{r.round}</span>

                      {/* Sides, spelled out. Two backups either side of halftime
                          have the same teams the other way round, and nothing
                          else on the row says so.

                          The score and the economy used to sit here and were
                          always "0–0" and "$0 / $0", because a CS2 round backup
                          does not contain either. The file holds the team names,
                          the map, the round, RoundResults, PlayersAlive and the
                          timeouts — no cash, and a FirstHalfScore the engine
                          leaves at zero because this plugin owns the score
                          rather than the engine. Showing a field that can only
                          ever be zero is worse than not showing it: it reads as
                          the match being broken rather than as the file not
                          having it. */}
                      <span className="mh-sides">
                        <span className="mh-t">T {r.t.team || "—"}</span>
                        <span className="mh-ct">CT {r.ct.team || "—"}</span>
                      </span>
                    </button>

                    {open.has(r.round) && roundBody(r.round)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mh-section">
            <h4>{t("history.adminActions")}</h4>

            {entries === null ? (
              <p className="mh-note">{t("history.loading")}</p>
            ) : entries.length === 0 ? (
              <p className="mh-note">{t("history.noActions")}</p>
            ) : (
              <ul className="mh-log">
                {entries.map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time>
                    <span className="mh-actor">{e.actor}</span>
                    <span className="mh-action">{e.action}</span>
                    {e.detail && <code className="mh-detail">{e.detail}</code>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
