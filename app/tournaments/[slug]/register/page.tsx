import BackToTournament from "@/components/tournament/BackToTournament";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/serverI18n";
import Register from "@/components/tournament/Register";
import { registrationBlockedReason, type EditionState } from "@/lib/tournament/edition";

export const dynamic = "force-dynamic";

// Registering a team.
//
// The page and the API share one predicate — registrationBlockedReason — so
// what this offers and what the server accepts cannot drift apart. Every
// refusal here leads somewhere: full means go and watch, invite-only means ask
// for a link, not-yet means come back.

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { invite?: string };
}) {
  const t = getT();
  const session = getSession();

  const tournament = await prisma.tournament.findUnique({
    where: { Slug: params.slug },
    include: {
      _count: { select: { Teams: true } },
      Teams: {
        where: { Status: { not: "withdrawn" } },
        orderBy: { Name: "asc" },
        include: { Members: { where: { Status: { in: ["accepted", "invited"] } } } },
      },
    },
  });

  if (!tournament) notFound();

  const edition: EditionState = {
    published: tournament.Published,
    state: tournament.State,
    visibility: tournament.Visibility === "invite" ? "invite" : "public",
    maxTeams: tournament.MaxTeams,
    teamCount: tournament._count.Teams,
    startsAt: tournament.StartsAt,
    startedAt: tournament.StartedAt,
  };

  const holdsInvite =
    Boolean(tournament.InviteToken) && searchParams.invite === tournament.InviteToken;

  const blocked = registrationBlockedReason(edition, holdsInvite);

  // Nothing 404s here any more.
  //
  // The only reason this page used to was an unpublished tournament, and that
  // is now an ordinary unlisted one — see registrationBlockedReason. Every other
  // blocked reason is a fact the visitor should be told (it has started, it is
  // full, it is invite-only), and the page below already says which.

  const mine = session
    ? tournament.Teams.find((team) =>
        team.Members.some((m) => m.SteamId.toString() === session.steamId),
      )
    : undefined;

  const proto = headers().get("x-forwarded-proto") ?? "https";
  const host = headers().get("host") ?? "retakes.fr";
  const origin = `${proto}://${host}`;

  return (
    <>
      <BackToTournament slug={tournament.Slug} />

      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">{tournament.Name}</p>
          <h1 className="grad">{t("register.title")}</h1>
          <p className="muted">
            {tournament.TeamSize}v{tournament.TeamSize}
            {" · "}
            {tournament._count.Teams} / {tournament.MaxTeams} {t("tournaments.teams").toLowerCase()}
          </p>
        </div>
      </section>

      {blocked ? (
        <section className="panel">
          <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "center" }}>
            <p style={{ margin: 0 }}>
              {blocked === "full" && t("register.full")}
              {blocked === "invite-only" && t("register.inviteOnly")}
              {blocked === "started" && t("register.started")}
              {blocked === "wrong-state" && t("register.closed")}
            </p>

            {/* Every dead end has a way onward. A full tournament is still
                worth watching, which is the whole point of saying so here. */}
            <Link className="btn btn-primary" href={`/tournaments/${tournament.Slug}`}>
              {t("register.seeBracket")}
            </Link>
          </div>
        </section>
      ) : (
        <Register
          tournamentId={tournament.Id}
          slug={tournament.Slug}
          teamSize={tournament.TeamSize}
          invite={holdsInvite ? searchParams.invite ?? null : null}
          signedIn={Boolean(session)}
          origin={origin}
          myTeam={
            mine
              ? {
                  id: mine.Id,
                  name: mine.Name,
                  inviteToken: mine.InviteToken,
                  captain: mine.CaptainSteamId.toString() === session?.steamId,
                  members: mine.Members.map((m) => ({
                    steamId: m.SteamId.toString(),
                    displayName: m.DisplayName,
                    captain: m.IsCaptain,
                  })),
                }
              : null
          }
        />
      )}
    </>
  );
}
