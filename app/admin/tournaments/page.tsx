import Link from "next/link";
import { AdminLevel, getAdminContext, levelName } from "@/lib/adminAuth";
import { getT } from "@/lib/serverI18n";
import Setup from "@/components/tournament/Setup";

export const dynamic = "force-dynamic";

// Getting from an empty database to a match on a server.
//
// One page, in order, because the order is the part that is not obvious.

export default async function TournamentSetupPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const t = getT();
  const ctx = await getAdminContext(searchParams.key);

  if (ctx.level < AdminLevel.Admin) {
    return (
      <section className="panel">
        <div className="admin-head">
          <h2>{t("setup.title")}</h2>
        </div>
        <div className="empty-hint">
          <p style={{ margin: 0 }}>{t("maker.adminsOnly")}</p>
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
        <span className="role-badge">{levelName(ctx.level)}</span>
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
