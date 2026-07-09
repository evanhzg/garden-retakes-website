import { prisma } from "@/lib/db";

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
  const expected = process.env.INVSIM_API_KEY;
  if (!expected || searchParams.key !== expected) {
    return (
      <div className="panel">
        <h2>Admin log</h2>
        <p className="muted">Access denied — append ?key=&lt;your INVSIM_API_KEY&gt;.</p>
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
          <span className="eyebrow">Admin log</span>
          <h1>
            Last <span className="grad">{entries.length}</span> admin actions.
          </h1>
        </div>
      </section>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>When (UTC)</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Detail</th>
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
                  No admin actions logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
