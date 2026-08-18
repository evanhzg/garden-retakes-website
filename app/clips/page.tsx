import { getSession } from "@/lib/auth";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";
import ClipsClient from "./ClipsClient";

export const dynamic = "force-dynamic";

/**
 * Managing your /clip marks.
 *
 * There was no page for this. The only view was ClipRequestsModal — ninety
 * lines, all inline styles, showing a map name, a status word and a relative
 * time, with a Publish button that did nothing. You could see that you had
 * asked for clips; you could not tell which round any of them was, how long it
 * would be, what it became, or get rid of one you did not want.
 *
 * Moderators see everybody's, because the queue is a shared thing and a mark
 * stuck in "processing" is everyone's problem.
 */
export default async function ClipsPage() {
  const session = getSession();
  const ctx = await getAdminContext(null);

  if (!session) {
    return (
      <section className="panel">
        <h2>Your clips</h2>
        <div className="empty-hint">
          <p style={{ margin: 0 }}>Sign in to see the clips you marked with /clip in game.</p>
          <a className="btn" style={{ marginTop: 12 }} href="/api/auth/steam/login">
            Sign in with Steam
          </a>
        </div>
      </section>
    );
  }

  return <ClipsClient canSeeAll={ctx.level >= AdminLevel.Moderator} />;
}
