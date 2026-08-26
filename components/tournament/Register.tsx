"use client";

import { useCallback, useState } from "react";
import { Check, Copy, RefreshCw, Users } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import "./register.css";

// Creating a team, and running it once created.
//
// Two states in one component because they are one journey: you arrive with no
// team, you make one, and the next thing you need is the link to fill it. A
// second page between those two would be a page whose only content is a link.

type Member = { steamId: string; displayName: string | null; captain: boolean };

type MyTeam = {
  id: number;
  name: string;
  inviteToken: string | null;
  captain: boolean;
  members: Member[];
};

/**
 * Where you are in the journey, shown at the top of both states.
 *
 * Registration is three things — make a team, fill it, wait for the start — and
 * without saying so the page after creating a team looks like it might be the
 * end. It is not: an unfilled team does not play.
 */
function Steps({ current, labels }: { current: 1 | 2 | 3; labels: [string, string, string] }) {
  return (
    <ol className="rg-steps" aria-label={labels.join(" · ")}>
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const state = n < current ? "done" : n === current ? "now" : "next";
        return (
          <li key={label} className={`rg-step ${state}`} aria-current={n === current ? "step" : undefined}>
            <span className="rg-step-dot">{state === "done" ? <Check size={12} /> : n}</span>
            <span className="rg-step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Register({
  tournamentId,
  slug,
  teamSize,
  invite,
  signedIn,
  origin,
  myTeam,
}: {
  tournamentId: number;
  slug: string;
  teamSize: number;
  invite: string | null;
  signedIn: boolean;
  origin: string;
  myTeam: MyTeam | null;
}) {
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [displayName, setDisplayName] = useState(
    myTeam?.members.find((m) => m.captain)?.displayName ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const stepLabels: [string, string, string] = [
    t("register.step1"),
    t("register.step2"),
    t("register.step3"),
  ];

  const post = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/tournament/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) setNotice(data.error);
      else setTimeout(() => window.location.reload(), 300);
      return data;
    } catch (err) {
      setNotice(String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  // Steam sign-in first, always. The team is attached to an account, so there
  // is nothing useful to do before there is one — and returnTo brings them back
  // here WITH the invite token still in the URL, which is the part that is easy
  // to get wrong and impossible to recover from.
  if (!signedIn) {
    const returnTo = `/tournaments/${slug}/register${invite ? `?invite=${invite}` : ""}`;
    return (
      <section className="panel rg">
        <Steps current={1} labels={stepLabels} />
        <div className="rg-centered">
          <p className="rg-lead">{t("register.signInFirst")}</p>
          <a
            className="btn btn-primary rg-btn-wide"
            href={`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {t("profile.signInButton")}
          </a>
        </div>
      </section>
    );
  }

  if (myTeam) {
    const link = myTeam.inviteToken
      ? `${origin}/tournaments/${slug}/join?team=${myTeam.inviteToken}`
      : null;

    const filled = myTeam.members.length;
    const missing = Math.max(0, teamSize - filled);
    const complete = missing === 0;

    const copy = async () => {
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard is blocked outside a secure context and in some in-app
        // browsers. The link is on screen as selectable text either way, so
        // this is a missing convenience rather than a dead end.
        setNotice(link);
      }
    };

    return (
      <section className="panel rg">
        <Steps current={complete ? 3 : 2} labels={stepLabels} />

        {notice && <p className="rg-notice">{notice}</p>}

        <header className="rg-head">
          <h2 className="rg-team-name">{myTeam.name}</h2>
          <span className={`rg-count ${complete ? "full" : ""}`}>
            <Users size={14} aria-hidden />
            {t("register.slotsFilled", { a: String(filled), b: String(teamSize) })}
          </span>
        </header>

        {/* The roster as slots rather than a list: an empty slot is the thing
            the captain has to act on, so it should be visible as a gap. */}
        <ul className="rg-slots" aria-label={t("register.rosterTitle")}>
          {Array.from({ length: Math.max(teamSize, filled) }, (_, i) => {
            const m = myTeam.members[i];
            return (
              <li key={m?.steamId ?? `empty-${i}`} className={`rg-slot ${m ? "taken" : "open"}`}>
                {m ? (
                  <>
                    <a className="rg-slot-name" href={`/players/${m.steamId}`}>
                      {m.displayName || m.steamId}
                    </a>
                    {m.captain && <span className="rg-cap">{t("register.captain")}</span>}
                  </>
                ) : (
                  <span className="rg-slot-empty">{t("register.emptySlot")}</span>
                )}
              </li>
            );
          })}
        </ul>

        <p className="rg-lead">
          {complete
            ? t("register.teamFull")
            : t("register.needMore", { n: String(missing) })}
        </p>

        {link && (
          <div className="rg-invite">
            <strong>{t("register.inviteTitle")}</strong>
            <p className="muted rg-hint">{t("register.inviteHint")}</p>

            <code className="rg-link">{link}</code>

            {/* Stacked on a phone, side by side above it — never overlapping,
                and each one wide enough to hit with a thumb. */}
            <div className="rg-actions">
              <button className="btn btn-primary" onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? t("register.copied") : t("commands.copy")}
              </button>
              {myTeam.captain && (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => post({ action: "team-link", teamId: myTeam.id })}
                  title={t("settings.rotateHint")}
                >
                  <RefreshCw size={14} />
                  {t("settings.rotate")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Your own tournament name. Set once and it is what the bracket, the
            scoreboard and the stats all call you for this event. */}
        <form
          className="rg-form"
          onSubmit={(e) => {
            e.preventDefault();
            post({ action: "display-name", teamId: myTeam.id, displayName });
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

          <button className="btn btn-secondary rg-btn-wide" disabled={busy}>
            {busy ? t("register.saving") : t("roster.setName")}
          </button>
        </form>
      </section>
    );
  }

  const tooShort = name.trim().length < 2;

  return (
    <section className="panel rg">
      <Steps current={1} labels={stepLabels} />

      {notice && <p className="rg-notice">{notice}</p>}

      <h2 className="rg-team-name">{t("register.createTitle")}</h2>
      <p className="rg-lead">{t("register.createHint", { n: String(teamSize) })}</p>

      {/* A grid, not a flex row with a button in it.
          The button used to be the last flex child of the same row as the
          inputs, which is what put it on top of the name field once the row ran
          out of width — the fields have `flex: 1 1 220px` and kept their basis
          while the button kept its intrinsic width. It now owns its own grid
          row, full width, below the fields it submits, where it cannot collide
          with anything at any viewport size. */}
      <form
        className="rg-form two-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (tooShort) return;
          post({ action: "create", tournamentId, name, tag, invite });
        }}
      >
        <label className="rg-field">
          <span>{t("register.teamName")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            required
            autoFocus
            placeholder={t("register.namePlaceholder")}
          />
        </label>

        <label className="rg-field">
          <span>{t("register.tag")}</span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            maxLength={8}
            placeholder={t("register.tagPlaceholder")}
          />
          <small className="rg-hint">{t("register.tagHint")}</small>
        </label>

        <button className="btn btn-primary rg-btn-wide" disabled={busy || tooShort}>
          {busy ? t("register.creating") : t("register.create")}
        </button>

        {/* Says why the button is disabled instead of leaving it inert and
            unexplained, which is the commonest way a form loses somebody. */}
        {tooShort && name.length > 0 && (
          <small className="rg-hint rg-warn">{t("register.nameTooShort")}</small>
        )}
      </form>
    </section>
  );
}
