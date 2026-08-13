import { getT } from "@/lib/serverI18n";
import { getSession } from "@/lib/auth";
import DiscordConnect from "@/components/DiscordConnect";
import GoogleConnect from "@/components/GoogleConnect";
import AllstarConnect from "@/components/AllstarConnect";
import Link from "next/link";
import AvatarImage from "@/components/AvatarImage";
import { resolveName } from "@/lib/names";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const t = getT();
  const session = getSession();

  if (!session) {
    return (
      <section className="panel">
        <h2>{t("settings.title")}</h2>
        <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "start" }}>
          <p style={{ margin: 0 }}>{t("settings.signInPrompt")}</p>
          <a className="btn" href="/api/auth/steam/login">
            {t("settings.signInButton")}
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
              {t("settings.steamIdPrefix")} {session.steamId}
            </div>
          </div>
          <div className="player-hero-actions">
            <Link className="btn small secondary" href="/profile">
              {t("settings.editProfile")}
            </Link>
          </div>
        </div>
      </section>
      
      <section className="panel">
        <h2>{t("settings.linkedAccounts.title")}</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          {t("settings.linkedAccounts.description")}
        </p>
        <div className="split-cards">
          <div className="side-card">
            <DiscordConnect />
          </div>
          <div className="side-card">
            <GoogleConnect />
          </div>
          <div className="side-card">
            <AllstarConnect />
          </div>
        </div>
      </section>
    </>
  );
}
