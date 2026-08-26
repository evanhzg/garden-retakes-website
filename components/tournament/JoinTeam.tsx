"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Users } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import "./register.css";

// Accepting a team invite.
//
// One decision on the page, and the name you will carry — asked here because
// this is the only moment the player is definitely paying attention, and a
// name set now saves the captain chasing them for it later.

/**
 * Every terminal state on this page: a sentence and one button out of it.
 *
 * Five of them were the same eight lines of inline-styled JSX repeated with a
 * different string, which is how the button widths had already drifted apart.
 */
function Outcome({
  message,
  href,
  action,
}: {
  message: string;
  href: string;
  action: string;
}) {
  return (
    <div className="rg-centered">
      <p className="rg-lead">{message}</p>
      <Link className="btn btn-primary rg-btn-wide" href={href}>
        {action}
      </Link>
    </div>
  );
}

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
      <Outcome
        message={t("register.started")}
        href={`/tournaments/${slug}`}
        action={t("register.seeBracket")}
      />
    );
  }

  if (joined) {
    return (
      <Outcome
        message={t("join.done", { team: teamName })}
        href={`/tournaments/${slug}/register`}
        action={t("join.seeTeam")}
      />
    );
  }

  // Sign-in carries the token through, so the player comes back to this exact
  // team rather than to a page that has forgotten why they arrived.
  if (!signedIn) {
    const returnTo = `/tournaments/${slug}/join?team=${token}`;
    return (
      <div className="rg-centered">
        <p className="rg-lead">{t("join.signIn", { team: teamName })}</p>
        <a
          className="btn btn-primary rg-btn-wide"
          href={`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`}
        >
          {t("profile.signInButton")}
        </a>
      </div>
    );
  }

  if (full) {
    return (
      <Outcome
        message={t("join.full", { team: teamName })}
        href={`/tournaments/${slug}`}
        action={t("register.seeBracket")}
      />
    );
  }

  return (
    <div className="rg">
      {notice && <p className="rg-notice">{notice}</p>}

      <header className="rg-head">
        <p className="rg-lead" style={{ margin: 0 }}>
          {t("join.prompt", { team: teamName })}
        </p>
        <span className="rg-count">
          <Users size={14} aria-hidden />
          {t("register.slotsFilled", { a: String(memberCount), b: String(teamSize) })}
        </span>
      </header>

      {/* Same grid as the create form: field, then a full-width button on its
          own row. The flex row this replaced put the accept button — which
          carries a team name and so is often wide — beside a `flex: 1 1 220px`
          input, and the two fought for the same line on a phone. */}
      <form
        className="rg-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) join();
        }}
      >
        <label className="rg-field">
          <span>{t("register.yourName")}</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            placeholder={t("roster.displayPlaceholder")}
          />
          <small className="rg-hint">{t("register.yourNameHint")}</small>
        </label>

        <button className="btn btn-primary rg-btn-wide" disabled={busy}>
          <Check size={15} />
          {busy ? t("register.saving") : t("join.accept", { team: teamName })}
        </button>
      </form>
    </div>
  );
}
