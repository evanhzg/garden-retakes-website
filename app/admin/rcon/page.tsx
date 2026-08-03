import Link from "next/link";
import { AdminLevel, getAdminContext, levelName } from "@/lib/adminAuth";
import RconConsole from "@/components/RconConsole";
import { getT } from '@/lib/serverI18n';

export const dynamic = "force-dynamic";

export default async function RconPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
    const t = getT();

  const ctx = await getAdminContext(searchParams.key);
  const allowed = ctx.level >= AdminLevel.Admin;

  return (
    <section className="panel">
      <div className="admin-head">
        <h2>{t("auto.page.rcon_console")}</h2>
        {allowed && <span className="role-badge">{levelName(ctx.level)}</span>}
      </div>

      {allowed ? (
        <>
          <p className="muted" style={{ marginTop: -4 }}>
            {t("auto.page.commands_run_against_the_live")}
                                </p>
          <RconConsole adminKey={searchParams.key} />
          <p className="muted" style={{ marginTop: 14 }}>
            {t("auto.page.looking_for_the_full_panel")} <Link href="/admin">{t("auto.page.admin_dashboard")}</Link>
          </p>
        </>
      ) : (
        <div className="empty-hint">
          <p style={{ margin: 0 }}>
            {t("auto.page.this_page_is_for_admins_sign_i")} <code>{t("auto.page._key")}</code>.
          </p>
          {!ctx.steamId && (
            <a className="btn" style={{ marginTop: 12 }} href="/api/auth/steam/login">
              {t("auto.page.sign_in_with_steam")}
                                          </a>
          )}
        </div>
      )}
    </section>
  );
}
