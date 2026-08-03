"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from '@/components/I18nProvider';
import "./login.css";

// Steam is first and visually dominant: it is the only provider that carries a
// CS2 identity, so it is the one that makes the ladder and profile work.
const PROVIDERS = [
  {
    id: "steam",
    name: "Steam",
    note: "Links your CS2 stats, rank and inventory",
    primary: true,
    mark: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
        <path d="M12 0C5.8 0 .7 4.7 0 10.8l6.4 2.7a3.4 3.4 0 0 1 1.9-.6h.2l2.9-4.2v-.1a4.5 4.5 0 1 1 4.5 4.5h-.1l-4.1 3v.2a3.4 3.4 0 0 1-6.7.7L.4 15A12 12 0 1 0 12 0Zm-4.5 18.2 -1.5-.6a2.6 2.6 0 0 0 4.7-1.5 2.6 2.6 0 0 0-3.5-2.4l1.5.6a1.9 1.9 0 1 1-1.2 3.9Zm11-5.2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-1a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
      </svg>
    ),
  },
  {
    id: "google",
    name: "Google",
    note: "Party games only",
    mark: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6Z" />
        <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9a7 7 0 0 1-10.4-3.7H1.6v3A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.5 14.6a7.1 7.1 0 0 1 0-4.6v-3H1.6a12 12 0 0 0 0 10.6l3.9-3Z" />
        <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.6 11.6 0 0 0 1.6 7l3.9 3A7 7 0 0 1 12 4.8Z" />
      </svg>
    ),
  },
  {
    id: "discord",
    name: "Discord",
    note: "Party games only",
    mark: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="#5865F2" aria-hidden>
        <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5a15 15 0 0 1 4.3 2.2 20 20 0 0 0-14.8 0A15 15 0 0 1 9 3.5L8.6 3a19.8 19.8 0 0 0-5 1.4C.7 8.8-.1 13.1.3 17.3a20 20 0 0 0 6 3l1.2-1.7a13 13 0 0 1-2-1l.5-.4a14.3 14.3 0 0 0 12.2 0l.5.4a13 13 0 0 1-2 1l1.2 1.7a20 20 0 0 0 6-3c.5-4.9-.8-9.1-3.6-12.9ZM8 14.7c-1.2 0-2.1-1.1-2.1-2.4S6.8 9.9 8 9.9s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
      </svg>
    ),
  },
];

export default function GamesLoginPage() {
    const { t } = useI18n();

  const searchParams = useSearchParams();
  const raw = searchParams?.get("returnTo") || "/games";
  // Only same-site paths — an absolute URL here would be an open redirect.
  const returnTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/games";

  return (
    <div className="glogin">
      <div className="glogin-card">
        <Link href="/games" className="glogin-back">
          {t("auto.page._games_hub")}
                          </Link>

        <span className="glogin-kicker hand">{t("auto.page.one_account_every_game")}</span>
        <h1 className="glogin-title">{t("auto.page.sign_in_to_play")}</h1>
        <p className="glogin-sub">
          {t("auto.page.your_lobbies_elo_and_daily_str")}
                          </p>

        <div className="glogin-providers">
          {PROVIDERS.map((p) => (
            <a
              key={p.id}
              className={`glogin-btn${p.primary ? " is-primary" : ""}`}
              href={`/api/auth/${p.id}/login?returnTo=${encodeURIComponent(returnTo)}`}
            >
              <span className="glogin-btn-mark">{p.mark}</span>
              <span className="glogin-btn-text">
                <b>{t("auto.page.continue_with")} {p.name}</b>
                <small>{p.note}</small>
              </span>
              <span className="glogin-btn-go" aria-hidden>→</span>
            </a>
          ))}
        </div>

        <p className="glogin-foot">
          {t("auto.page.not_ready_yet")} <Link href="/games">{t("auto.page.browse_the_games")}</Link> {t("auto.page._the_daily_puzzles_are_playabl")}
                          </p>
      </div>
    </div>
  );
}
