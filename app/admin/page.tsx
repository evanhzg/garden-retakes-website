import Link from "next/link";
import { AdminLevel, getAdminContext, levelName } from "@/lib/adminAuth";
import AdminPanel from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const ctx = await getAdminContext(searchParams.key);
  const allowed = ctx.level >= AdminLevel.Moderator;

  if (!allowed) {
    return (
      <section className="panel">
        <h2>Admin dashboard</h2>
        <div className="empty-hint">
          <p style={{ margin: 0 }}>
            You need an admin role to open this page. Sign in with an admin Steam account, or append{" "}
            <code>?key=…</code>.
          </p>
          {!ctx.steamId && (
            <a className="btn" style={{ marginTop: 12 }} href="/api/auth/steam/login">
              Sign in with Steam
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
          <h2>Admin dashboard</h2>
          <span className="role-badge">{levelName(ctx.level)}</span>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          Signed in as {ctx.name || "admin"}. Every action is recorded in the{" "}
          <Link href={`/admin-log${searchParams.key ? `?key=${searchParams.key}` : ""}`}>admin log</Link>.
        </p>
      </section>

      <AdminPanel viewerLevel={ctx.level} adminKey={searchParams.key} />
    </>
  );
}
