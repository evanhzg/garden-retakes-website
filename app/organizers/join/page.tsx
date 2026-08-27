import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/serverI18n";
import RedeemOrganizer from "@/components/tournament/RedeemOrganizer";

export const dynamic = "force-dynamic";

// Where an organizer invite link lands.
//
// Mirrors the team invite page deliberately: the token is in the URL and
// nothing else is, so the link is safe to paste into a Discord channel. Who you
// are is established by signing in with Steam on this page, and the sign-in
// carries the token through returnTo — which is the part that is easy to get
// wrong and impossible to recover from once the token has been dropped.

export default async function OrganizerJoinPage({
  searchParams,
}: {
  searchParams: { invite?: string };
}) {
  const t = getT();
  const session = getSession();
  const token = (searchParams.invite ?? "").trim();

  const invite = token
    ? await prisma.organizerInvite.findUnique({ where: { Token: token } })
    : null;

  // Every refusal is decided here, on the server, so the page never renders an
  // accept button for an invite the API would turn down.
  const problem = !invite
    ? "invalid"
    : invite.UsedBySteamId !== null && invite.UsedBySteamId.toString() !== session?.steamId
      ? "used"
      : invite.ExpiresAt && invite.ExpiresAt.getTime() < Date.now()
        ? "expired"
        : null;

  const tournament =
    invite?.Kind === "tournament" && invite.TournamentId
      ? await prisma.tournament.findUnique({
          where: { Id: invite.TournamentId },
          select: { Name: true, Slug: true },
        })
      : null;

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">{t("organizerInvite.eyebrow")}</p>
          <h1 className="grad">
            {problem
              ? t("organizerInvite.badTitle")
              : tournament
                ? tournament.Name
                : t("organizerInvite.registryTitle")}
          </h1>
        </div>
      </section>

      <section className="panel">
        <RedeemOrganizer
          token={token}
          problem={problem}
          signedIn={Boolean(session)}
          kind={invite?.Kind === "tournament" ? "tournament" : "registry"}
          tournamentName={tournament?.Name ?? null}
          tournamentSlug={tournament?.Slug ?? null}
        />
      </section>
    </>
  );
}
