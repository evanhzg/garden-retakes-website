import Link from "next/link";
import { matchesInSession, spanOf, type LinkableMatch } from "@/lib/sessionMatches";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recentForm, type SessionSummary } from "@/lib/recentForm";
import { resolveNames, nameFrom } from "@/lib/names";
import AvatarImage from "@/components/AvatarImage";
import { getT } from "@/lib/serverI18n";
import "./form.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Recent form",
  description: "Your last ten sessions: rating, K/D, ADR and how each one went.",
};

// Recent form, the same numbers the lobby shows on a player card.
//
// The unit is a session — a run of rounds with no half-hour gap — because a
// retake server never stops and there is no such thing as a match to count. Ten
// sessions is roughly the last fortnight of playing for a regular, and it is
// the window the lobby uses, so the two never disagree.

const SESSIONS = 10;

/** Who this page is about: ?steamId= wins, else the signed-in player. */
async function subjectOf(searchParams: { steamId?: string }) {
  const asked = (searchParams.steamId ?? "").trim();
  if (/^\d{5,20}$/.test(asked)) return BigInt(asked);
  const session = getSession();
  return session ? BigInt(session.steamId) : null;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const tone = (r: number) => (r >= 1.15 ? "good" : r >= 0.9 ? "mid" : "low");

const mapShort = (m: string) => m.replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase());

export default async function RecentFormPage({
  searchParams,
}: {
  searchParams: { steamId?: string };
}) {
  const t = getT();
  const steamId = await subjectOf(searchParams);

  if (!steamId) {
    return (
      <section className="panel">
        <h2>{t("form.page.title")}</h2>
        <p className="muted">{t("form.page.signin")}</p>
        <a className="btn btn-primary" href="/api/auth/steam/login">
          {t("lobby.signin")}
        </a>
      </section>
    );
  }

  const form = await recentForm(steamId, SESSIONS);
  const names = await resolveNames([steamId]);
  const name = nameFrom(names, steamId);

  if (form.rounds === 0) {
    return (
      <section className="panel">
        <h2>{t("form.page.title")}</h2>
        <p className="muted">{t("form.nogamesLong")}</p>
      </section>
    );
  }

  // A ranked ladder of everyone's recent form would need a query per player, so
  // the comparison here is against the player's own longer history instead —
  // which is the more useful question anyway ("am I playing better than usual?").
  const lifetime = await prisma.playerRoundRecord.aggregate({
    where: { SteamId: steamId, IsRanked: true },
    _avg: { Rating: true },
    _count: { _all: true },
  });
  const lifetimeRating = lifetime._avg.Rating ?? 0;
  const delta = form.rating - lifetimeRating;

  /* THE SESSIONS HAD NOWHERE TO GO.
   *
   * A session is a run of ranked ROUNDS grouped by time — PlayerRoundRecord
   * carries no match identity, so there was no id to link with and the rows
   * were inert. What a session does have is a window, and a tournament match
   * has a clock, so the join is on time: a match that started inside the
   * window is a match played during that session. Only tournament matches,
   * because only they have a page — a CrMatch has nowhere to point.
   *
   * One query for the whole span rather than one per row. */
  const span = spanOf(form.sessions);
  const myTeams = span
    ? await prisma.tournamentTeamMember.findMany({
        where: { SteamId: steamId, Status: { not: "removed" } },
        select: { TeamId: true },
      })
    : [];
  const myTeamIds = myTeams.map((x) => x.TeamId);

  const playedMatches =
    span && myTeamIds.length > 0
      ? await prisma.tournamentMatch.findMany({
          where: {
            StartedAt: { gte: span.from, lte: span.to },
            OR: [{ TeamAId: { in: myTeamIds } }, { TeamBId: { in: myTeamIds } }],
          },
          select: {
            Id: true,
            StartedAt: true,
            Tournament: { select: { Slug: true } },
            Maps: { select: { Map: true }, take: 1, orderBy: { Ordinal: "asc" } },
          },
        })
      : [];

  const linkable: LinkableMatch[] = playedMatches.map((m) => ({
    id: m.Id,
    slug: m.Tournament.Slug,
    startedAt: m.StartedAt ? m.StartedAt.getTime() : null,
    map: m.Maps[0]?.Map ?? null,
  }));

  return (
    <>
      <section className="panel rf-head">
        <div className="rf-who">
          <div className="rf-avatar">
            <AvatarImage steamId={steamId.toString()} />
          </div>
          <div>
            <h2>{name}</h2>
            <p className="muted">
              {t("form.window", { sessions: form.sessions.length, rounds: form.rounds })}
            </p>
          </div>
        </div>

        <div className="rf-headline">
          <span className={`rf-big ${tone(form.rating)}`}>{form.rating.toFixed(2)}</span>
          <span className="rf-biglabel">{t("form.page.rating")}</span>
          {lifetime._count._all > form.rounds && (
            <span className={`rf-delta ${delta >= 0 ? "up" : "down"}`}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} {t("form.page.vslifetime")}
            </span>
          )}
        </div>
      </section>

      <section className="panel">
        <h3 className="rf-h3">{t("form.page.acrosswindow")}</h3>
        <div className="rf-tiles">
          <Tile label={t("form.kd")} value={form.kd.toFixed(2)} />
          <Tile label={t("form.adr")} value={form.adr.toFixed(0)} />
          <Tile label={t("form.hs")} value={`${form.hsPercent.toFixed(0)}%`} />
          <Tile label={t("form.kast")} value={`${form.kastPercent.toFixed(0)}%`} />
          <Tile label={t("form.winrate")} value={`${form.winPercent.toFixed(0)}%`} />
          <Tile label={t("form.opening")} value={`${form.openingWinPercent.toFixed(0)}%`} />
          <Tile label={t("form.multikills")} value={String(form.multiKills)} />
          <Tile label={t("form.clutches")} value={String(form.clutches)} />
        </div>
        {form.topMap && <p className="muted rf-note">{t("form.mostplayed", { map: mapShort(form.topMap) })}</p>}
      </section>

      <section className="panel">
        <h3 className="rf-h3">{t("form.page.sessions")}</h3>
        <p className="muted rf-note">{t("form.page.sessionexplainer")}</p>
        <ul className="rf-sessions">
          {form.sessions.map((s, i) => (
            <SessionRow key={i} s={s} t={t} links={matchesInSession(s, linkable)} />
          ))}
        </ul>
      </section>

      <section className="panel rf-links">
        <Link className="btn btn-secondary" href="/stats">
          {t("stats.layout.overview")}
        </Link>
        <Link className="btn btn-secondary" href="/lobby">
          {t("form.page.tolobby")}
        </Link>
      </section>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rf-tile">
      <span className="rf-tile-value">{value}</span>
      <span className="rf-tile-label">{label}</span>
    </div>
  );
}

function SessionRow({
  s,
  t,
  links,
}: {
  s: SessionSummary;
  t: (k: string, v?: Record<string, string | number>) => string;
  links: LinkableMatch[];
}) {
  const kd = s.deaths > 0 ? s.kills / s.deaths : s.kills;
  return (
    <li className={`rf-session ${s.won ? "won" : "lost"}`}>
      <span className="rf-session-verdict">{s.won ? "W" : "L"}</span>
      <span className="rf-session-when">
        <strong>{fmtDate(s.startedAt)}</strong>
        <span className="muted">
          {fmtTime(s.startedAt)}–{fmtTime(s.endedAt)}
        </span>
      </span>
      <span className="rf-session-maps">{s.maps.slice(0, 3).map(mapShort).join(" · ")}</span>
      <span className="rf-session-score">
        {s.wins}–{s.losses}
        <span className="muted"> {t("form.page.rounds")}</span>
      </span>
      <span className="rf-session-kd">
        {s.kills}/{s.deaths}
        <span className="muted"> ({kd.toFixed(2)})</span>
      </span>
      <span className={`rf-session-rating ${tone(s.rating)}`}>{s.rating.toFixed(2)}</span>

      {/* The matches played in this window, each opening its own page. A
          session with none — every ladder-only evening — shows nothing rather
          than an empty control. */}
      {links.length > 0 && (
        <span className="rf-session-links">
          {links.map((m, i) => (
            <Link key={m.id} className="rf-session-link" href={`/tournaments/${m.slug}/match/${m.id}`}>
              {m.map ? mapShort(m.map) : t("form.page.match", { n: i + 1 })}
            </Link>
          ))}
        </span>
      )}
    </li>
  );
}
