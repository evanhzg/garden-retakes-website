import BackToTournament from "@/components/tournament/BackToTournament";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/serverI18n";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import MatchStage from "@/components/tournament/MatchStage";
import MatchWatch from "@/components/tournament/MatchWatch";
import StatusTag from "@/components/tournament/StatusTag";
import { scoreboardFor } from "@/lib/tournament/scoreboard";
import { RoleLegend } from "@/components/tournament/RoleIcon";
import MapCards from "@/components/tournament/MapCards";
import "@/components/tournament/matchhead.css";

export const dynamic = "force-dynamic";

// One match, for the two captains and everybody watching.
//
// Reachable as soon as the tournament has started — before the veto, before a
// server exists — because "where do I go" is the question a player has the
// moment a bracket appears, and the answer should be a page that already
// exists rather than a Discord message.
//
// The page is one thing that changes shape rather than four stacked panels. A
// match is ready-up, then the role draft, then the veto, then a scoreboard, and
// only ever one of those at a time; MatchStage is what decides which, and the
// two team panels stay either side of it throughout. The maps table below is
// the exception, because the series is worth reading in every one of those
// states.

export default async function MatchPage({
  params,
}: {
  params: { slug: string; matchId: string };
}) {
  const t = getT();
  const session = getSession();

  const matchId = Number(params.matchId);
  if (!Number.isInteger(matchId)) notFound();

  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    include: {
      Tournament: true,
      Maps: { orderBy: { Ordinal: "asc" } },
    },
  });

  if (!match || match.Tournament.Slug !== params.slug) notFound();

  const ctx = await getTournamentContext();
  const isOrganizer = await canManage(ctx, match.TournamentId);

  if (!match.Tournament.Published && !isOrganizer) notFound();

  const teams = await prisma.tournamentTeam.findMany({
    where: { Id: { in: [match.TeamAId, match.TeamBId].filter((x): x is number => x !== null) } },
  });

  const teamA = teams.find((x) => x.Id === match.TeamAId);
  const teamB = teams.find((x) => x.Id === match.TeamBId);

  // Which side this viewer captains, if either. Captains act; everybody else
  // watches, including organizers who are not playing.
  const mySlot: "A" | "B" | null = !session
    ? null
    : teamA?.CaptainSteamId.toString() === session.steamId
      ? "A"
      : teamB?.CaptainSteamId.toString() === session.steamId
        ? "B"
        : null;

  const started = match.Tournament.StartedAt !== null;

  // Computed here rather than fetched by the client, so a shared link renders
  // its numbers without JavaScript having run. The client polls the same
  // function through /api/tournament/scoreboard for everything after that.
  const board = await scoreboardFor(matchId);

  const nameOf = (teamId: number | null) =>
    teamId === match.TeamAId ? teamA?.Name : teamId === match.TeamBId ? teamB?.Name : null;

  return (
    <>
      {/* The way out and where you are, on one line. The tournament name used
          to be an eyebrow inside the hero, which put the two halves of "where
          am I" in different places and left the back control sitting alone
          above an empty row. */}
      <div className="mh-nav">
        <BackToTournament slug={params.slug} label={t("match.backToBracket")} />
        <Link className="mh-tournament" href={`/tournaments/${params.slug}`}>
          {match.Tournament.Name}
        </Link>
      </div>

      <section className="hero hero-compact">
        <div className="hero-inner mh-hero">
          <div className="mh-id">
            <h1 className="grad">
              {teamA?.Name ?? "—"} <span className="muted">v</span> {teamB?.Name ?? "—"}
            </h1>

            <p className="mh-meta">
              <span className="mh-bo">BO{match.BestOf}</span>
              <StatusTag kind="match" value={match.State} className="tiny" />
              {match.ScoreA + match.ScoreB > 0 && (
                <span className="mh-score num">
                  {match.ScoreA} – {match.ScoreB}
                </span>
              )}
            </p>

            {/* GOTV first. Only rendered at all once there is a server and this
                viewer is allowed at it — the endpoint decides both. */}
            <MatchWatch
              matchId={match.Id}
              matchKey={match.MatchKey}
              teamA={teamA?.Name ?? "A"}
              teamB={teamB?.Name ?? "B"}
              state={match.State}
              isOrganizer={isOrganizer}
            />
          </div>

          {/* The key to the role marks. Top right, because the marks it explains
              are down both edges of everything below it. */}
          <RoleLegend />
        </div>
      </section>

      <section className="panel">
        {!started ? (
          // A match page before the tournament starts is a real state, not an
          // error: the bracket is drawn and people click through it early.
          <>
            <h3>{t("match.veto")}</h3>
            <p className="muted">{t("match.notStarted")}</p>
          </>
        ) : !teamA || !teamB ? (
          <>
            <h3>{t("match.veto")}</h3>
            <p className="muted">{t("match.waitingTeams")}</p>
          </>
        ) : (
          board && (
            <MatchStage
              matchId={match.Id}
              teamA={{ id: teamA.Id, name: teamA.Name, tag: teamA.Tag }}
              teamB={{ id: teamB.Id, name: teamB.Name, tag: teamB.Tag }}
              mySlot={mySlot}
              mySteamId={session?.steamId ?? null}
              isOrganizer={isOrganizer}
              initialBoard={board}
              // The maps existing IS the veto having finished — materialiseMaps
              // is what writes them — so this is the same fact the poller would
              // discover a beat later, known in time for the first paint.
              initialDecided={match.Maps.length > 0}
            />
          )
        )}
      </section>

      {board && board.maps.length > 0 && (
        <section className="panel">
          <h3>{t("tournaments.maps")}</h3>

          {/* Cards, not a table. A row gave every map the weight of a line of
              metadata, and the picture is how anybody recognises a map at a
              glance — "de_anubis" is a string, Anubis is somewhere you have
              stood. The demo hangs off the card it belongs to, because on a BO3
              a single list at the bottom makes you work out which is which. */}
          <MapCards
            maps={board.maps}
            teamA={teamA?.Name ?? "A"}
            teamB={teamB?.Name ?? "B"}
          />
        </section>
      )}

    </>
  );
}
