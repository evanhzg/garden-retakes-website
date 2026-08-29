import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/serverI18n";
import AvatarImage from "@/components/AvatarImage";
import TeamAdmin from "@/components/tournament/TeamAdmin";
import { roleIn, teamBySlug, teamHistory } from "@/lib/tournament/teamStore";
import "@/components/tournament/teams.css";

export const dynamic = "force-dynamic";

// One standing team: who is in it, and what it has done.
//
// The history is the reason the whole feature exists. Before standing teams, a
// team's record was three unrelated rows in three tournaments with nothing but
// a name in common — so "how has this team done" was a question the site could
// not answer at all.

export default async function TeamPage({ params }: { params: { slug: string } }) {
  const t = getT();
  const session = getSession();

  const team = await teamBySlug(params.slug);
  if (!team) notFound();

  const [mine, history] = await Promise.all([
    roleIn(team.id, session?.steamId ?? null),
    teamHistory(team.id),
  ]);

  const played = history.reduce((n, h) => n + h.played, 0);
  const won = history.reduce((n, h) => n + h.won, 0);
  const titles = history.filter((h) => h.champion).length;

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">{t("teams.eyebrow")}</p>
          <h1 className="grad">
            {team.tag && <span className="tm-tag big">{team.tag}</span>}
            {team.name}
          </h1>
          {team.bio && <p className="muted">{team.bio}</p>}

          <p className="muted" style={{ fontSize: 13 }}>
            {t("teams.memberCount", { n: String(team.members.length) })}
            {" · "}
            {t("teams.since", { date: new Date(team.createdAt).toLocaleDateString() })}
          </p>
        </div>
      </section>

      {/* The record, and only when there is one. A row of zeroes is not a
          summary, it is furniture — a team that has played nothing should say
          so once, below, rather than three times in large numerals. */}
      {played > 0 && (
        <section className="panel tm-record">
          <div>
            <dt>{t("teams.played")}</dt>
            <dd className="num">{played}</dd>
          </div>
          <div>
            <dt>{t("teams.won")}</dt>
            <dd className="num">{won}</dd>
          </div>
          <div>
            <dt>{t("teams.winRate")}</dt>
            <dd className="num">{Math.round((won / played) * 100)}%</dd>
          </div>
          {titles > 0 && (
            <div>
              <dt>{t("teams.titles")}</dt>
              <dd className="num tm-titles">{titles}</dd>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <div className="admin-head">
          <h2>{t("teams.roster")}</h2>
        </div>

        <ul className="tm-roster">
          {team.members.map((m) => (
            <li key={m.steamId}>
              <Link className="tm-member" href={`/players/${m.steamId}`}>
                <AvatarImage steamId={m.steamId} className="tm-face" alt="" />
                <span className="tm-member-name">{m.name}</span>
                <span className={`tm-role ${m.role}`}>{t(`teams.role.${m.role}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="admin-head">
          <h2>{t("teams.history")}</h2>
        </div>

        {history.length === 0 ? (
          <div className="empty-hint">
            <p style={{ margin: 0 }}>{t("teams.noHistory")}</p>
          </div>
        ) : (
          <ul className="tm-history">
            {history.map((h) => (
              <li key={h.entryId}>
                <Link className="tm-hrow" href={`/tournaments/${h.slug}`}>
                  <span className="tm-htitle">
                    {h.champion && <span className="tm-crown" title={t("teams.champion")}>★</span>}
                    {h.tournament}
                  </span>
                  <span className="muted tm-hwhen">
                    {h.startedAt ? new Date(h.startedAt).toLocaleDateString() : t("teams.notStarted")}
                  </span>
                  <span className="num tm-hrec">
                    {h.won}–{h.lost}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* One panel, for anybody in the team.
          It shows the controls their role actually allows — a plain player gets
          nothing but Leave — and everything inside is gated again on the server,
          so this only decides what is worth drawing. */}
      {mine && (
        <section className="panel">
          <TeamAdmin
            teamId={team.id}
            slug={team.slug}
            name={team.name}
            tag={team.tag}
            bio={team.bio}
            myRole={mine}
            members={team.members}
          />
        </section>
      )}
    </>
  );
}
