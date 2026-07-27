import { getSession } from "@/lib/auth";
import DiscordConnect from "@/components/DiscordConnect";
import GoogleConnect from "@/components/GoogleConnect";
import Link from "next/link";
import AvatarImage from "@/components/AvatarImage";
import { resolveName } from "@/lib/names";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = getSession();

  if (!session) {
    return (
      <section className="panel">
        <h2>Settings</h2>
        <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "start" }}>
          <p style={{ margin: 0 }}>Sign in to manage your settings.</p>
          <a className="btn" href="/api/auth/steam/login">
            Sign in with Steam
          </a>
        </div>
      </section>
    );
  }

  const name = await resolveName(BigInt(session.steamId));

  return (
    <>
      <section className="panel">
        <div className="player-hero">
          <div className="player-avatar">
            <AvatarImage steamId={session.steamId} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 className="hero-name">
              {name}
            </h1>
            <div className="hero-sub">
              SteamID64 {session.steamId}
            </div>
          </div>
          <div className="player-hero-actions">
            <Link className="btn small secondary" href="/profile">
              ✎ Edit profile
            </Link>
          </div>
        </div>
      </section>
      
      <section className="panel">
        <h2>Linked Accounts</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          Link multiple platforms to your account so you can log in from anywhere and retain your stats.
        </p>
        <div className="split-cards">
          <div className="side-card">
            <DiscordConnect />
          </div>
          <div className="side-card">
            <GoogleConnect />
          </div>
        </div>
      </section>
    </>
  );
}
