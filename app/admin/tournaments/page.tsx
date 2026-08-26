import Link from "next/link";
import { AdminLevel } from "@/lib/adminAuth";
import { getTournamentContext } from "@/lib/tournamentAuth";
import { getT } from "@/lib/serverI18n";
import Setup from "@/components/tournament/Setup";

export const dynamic = "force-dynamic";

// Getting from an empty database to a match on a server.
//
// One page, in order, because the order is the part that is not obvious.
//
// Open to organizers as well as admins. What differs is scope rather than
// layout: an organizer sees the tournaments they run, an admin sees all of
// them, and the server registry stays Owner-only either way because those rows
// hold RCON passwords.

export default async function TournamentSetupPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const t = getT();
  const ctx = await getTournamentContext(searchParams.key);

  if (!ctx.canCreate) {
    return (
      <section className="panel">
        <div className="admin-head">
          <h2>{t("setup.title")}</h2>
        </div>
        <div className="empty-hint">
          <p style={{ margin: 0 }}>{t("setup.organizersOnly")}</p>
          {!ctx.steamId && (
            <a className="btn" style={{ marginTop: 12 }} href="/api/auth/steam/login">
              {t("auto.page.sign_in_with_steam")}
            </a>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="admin-head">
        <h2>{t("setup.title")}</h2>
        <span className="role-badge">{ctx.roleName}</span>
      </div>

      <p className="muted" style={{ marginTop: -4 }}>
        {t("setup.intro")}{" "}
        <Link href={`/admin/maker${searchParams.key ? `?key=${searchParams.key}` : ""}`}>
          {t("setup.makerLink")}
        </Link>
      </p>

      <Setup adminKey={searchParams.key} isOwner={ctx.level >= AdminLevel.Owner} />
    </section>
  );
}
