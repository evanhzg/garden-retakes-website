import Link from "next/link";
import { AdminLevel, getAdminContext, levelName } from "@/lib/adminAuth";
import RconConsole from "@/components/RconConsole";

export const dynamic = "force-dynamic";

export default async function RconPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const ctx = await getAdminContext(searchParams.key);
  const allowed = ctx.level >= AdminLevel.Admin;

  return (
    <section className="panel">
      <div className="admin-head">
        <h2>RCON console</h2>
        {allowed && <span className="role-badge">{levelName(ctx.level)}</span>}
      </div>

      {allowed ? (
        <>
          <p className="muted" style={{ marginTop: -4 }}>
            Commands run against the live game server. Every command is written to the admin log.
          </p>
          <RconConsole adminKey={searchParams.key} />
          <p className="muted" style={{ marginTop: 14 }}>
            Looking for the full panel? <Link href="/admin">Admin dashboard →</Link>
          </p>
        </>
      ) : (
        <div className="empty-hint">
          <p style={{ margin: 0 }}>
            This page is for admins. Sign in with a Steam account that has an admin role, or open it
            with <code>?key=…</code>.
          </p>
          {!ctx.steamId && (
            <a className="btn" style={{ marginTop: 12 }} href="/api/auth/steam/login">
              Sign in with Steam
            </a>
          )}
        </div>
      )}
    </section>
  );
}
