import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ExternalLink,
  Eye,
  Gamepad2,
  MonitorPlay,
  Plus,
  Radio,
  ScrollText,
  Server,
  Settings2,
  Swords,
  Trophy,
  UserPlus,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getT, serverLocale } from "@/lib/serverI18n";
import { manageableTournamentIds, type TournamentContext } from "@/lib/tournamentAuth";
import { statusReport } from "@/lib/status";
import "./blitz-dashboard.css";

const PANEL = (process.env.PANEL_URL || "https://panel.retakes.fr").replace(/\/$/, "");
const IN_PLAY = ["veto", "roles", "ready", "live"];

/**
 * The Blitz dashboard — what an organizer needs to run tonight's event.
 *
 * It used to render the SITE dashboard: demos waiting, clip marks, bans,
 * lineups, a two-week chart of every admin action, End Season and the
 * site-wide demo-mode switch. None of that is about running a bracket, and two
 * of those are buttons an organizer should never be one scroll away from.
 *
 * Now it answers four questions, in order: what state are my events in and what
 * do they need next; what is being played this minute; which servers are free;
 * where do I go for the deep tools. The deep tools — full server consoles, the
 * fleet, the audit history — live on the panel, which is built for them; this
 * page links there rather than re-hosting a thinner copy.
 *
 * Scoped by manageableTournamentIds: an organizer sees their own events, an
 * admin sees all of them.
 */
export default async function BlitzDashboard({ ctx, keyQuery }: { ctx: TournamentContext; keyQuery: string }) {
  const t = getT();
  const locale = serverLocale() === "fr" ? "fr-FR" : "en-GB";
  const ids = await manageableTournamentIds(ctx);
  const scope = ids === null ? {} : { Id: { in: ids } };

  const [events, liveMatches, report] = await Promise.all([
    prisma.tournament.findMany({
      where: { ...scope, State: { not: "cancelled" } },
      orderBy: [{ Id: "desc" }],
      take: 30,
      select: {
        Id: true,
        Slug: true,
        Name: true,
        State: true,
        Published: true,
        MaxTeams: true,
        TeamSize: true,
        StartsAt: true,
        _count: { select: { Teams: true } },
      },
    }),
    prisma.tournamentMatch.findMany({
      where: { State: { in: IN_PLAY }, Tournament: scope },
      orderBy: [{ StartedAt: "asc" }, { Id: "asc" }],
      take: 20,
      select: {
        Id: true,
        State: true,
        ScoreA: true,
        ScoreB: true,
        TeamAId: true,
        TeamBId: true,
        ServerId: true,
        Tournament: { select: { Id: true, Slug: true, Name: true } },
      },
    }),
    statusReport().catch(() => null),
  ]);

  // Per event: how many matches are still to be played and how many are on.
  const eventIds = events.map((e) => e.Id);
  const matchCounts = eventIds.length
    ? await prisma.tournamentMatch.groupBy({
        by: ["TournamentId", "State"],
        where: { TournamentId: { in: eventIds } },
        _count: { _all: true },
      })
    : [];
  const countOf = (id: number, states: string[]) =>
    matchCounts.filter((m) => m.TournamentId === id && states.includes(m.State)).reduce((n, m) => n + m._count._all, 0);

  const teamIds = liveMatches.flatMap((m) => [m.TeamAId, m.TeamBId]).filter((x): x is number => x !== null);
  const teams = teamIds.length
    ? await prisma.tournamentTeam.findMany({ where: { Id: { in: teamIds } }, select: { Id: true, Name: true } })
    : [];
  const teamName = (id: number | null) => teams.find((x) => x.Id === id)?.Name ?? t("blitzdash.tbd");

  const active = events.filter((e) => e.State !== "finished");
  const finished = events.filter((e) => e.State === "finished").slice(0, 4);
  const servers = (report?.servers ?? []).filter((s) => s.kind === "tournament");
  const free = servers.filter((s) => s.health === "ok" && !s.match && s.recorded !== "busy").length;
  const isAdmin = ctx.level >= 2;

  const kpis = [
    { icon: Radio, label: t("blitzdash.k.live"), value: active.filter((e) => e.State === "live").length, tone: "accent" },
    { icon: UserPlus, label: t("blitzdash.k.registration"), value: active.filter((e) => e.State === "registration").length },
    { icon: Swords, label: t("blitzdash.k.inPlay"), value: liveMatches.length, tone: liveMatches.length ? "accent" : "" },
    { icon: Server, label: t("blitzdash.k.free"), value: servers.length ? `${free}/${servers.length}` : "—" },
  ];

  /** The one thing each event needs next — the reason to open it. */
  const nextStep = (e: (typeof events)[number]) => {
    if (e.State === "draft") return { tone: "warn", text: t("blitzdash.next.draft") };
    if (!e.Published) return { tone: "warn", text: t("blitzdash.next.unpublished") };
    if (e.State === "registration") {
      return e._count.Teams >= e.MaxTeams
        ? { tone: "good", text: t("blitzdash.next.full") }
        : { tone: "", text: t("blitzdash.next.registering", { teams: teamsLine(e._count.Teams, e.MaxTeams) }) };
    }
    if (e.State === "live") {
      const on = countOf(e.Id, IN_PLAY);
      const left = countOf(e.Id, ["pending"]);
      return { tone: on ? "accent" : "", text: t("blitzdash.next.live", { on, left }) };
    }
    return { tone: "", text: e.State };
  };

  const stateLabel = (s: string) => t(`blitzdash.state.${s}`);

  // Pickup events are created with a cap of 9999, meaning "no cap"; "10/9999
  // teams" reads as an event that is almost empty.
  const teamsLine = (n: number, max: number) =>
    max >= 999 ? t("blitzdash.teamsOpen", { n }) : t("blitzdash.teamsOf", { n, max });

  return (
    <div className="bd">
      {/* ---- the numbers that decide what to do first ---- */}
      <div className="bd-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`bd-kpi ${k.tone ?? ""}`}>
            <k.icon size={16} aria-hidden />
            <span className="bd-kpi-value num">{k.value}</span>
            <span className="bd-kpi-label">{k.label}</span>
          </div>
        ))}
      </div>

      {/* ---- quick actions ---- */}
      <div className="bd-actions">
        {ctx.canCreate && (
          <Link className="btn btn-primary" href={`/admin/tournaments${keyQuery}`}>
            <Plus size={15} /> {t("blitzdash.create")}
          </Link>
        )}
        <Link className="btn btn-secondary" href="/tournaments">
          <Trophy size={15} /> {t("blitzdash.publicList")}
        </Link>
        {isAdmin && (
          <Link className="btn btn-secondary" href={`/admin/maker${keyQuery}`}>
            <Gamepad2 size={15} /> {t("blitzdash.maker")}
          </Link>
        )}
      </div>

      <div className="bd-grid">
        {/* ---- events ---- */}
        <section className="bd-card bd-events">
          <h3>
            <CalendarClock size={15} /> {t("blitzdash.events")}
            <span className="num bd-count">{active.length}</span>
          </h3>
          {active.length === 0 ? (
            <p className="bd-empty">{t("blitzdash.noEvents")}</p>
          ) : (
            <ul className="bd-list">
              {active.map((e) => {
                const step = nextStep(e);
                return (
                  <li key={e.Id} className="bd-event">
                    <div className="bd-event-main">
                      <span className="bd-event-name">
                        {e.Name}
                        <span className={`bd-state ${e.State}`}>{stateLabel(e.State)}</span>
                        {!e.Published && <span className="bd-state hidden">{t("blitzdash.hidden")}</span>}
                      </span>
                      <span className={`bd-next ${step.tone}`}>{step.text}</span>
                      <span className="bd-meta">
                        {e.TeamSize}v{e.TeamSize} · {teamsLine(e._count.Teams, e.MaxTeams)}
                        {e.StartsAt &&
                          ` · ${new Date(e.StartsAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                    </div>
                    <div className="bd-event-acts">
                      <Link className="btn btn-primary bd-btn" href={`/admin/tournaments/${e.Id}${keyQuery}`}>
                        <Settings2 size={14} /> {t("blitzdash.manage")}
                      </Link>
                      <Link className="btn btn-secondary bd-btn" href={`/tournaments/${e.Slug}`} title={t("blitzdash.view")}>
                        <Eye size={14} />
                      </Link>
                      {e.State === "live" && (
                        <Link className="btn btn-secondary bd-btn" href={`/tournaments/${e.Slug}/live`} title={t("blitzdash.wall")}>
                          <MonitorPlay size={14} />
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {finished.length > 0 && (
            <div className="bd-finished">
              <span>{t("blitzdash.recent")}</span>
              {finished.map((e) => (
                <Link key={e.Id} href={`/tournaments/${e.Slug}`}>
                  {e.Name}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ---- in play ---- */}
        <section className="bd-card">
          <h3>
            <Swords size={15} /> {t("blitzdash.matches")}
            <span className="num bd-count">{liveMatches.length}</span>
          </h3>
          {liveMatches.length === 0 ? (
            <p className="bd-empty">{t("blitzdash.noMatches")}</p>
          ) : (
            <ul className="bd-list">
              {liveMatches.map((m) => (
                <li key={m.Id}>
                  <Link className="bd-match" href={`/tournaments/${m.Tournament.Slug}/match/${m.Id}`}>
                    <span className={`bd-mstate ${m.State}`}>{t(`blitzdash.mstate.${m.State}`)}</span>
                    <span className="bd-match-teams">
                      {teamName(m.TeamAId)} <b className="num">{m.ScoreA}–{m.ScoreB}</b> {teamName(m.TeamBId)}
                    </span>
                    <span className="bd-meta">{m.Tournament.Name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- servers ---- */}
        <section className="bd-card">
          <h3>
            <Server size={15} /> {t("blitzdash.servers")}
            {report && !report.liveQueries && <span className="bd-meta">{t("blitzdash.recordedOnly")}</span>}
          </h3>
          {servers.length === 0 ? (
            <p className="bd-empty">{t("blitzdash.noServers")}</p>
          ) : (
            <ul className="bd-list bd-servers">
              {servers.map((s) => (
                <li key={s.id} className={`bd-server ${s.health}`}>
                  <span className="bd-dot" aria-hidden />
                  <span className="bd-server-name">
                    {s.name}
                    <code className="num">{s.address}</code>
                  </span>
                  <span className="bd-meta">
                    {s.match ? (
                      <Link href={`/tournaments/${s.match.slug}/match/${s.match.id}`}>{s.match.label}</Link>
                    ) : s.live ? (
                      `${Math.max(0, s.live.players - s.live.bots)}/${s.live.maxPlayers} · ${s.live.map.replace(/^(de|cs)_/, "")}`
                    ) : (
                      t(`blitzdash.server.${s.health}`)
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/status" className="bd-more">
            {t("blitzdash.fullStatus")} <ArrowRight size={13} />
          </Link>
        </section>

        {/* ---- the deep tools, where they live ---- */}
        <section className="bd-card bd-panel">
          <h3>
            <ScrollText size={15} /> {t("blitzdash.deep")}
          </h3>
          <p className="bd-meta">{t("blitzdash.deepBlurb")}</p>
          <div className="bd-panel-links">
            <a href={`${PANEL}/tournaments`} target="_blank" rel="noopener noreferrer">
              <Trophy size={14} /> {t("blitzdash.p.tournaments")} <ExternalLink size={12} />
            </a>
            {isAdmin && (
              <>
                <a href={`${PANEL}/`} target="_blank" rel="noopener noreferrer">
                  <Server size={14} /> {t("blitzdash.p.fleet")} <ExternalLink size={12} />
                </a>
                <a href={`${PANEL}/audit`} target="_blank" rel="noopener noreferrer">
                  <ScrollText size={14} /> {t("blitzdash.p.audit")} <ExternalLink size={12} />
                </a>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
