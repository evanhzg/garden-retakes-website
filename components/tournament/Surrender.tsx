"use client";

import { useState } from "react";
import { Flag } from "lucide-react";

import { useI18n } from "@/components/I18nProvider";
import "./surrender.css";

/**
 * "Concede the map", from the match page.
 *
 * The in-game `.gg` already exists and needs the whole team to ask within
 * twenty seconds, because a live server has no notion of authority — everybody
 * in it is equal and the only defence against one angry player throwing the map
 * is unanimity. The website knows who the captain is, so here it is the
 * captain's call and the confirmation is a dialog.
 *
 * Two-step on purpose, and the second step says the score it will produce.
 * "Are you sure?" is a question nobody reads; "this ends the map 13-4 to
 * Cobras" is one they do.
 */
export default function Surrender({
  matchId,
  /** "a" | "b" for an organizer conceding on a team's behalf; omitted for players. */
  slot,
  /** Shown on the confirm step, so the button says what it will do. */
  teamName,
}: {
  matchId: number;
  slot?: "a" | "b";
  teamName?: string;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "asking" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setState("sending");
    try {
      const res = await fetch("/api/tournament/surrender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId, slot }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.ok) {
        setState("done");
        // The board, the scoreline and the bracket all change at once, and this
        // component knows about none of them. A reload is the honest way to
        // show a result that touched the whole page.
        setTimeout(() => window.location.reload(), 900);
        return;
      }

      // The route's refusals are written to be read by a person — "Only your
      // team's captain can concede" — so they are shown rather than replaced
      // with a generic failure.
      setError(typeof data?.error === "string" ? data.error : t("surrender.failed"));
      setState("error");
    } catch {
      setError(t("surrender.failed"));
      setState("error");
    }
  };

  if (state === "done") {
    return <span className="sr-done">{t("surrender.done")}</span>;
  }

  if (state === "asking" || state === "sending") {
    return (
      <span className="sr-ask">
        <span className="sr-warn">
          {teamName ? t("surrender.confirmTeam", { team: teamName }) : t("surrender.confirm")}
        </span>
        <button className="sr-go" onClick={send} disabled={state === "sending"}>
          {t("surrender.yes")}
        </button>
        <button className="sr-no" onClick={() => setState("idle")} disabled={state === "sending"}>
          {t("surrender.no")}
        </button>
      </span>
    );
  }

  return (
    <button
      className={`sr-btn ${state === "error" ? "err" : ""}`}
      onClick={() => {
        setError(null);
        setState("asking");
      }}
      title={error ?? t("surrender.title")}
    >
      <Flag size={14} />
      <span>{state === "error" ? (error ?? t("surrender.failed")) : t("surrender.title")}</span>
    </button>
  );
}
