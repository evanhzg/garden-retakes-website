"use client";

import { useCallback, useState } from "react";
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
      <section className="panel">
        <div className="empty-hint" style={{ display: "grid", gap: 14, justifyItems: "center" }}>
          <p style={{ margin: 0 }}>{t("register.signInFirst")}</p>
          <a className="btn btn-primary" href={`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`}>
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

    return (
      <section className="panel rg">
        {notice && <p className="rg-notice">{notice}</p>}

        <h2 className="rg-team-name">{myTeam.name}</h2>
        <p className="muted">
          {myTeam.members.length} / {teamSize} {t("tournaments.players").toLowerCase()}
        </p>

        {link && (
          <div className="rg-invite">
            <div>
              <strong>{t("register.inviteTitle")}</strong>
              <p className="muted rg-hint">{t("register.inviteHint")}</p>
            </div>
            <code className="rg-link">{link}</code>
            <button className="btn btn-primary" onClick={() => navigator.clipboard?.writeText(link)}>
              {t("commands.copy")}
            </button>
            {myTeam.captain && (
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => post({ action: "team-link", teamId: myTeam.id })}
                title={t("settings.rotateHint")}
              >
                {t("settings.rotate")}
              </button>
            )}
          </div>
        )}

        <ul className="rg-members">
          {myTeam.members.map((m) => (
            <li key={m.steamId}>
              <a href={`/players/${m.steamId}`}>{m.displayName || m.steamId}</a>
              {m.captain && <span className="rg-cap">★</span>}
            </li>
          ))}
        </ul>

        {/* Your own tournament name. Set once and it is what the bracket, the
            scoreboard and the stats all call you for this event. */}
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
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => post({ action: "display-name", teamId: myTeam.id, displayName })}
          >
            {t("roster.setName")}
          </button>
        </div>

        <p className="muted rg-hint">{t("register.yourNameHint")}</p>
      </section>
    );
  }

  return (
    <section className="panel rg">
      {notice && <p className="rg-notice">{notice}</p>}

      <h2>{t("register.createTitle")}</h2>
      <p className="muted rg-hint">{t("register.createHint", { n: String(teamSize) })}</p>

      <form
        className="rg-row"
        onSubmit={(e) => {
          e.preventDefault();
          post({ action: "create", tournamentId, name, tag, invite });
        }}
      >
        <label className="rg-field">
          <span>{t("register.teamName")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} required />
        </label>

        <label className="rg-field rg-narrow">
          <span>{t("register.tag")}</span>
          <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={8} />
        </label>

        <button className="btn btn-primary" disabled={busy || name.trim().length < 2}>
          {t("register.create")}
        </button>
      </form>
    </section>
  );
}
