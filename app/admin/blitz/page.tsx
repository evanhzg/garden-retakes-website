import Link from "next/link";
import { levelName } from "@/lib/adminAuth";
import { getTournamentContext } from "@/lib/tournamentAuth";
import { orgsOrganizedBy } from "@/lib/tournament/orgs";
import AdminPanel from "@/components/AdminPanel";
import { canOpenBlitzPanel } from "@/components/admin/adminSections";
import { getT } from "@/lib/serverI18n";

export const dynamic = "force-dynamic";

/**
 * The Blitz panel: running events.
 *
 * Its own route rather than a tab of /admin, because the two answer to
 * different grants. /admin starts at Moderator on the GardenAdmins ladder; this
 * one opens for anybody who runs an event, including somebody with no admin
 * level at all. A tab inside /admin could not do that without first letting an
 * organizer past the door of everything else in there.
 *
 * The gate is `canOpenBlitzPanel`, the same predicate the panel switcher uses to
 * decide whether to offer the link — so the door and the sign on it cannot
 * disagree.
 */
export default async function BlitzAdminPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const t = getT();

  const ctx = await getTournamentContext(searchParams.key);
  const keyQuery = searchParams.key ? `?key=${encodeURIComponent(searchParams.key)}` : "";

  // Somebody added to one event as a co-organizer without being in the
  // registry. Dropping them would lock them out of the only tournament they
  // run, which is the case this whole panel exists to serve.
  const managesSome = (await orgsOrganizedBy(ctx.steamId)).length > 0;

  const viewer = { level: ctx.level, isOrganizer: ctx.isOrganizer, managesSome };

  if (!canOpenBlitzPanel(viewer)) {
    return (
      <section className="panel">
        <h2>{t("admin.blitz.title")}</h2>
        <div className="empty-hint">
          <p style={{ margin: 0 }}>{t("admin.blitz.denied")}</p>
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
    <>
      <section className="panel">
        <div className="admin-head">
          <h2>{t("admin.blitz.title")}</h2>
          <span className="role-badge">{ctx.isOrganizer ? t("admin.blitz.organizer") : levelName(ctx.level)}</span>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          {t("admin.blitz.blurb")}{" "}
          <Link href={`/tournaments${keyQuery}`}>{t("tournaments.title")}</Link>.
        </p>
      </section>

      <AdminPanel
        viewerLevel={ctx.level}
        adminKey={searchParams.key}
        panel="blitz"
        isOrganizer={ctx.isOrganizer}
        managesSome={managesSome}
      />
    </>
  );
}
