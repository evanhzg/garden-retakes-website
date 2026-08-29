import Link from "next/link";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import AvatarImage from "@/components/AvatarImage";
import RoleIcon from "@/components/tournament/RoleIcon";
import { roleLabel } from "@/lib/tournament/roles";
import { teamsOf } from "@/lib/tournament/teamStore";
import "./teams.css";
import "./demoprofile.css";

/**
 * A player, as a demo shows them.
 *
 * The full profile is six panels wide and most of it is about the retakes
 * ladder — ELO, per-map splits, minigame scores, playtime. None of that is what
 * a tournament is being pitched on, and a demo that opens with a season's worth
 * of ladder numbers is a demo about the wrong product.
 *
 * So: tournament figures only, where they have been to, who they play with, and
 * what they play. Four things.
 *
 * Everything defaults to nothing. A player with no tournament behind them gets
 * a page that says so plainly rather than a grid of zeroes, because a zero is a
 * claim — it says "played, scored none" — and an empty state is the truth.
 */

export default async function DemoProfile({ steamId }: { steamId: string }) {
  const t = getT();
  const id = BigInt(steamId);

  const [stats, entries, teams, roles] = await Promise.all([
    prisma.tournamentPlayerStat.findMany({ where: { SteamId: id } }),

    prisma.tournamentTeamMember.findMany({
      where: { SteamId: id, Status: { not: "removed" } },
      include: {
        Team: {
          include: {
            Tournament: { select: { Name: true, Slug: true, StartedAt: true } },
          },
        },
      },
      orderBy: { Id: "desc" },
      take: 20,
    }),

    teamsOf(steamId).catch(() => []),

    // What they actually play, counted across every tournament roster they
    // have been on. A preference is a habit, not a setting.
    prisma.tournamentTeamMember.findMany({
      where: { SteamId: id, Status: { not: "removed" } },
      select: { RoleT: true, RoleCt: true },
    }),
  ]);

  // Rounds-weighted, never a mean of means — the same rule lib/tournament/stats.ts
  // states and for the same reason: averaging per-match averages weights a
  // three-round appearance the same as a full map.
  const rounds = stats.reduce((n, s) => n + s.RoundsPlayed, 0);
  const kills = stats.reduce((n, s) => n + s.Kills, 0);
  const deaths = stats.reduce((n, s) => n + s.Deaths, 0);
  const damage = stats.reduce((n, s) => n + s.Damage, 0);
  const rating = rounds > 0
    ? stats.reduce((n, s) => n + s.Rating * s.RoundsPlayed, 0) / rounds
    : 0;

  const played = entries.length;

  const placings = entries
    .filter((e) => e.Team.Tournament.StartedAt)
    .slice(0, 6);

  const tally = (list: (string | null)[]) => {
    const counts = new Map<string, number>();
    for (const r of list) {
      if (!r) continue;
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    // Array.from rather than a spread: tsconfig targets below ES2015 here, and
    // spreading a Map iterator needs downlevelIteration.
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  };

  const tRoles = tally(roles.map((r) => r.RoleT));
  const ctRoles = tally(roles.map((r) => r.RoleCt));

  const nothing = rounds === 0 && played === 0 && teams.length === 0;

  return (
    <>
      <section className="panel dp-head">
        <AvatarImage steamId={steamId} className="dp-face" alt="" />
        <div className="dp-id">
          <h1>{t("demoProfile.title")}</h1>
          <p className="muted">{t("demoProfile.blurb")}</p>
        </div>
      </section>

      {nothing ? (
        <section className="panel">
          <div className="empty-hint">
            <p style={{ margin: 0 }}>{t("demoProfile.nothing")}</p>
          </div>
        </section>
      ) : (
        <>
          {rounds > 0 && (
            <section className="panel dp-stats">
              <div>
                <dt>{t("tstats.rating")}</dt>
                <dd className="num dp-lead">{rating.toFixed(2)}</dd>
              </div>
              <div>
                <dt>{t("scoreboard.kda")}</dt>
                <dd className="num">
                  {kills}–{deaths}
                </dd>
              </div>
              <div>
                <dt>{t("tstats.adr")}</dt>
                <dd className="num">{Math.round(damage / rounds)}</dd>
              </div>
              <div>
                <dt>{t("demoProfile.rounds")}</dt>
                <dd className="num">{rounds}</dd>
              </div>
            </section>
          )}

          {placings.length > 0 && (
            <section className="panel">
              <div className="admin-head">
                <h2>{t("demoProfile.recent")}</h2>
              </div>
              <ul className="tm-history">
                {placings.map((e) => (
                  <li key={e.Id}>
                    <Link className="tm-hrow" href={`/tournaments/${e.Team.Tournament.Slug}`}>
                      <span className="tm-htitle">{e.Team.Tournament.Name}</span>
                      <span className="muted tm-hwhen">{e.Team.Name}</span>
                      <span className="muted tm-hrec">
                        {e.Team.Tournament.StartedAt
                          ? new Date(e.Team.Tournament.StartedAt).toLocaleDateString()
                          : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {teams.length > 0 && (
            <section className="panel">
              <div className="admin-head">
                <h2>{t("demoProfile.teams")}</h2>
              </div>
              <ul className="tm-list">
                {teams.map((x) => (
                  <li key={x.id}>
                    <Link className="tm-row" href={`/teams/${x.slug}`}>
                      <span className="tm-name">
                        {x.tag && <span className="tm-tag">{x.tag}</span>}
                        {x.name}
                      </span>
                      <span className="tm-role">{t(`teams.role.${x.role}`)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(tRoles.length > 0 || ctRoles.length > 0) && (
            <section className="panel">
              <div className="admin-head">
                <h2>{t("demoProfile.roles")}</h2>
              </div>

              <div className="dp-roles">
                {([["T", tRoles], ["CT", ctRoles]] as const).map(([side, list]) =>
                  list.length === 0 ? null : (
                    <div key={side} className="dp-role-col">
                      <h3>{t(side === "T" ? "roledraft.tSide" : "roledraft.ctSide")}</h3>
                      <ul>
                        {list.map(([role, n]) => (
                          <li key={role}>
                            <RoleIcon role={role} size={15} labelled={false} />
                            <span>{roleLabel(role)}</span>
                            <span className="muted num">{n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
