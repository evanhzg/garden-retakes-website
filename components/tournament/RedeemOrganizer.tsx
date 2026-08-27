"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import "./register.css";

// Accepting an organizer invite. One decision on the page.
//
// Reuses the register stylesheet rather than growing a third one: this is the
// same shape as JoinTeam — a sentence, a state, and one button — and the two
// should not drift apart because they were styled in different files.

export default function RedeemOrganizer({
  token,
  problem,
  signedIn,
  kind,
  tournamentName,
  tournamentSlug,
}: {
  token: string;
  /** Decided on the server; null means the invite is good. */
  problem: "invalid" | "used" | "expired" | null;
  signedIn: boolean;
  kind: "registry" | "tournament";
  tournamentName: string | null;
  tournamentSlug: string | null;
}) {
  const { t } = useI18n();

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (problem) {
    return (
      <div className="rg-centered">
        <p className="rg-lead">{t(`organizerInvite.${problem}`)}</p>
        <Link className="btn btn-primary rg-btn-wide" href="/tournaments">
          {t("tstats.browse")}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rg-centered">
        <p className="rg-lead">
          <Check size={16} />{" "}
          {kind === "tournament"
            ? t("organizerInvite.doneTournament", { name: tournamentName ?? "" })
            : t("organizerInvite.doneRegistry")}
        </p>
        <Link
          className="btn btn-primary rg-btn-wide"
          href={kind === "tournament" && tournamentSlug ? `/tournaments/${tournamentSlug}` : "/tournaments"}
        >
          {t("organizerInvite.goManage")}
        </Link>
      </div>
    );
  }

  // Sign-in carries the token through, so the invite survives the round trip to
  // Steam and back. Dropping it here is unrecoverable — the link is the only
  // copy most people have.
  if (!signedIn) {
    const returnTo = `/organizers/join?invite=${encodeURIComponent(token)}`;
    return (
      <div className="rg-centered">
        <p className="rg-lead">{t("organizerInvite.signIn")}</p>
        <a
          className="btn btn-primary rg-btn-wide"
          href={`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`}
        >
          {t("profile.signInButton")}
        </a>
      </div>
    );
  }

  const accept = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/organizers/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.ok) setDone(true);
      else setNotice(t(`organizerInvite.${data.error}`) || String(data.error));
    } catch (err) {
      setNotice(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rg">
      {notice && <p className="rg-notice">{notice}</p>}

      <div className="rg-centered">
        <ShieldCheck size={28} />
        <p className="rg-lead">
          {kind === "tournament"
            ? t("organizerInvite.offerTournament", { name: tournamentName ?? "" })
            : t("organizerInvite.offerRegistry")}
        </p>
        <p className="rg-hint">
          {kind === "tournament"
            ? t("organizerInvite.hintTournament")
            : t("organizerInvite.hintRegistry")}
        </p>

        <button className="btn btn-primary rg-btn-wide" disabled={busy} onClick={accept}>
          {busy ? t("register.saving") : t("organizerInvite.accept")}
        </button>
      </div>
    </div>
  );
}
