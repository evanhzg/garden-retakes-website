import { prisma } from "@/lib/db";
import { getT } from '@/lib/serverI18n';

export const metadata = {
  title: "Admin log — Garden Retakes",
};

export const dynamic = "force-dynamic";

// Hidden, key-protected page (not linked in the nav):
//   /admin-log?key=<INVSIM_API_KEY>
// Shows the last 200 admin actions written by the Garden-retakes plugin.
export default async function AdminLogPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
    const t = getT();

  const expected = process.env.INVSIM_API_KEY;
  if (!expected || searchParams.key !== expected) {
    return (
      <div className="panel">
        <h2>{t("auto.page.admin_log")}</h2>
        <p className="muted">{t("auto.page.access_denied_append_key_lt_yo")}</p>
      </div>
    );
  }

  const entries = await prisma.gardenAdminLogEntry.findMany({
    orderBy: { Id: "desc" },
    take: 200,
  });

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <span className="eyebrow">{t("auto.page.admin_log")}</span>
          <h1>
            {t("auto.page.last")} <span className="grad">{entries.length}</span> {t("auto.page.admin_actions")}
                                </h1>
        </div>
      </section>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>{t("auto.page.when_utc")}</th>
              <th>{t("auto.page.actor")}</th>
              <th>{t("auto.page.action")}</th>
              <th>{t("auto.page.target")}</th>
              <th>{t("auto.page.detail")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.Id.toString()}>
                <td className="muted">{e.AtUtc.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td>{e.ActorName || e.ActorSteamId.toString()}</td>
                <td>
                  <strong>{e.Action}</strong>
                </td>
                <td>{e.TargetName || (e.TargetSteamId ? e.TargetSteamId.toString() : "—")}</td>
                <td className="muted">{e.Detail || "—"}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {t("auto.page.no_admin_actions_logged_yet")}
                                                  </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
