import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { getT } from "@/lib/serverI18n";
import { getSession } from "@/lib/auth";
import AvatarImage from "@/components/AvatarImage";
import { resolveName } from "@/lib/names";
import { ProfileSettingsBody } from "@/components/profile/ProfileSettingsModal";
import "./settings.css";

export const dynamic = "force-dynamic";

/**
 * Everything you can change about yourself, on one page.
 *
 * WHAT WAS MISSING. This page held a hero and three linked-account cards.
 * Your display name, your avatar, your bio, your country, the theme, the
 * accent, the language and the motion preference were all in a dialog opened
 * from the avatar menu in the left rail — and that menu went when the
 * duplicate avatar did, which left every one of them unreachable while the
 * rail's Settings button pointed here at the three cards.
 *
 * So the dialog's body is a component now (ProfileSettingsBody) and this page
 * renders it. One implementation, two frames: the profile page keeps the
 * dialog for a quick edit, this is the full page for the rail's button. The
 * connection cards it already had are inside that body, which is why they are
 * not repeated below.
 */
export default async function SettingsPage() {
  const t = getT();
  const session = getSession();

  if (!session) {
    return (
      <section className="panel">
        <h2>{t("settings.title")}</h2>
        <div className="empty-hint set-signin">
          <p>{t("settings.signInPrompt")}</p>
          <a className="btn btn-primary" href="/api/auth/steam/login">
            {t("settings.signInButton")}
          </a>
        </div>
      </section>
    );
  }

  const name = await resolveName(BigInt(session.steamId));

  return (
    <div className="set">
      <header className="set-head">
        <AvatarImage steamId={session.steamId} className="set-face" alt="" />

        <div className="set-id">
          <span className="set-kicker">{t("settings.title")}</span>
          {/* The name in the serif, as everywhere else a person is named. */}
          <h1 className="set-name">{name}</h1>
          <span className="set-steamid num">{session.steamId}</span>
        </div>

        <Link className="set-link" href="/profile">
          {t("settings.editProfile")}
          <ExternalLink size={14} aria-hidden focusable="false" />
        </Link>
      </header>

      <section className="panel set-panel">
        <ProfileSettingsBody />
      </section>
    </div>
  );
}
