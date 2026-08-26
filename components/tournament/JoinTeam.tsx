"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";

// Accepting a team invite.
//
// One decision on the page, and the name you will carry — asked here because
// this is the only moment the player is definitely paying attention, and a
// name set now saves the captain chasing them for it later.

export default function JoinTeam({
  slug,
  token,
  teamName,
  teamSize,
  memberCount,
  full,
  alreadyIn,
  signedIn,
  started,
}: {
  slug: string;
  token: string;
  teamName: string;
  teamSize: number;
  memberCount: number;
  full: boolean;
  alreadyIn: boolean;
  signedIn: boolean;
  started: boolean;
}) {
  const { t } = useI18n();

  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [joined, setJoined] = useState(alreadyIn);

  const join = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/tournament/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "join", teamToken: token, displayName }),
      });
      const data = await res.json();
      if (data.error) setNotice(data.error);
      else setJoined(true);
    } catch (err) {
      setNotice(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (started) {
    return (
      <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "center" }}>
        <p style={{ margin: 0 }}>{t("register.started")}</p>
        <Link className="btn btn-primary" href={`/tournaments/${slug}`}>
          {t("register.seeBracket")}
        </Link>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "center" }}>
        <p style={{ margin: 0 }}>{t("join.done", { team: teamName })}</p>
        <Link className="btn btn-primary" href={`/tournaments/${slug}/register`}>
          {t("join.seeTeam")}
        </Link>
      </div>
    );
  }

  // Sign-in carries the token through, so the player comes back to this exact
  // team rather than to a page that has forgotten why they arrived.
  if (!signedIn) {
    const returnTo = `/tournaments/${slug}/join?team=${token}`;
    return (
      <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "center" }}>
        <p style={{ margin: 0 }}>{t("join.signIn", { team: teamName })}</p>
        <a className="btn btn-primary" href={`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`}>
          {t("profile.signInButton")}
        </a>
      </div>
    );
  }

  if (full) {
    return (
      <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "center" }}>
        <p style={{ margin: 0 }}>{t("join.full", { team: teamName })}</p>
        <Link className="btn btn-primary" href={`/tournaments/${slug}`}>
          {t("register.seeBracket")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rg">
      {notice && <p className="rg-notice">{notice}</p>}

      <p>{t("join.prompt", { team: teamName })}</p>
      <p className="muted rg-hint">
        {memberCount} / {teamSize} {t("tournaments.players").toLowerCase()}
      </p>

      <div className="rg-row">
        <label className="rg-field">
          <span>{t("register.yourName")}</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            placeholder={t("roster.displayPlaceholder")}
          />
        </label>

        <button className="btn btn-primary" disabled={busy} onClick={join}>
          {t("join.accept", { team: teamName })}
        </button>
      </div>

      <p className="muted rg-hint">{t("register.yourNameHint")}</p>
    </div>
  );
}
