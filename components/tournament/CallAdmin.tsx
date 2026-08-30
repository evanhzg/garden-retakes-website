"use client";

import { useState } from "react";
import { LifeBuoy } from "lucide-react";

import { useI18n } from "@/components/I18nProvider";
import "./adminalerts.css";

/**
 * "Call an admin", from the match page.
 *
 * The in-game `.admin` command already existed and is the right tool when you
 * are in the server — it pauses at the next freezetime, which is most of the
 * point. This is for everything that happens outside it: a server that never
 * came up, a player who cannot connect, a veto that stalled. Those are exactly
 * the moments when nobody can type .admin, because nobody is in a server.
 *
 * Open to anybody, not just the two captains. The person who notices is not
 * reliably the person with the role, and an alert that turns out to be nothing
 * costs an organizer one click to dismiss.
 */
export default function CallAdmin({ matchId }: { matchId: number }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);

  const send = async () => {
    setState("sending");
    try {
      const res = await fetch("/api/tournament/alert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "call", matchId, reason }),
      });
      const data = await res.json().catch(() => ({}));

      // `alreadyOpen` is a success, not a failure: somebody has already called
      // and an organizer is already being told. Saying "sent" is the truth.
      setState(res.ok && data?.ok ? "sent" : "error");
      setAsking(false);
    } catch {
      setState("error");
    }
  };

  if (state === "sent") {
    return <span className="ca-sent">{t("alerts.called")}</span>;
  }

  if (asking) {
    return (
      <span className="ca-ask">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("alerts.reasonPlaceholder")}
          maxLength={240}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
            if (e.key === "Escape") setAsking(false);
          }}
        />
        <button className="ca-go" onClick={send} disabled={state === "sending"}>
          {t("alerts.send")}
        </button>
      </span>
    );
  }

  return (
    <button
      className={`ca-btn ${state === "error" ? "err" : ""}`}
      onClick={() => setAsking(true)}
      title={t("alerts.call")}
    >
      <LifeBuoy size={14} />
      <span>{state === "error" ? t("alerts.callFailed") : t("alerts.call")}</span>
    </button>
  );
}
