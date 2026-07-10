import Link from "next/link";
import { getSession } from "@/lib/auth";
import ProfileEditor from "@/components/ProfileEditor";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  const session = getSession();

  return (
    <section className="panel">
      <h2>Your profile</h2>
      {session ? (
        <>
          <p className="muted" style={{ marginTop: -4 }}>
            Your public player page:{" "}
            <Link href={`/players/${session.steamId}`}>view it →</Link>
          </p>
          <ProfileEditor />
        </>
      ) : (
        <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "start" }}>
          <p style={{ margin: 0 }}>Sign in with Steam to edit your display name, avatar and bio.</p>
          <a className="btn" href="/api/auth/steam/login">
            Sign in with Steam
          </a>
        </div>
      )}
    </section>
  );
}
