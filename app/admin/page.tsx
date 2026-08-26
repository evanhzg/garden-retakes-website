import Link from "next/link";
import { AdminLevel, getAdminContext, levelName } from "@/lib/adminAuth";
import AdminPanel from "@/components/AdminPanel";
import { getT } from '@/lib/serverI18n';

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
    const t = getT();

  const ctx = await getAdminContext(searchParams.key);
  const allowed = ctx.level >= AdminLevel.Moderator;
  const keyQuery = searchParams.key ? `?key=${encodeURIComponent(searchParams.key)}` : "";

  if (!allowed) {
    return (
      <section className="panel">
        <h2>{t("auto.page.admin_dashboard")}</h2>
        <div className="empty-hint">
          <p style={{ margin: 0 }}>
            {t("auto.page.you_need_an_admin_role_to_open")}{" "}
            <code>{t("auto.page._key")}</code>.
          </p>
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
          <h2>{t("auto.page.admin_dashboard")}</h2>
          <span className="role-badge">{levelName(ctx.level)}</span>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          {t("auto.page.signed_in_as")} {ctx.name || "admin"}{t("auto.page._every_action_is_recorded_in_t")}{" "}
          <Link href={`/admin-log${keyQuery}`}>{t("auto.page.admin_log")}</Link>.
        </p>
        {/* The tournament pages had no entry point from here at all — you had
            to know the URL. They are the two most-used tools during an event. */}
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
          <Link className="btn btn-secondary" href={`/admin/tournaments${keyQuery}`}>
            {t("setup.title")}
          </Link>
          <Link className="btn btn-secondary" href={`/admin/maker${keyQuery}`}>
            {t("setup.makerLink")}
          </Link>
          <Link className="btn btn-secondary" href={`/admin/skins${keyQuery}`}>
            {t("auto.page.custom_skins")}
                                </Link>
          <Link className="btn btn-secondary" href={`/admin-log${keyQuery}`}>
            {t("auto.page.admin_log")}
                                </Link>
        </div>
      </section>

      <AdminPanel viewerLevel={ctx.level} adminKey={searchParams.key} />
    </>
  );
}
