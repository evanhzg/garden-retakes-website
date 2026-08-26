import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/serverI18n";
import JoinTeam from "@/components/tournament/JoinTeam";

export const dynamic = "force-dynamic";

// Where a team's invite link lands.
//
// The link carries a token and nothing else — no identity — which is exactly
// why it is safe to paste into a Discord channel. Who you are is established by
// signing in with Steam on this page, so a link that leaks costs you an
// unwanted team-mate at worst, never an impersonation.

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { team?: string };
}) {
  const t = getT();
  const session = getSession();
  const token = (searchParams.team ?? "").trim();

  const tournament = await prisma.tournament.findUnique({ where: { Slug: params.slug } });
  if (!tournament) notFound();

  const team = token
    ? await prisma.tournamentTeam.findUnique({
        where: { InviteToken: token },
        include: {
          Members: { where: { Status: { in: ["accepted", "invited"] } } },
        },
      })
    : null;

  // A wrong or rotated token is its own outcome, not a 404: the tournament is
  // real and the visitor should be able to go and look at it.
  const bad = !team || team.TournamentId !== tournament.Id;

  const full = team ? team.Members.length >= tournament.TeamSize + 2 : false;
  const alreadyIn =
    session && team
      ? team.Members.some((m) => m.SteamId.toString() === session.steamId)
      : false;

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">{tournament.Name}</p>
          <h1 className="grad">{bad ? t("join.badTitle") : team!.Name}</h1>
          <p className="muted">
            <Link href={`/tournaments/${tournament.Slug}`}>{t("register.backToTournament")}</Link>
          </p>
        </div>
      </section>

      <section className="panel">
        {bad ? (
          <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "center" }}>
            <p style={{ margin: 0 }}>{t("join.bad")}</p>
            <Link className="btn btn-primary" href={`/tournaments/${tournament.Slug}`}>
              {t("register.seeBracket")}
            </Link>
          </div>
        ) : (
          <JoinTeam
            slug={tournament.Slug}
            token={token}
            teamName={team!.Name}
            teamSize={tournament.TeamSize}
            memberCount={team!.Members.length}
            full={full}
            alreadyIn={alreadyIn}
            signedIn={Boolean(session)}
            started={tournament.StartedAt !== null}
          />
        )}
      </section>
    </>
  );
}
