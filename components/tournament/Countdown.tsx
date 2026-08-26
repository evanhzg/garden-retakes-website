"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { countdown, formatRemaining, type EditionState } from "@/lib/tournament/edition";
import "./countdown.css";

// What the page says about time.
//
// A client component because it ticks, and because the answer depends on the
// reader's clock rather than the server's render time — a page cached for
// thirty seconds would show a countdown thirty seconds stale, which is the one
// number where that is unacceptable.
//
// The window matters: a tournament three weeks out shows a date, because
// "20d 4h 13m" changes nothing anybody does. Inside a day it counts, because
// minutes are something people act on.

export default function Countdown({
  startsAt,
  startedAt,
  state,
  published,
  maxTeams,
  teamCount,
  visibility,
}: {
  startsAt: string | null;
  startedAt: string | null;
  state: string;
  published: boolean;
  maxTeams: number;
  teamCount: number;
  visibility: string;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => new Date());

  const edition: EditionState = {
    published,
    state,
    visibility: visibility === "invite" ? "invite" : "public",
    maxTeams,
    teamCount,
    startsAt: startsAt ? new Date(startsAt) : null,
    startedAt: startedAt ? new Date(startedAt) : null,
  };

  const view = countdown(edition, now);

  // Only ticks while there is something ticking. A finished or unscheduled
  // tournament should not hold a timer open for the life of the tab.
  useEffect(() => {
    if (view.kind !== "counting") return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [view.kind]);

  if (view.kind === "none") return null;

  if (view.kind === "live") {
    return (
      <p className="cd cd-live">
        <span className="cd-dot" aria-hidden />
        {t("countdown.live")}
      </p>
    );
  }

  if (view.kind === "starting-soon") {
    return (
      <p className="cd cd-soon">
        {t("countdown.soon")}
        <span className="cd-note">{t("countdown.soonHint")}</span>
      </p>
    );
  }

  if (view.kind === "scheduled") {
    return (
      <p className="cd">
        {t("countdown.scheduled")}{" "}
        <strong>
          {view.startsAt.toLocaleString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </strong>
      </p>
    );
  }

  return (
    <p className="cd cd-counting">
      {t("countdown.starts")} <strong className="num">{formatRemaining(view.msRemaining)}</strong>
    </p>
  );
}
