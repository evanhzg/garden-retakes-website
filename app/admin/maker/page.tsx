import Link from "next/link";
import { AdminLevel, getAdminContext, levelName } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import MakerTool from "@/components/tournament/MakerTool";

export const dynamic = "force-dynamic";

// Authoring tournament spawns.
//
// Two halves that have to stay in step: what a position IS lives here, and where
// it is gets decided by standing in it. The page therefore does not try to be a
// map editor — it is the list of what should exist, plus a button that puts you
// in the map to place it.

export default async function MakerPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const t = getT();
  const ctx = await getAdminContext(searchParams.key);
  const allowed = ctx.level >= AdminLevel.Admin;

  if (!allowed) {
    return (
      <section className="panel">
        <div className="admin-head">
          <h2>{t("maker.title")}</h2>
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

  // Every map the library knows, whether or not it is tournament-ready — the
  // point of the page is to make one ready.
  const maps = await prisma.gardenMap.findMany({
    orderBy: [{ TournamentReady: "desc" }, { MapName: "asc" }],
  });

  return (
    <section className="panel">
      <div className="admin-head">
        <h2>{t("maker.title")}</h2>
        <span className="role-badge">{levelName(ctx.level)}</span>
      </div>

      <p className="muted" style={{ marginTop: -4 }}>
        {t("maker.intro")}
      </p>

      <MakerTool
        adminKey={searchParams.key}
        maps={maps.map((m) => ({
          id: m.Id,
          mapName: m.MapName,
          displayName: m.DisplayName ?? m.MapName,
          imageUrl: m.ImageUrl,
          ready: m.TournamentReady,
        }))}
      />

      <p className="muted" style={{ marginTop: 14 }}>
        {t("maker.backToAdmin")} <Link href="/admin">{t("auto.page.admin_dashboard")}</Link>
      </p>
    </section>
  );
}
