"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import "./matchserver.css";

// Which server this match is on, in the page header.
//
// The page could say a match was live and never say where it was living. For
// anybody running an event that is the first question — six servers, six
// matches, and "go and look at the one that is wrong" needs a name. The name is
// not an address and leaks nothing, so unlike the connect string it is shown to
// everybody.
//
// Three states, because "no server" and "a server that is not ready yet" are
// different problems: one is waiting for the fleet, the other is a map loading.

type Wire = {
  state: string;
  serverName: string | null;
  serverIsUp: boolean;
};

export default function MatchServer({ matchId }: { matchId: number }) {
  const { t } = useI18n();
  const [wire, setWire] = useState<Wire | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/tournament/match?matchId=${matchId}`, { cache: "no-store" });
        if (!res.ok) return;

        const data: Wire = await res.json();
        if (alive) setWire(data);
      } catch {
        // Keeps the last answer rather than blinking to "unset" on one dropped
        // request, which would read as the server having been lost.
      }
    };

    load();
    const timer = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [matchId]);

  if (!wire) return null;

  /**
   * No server at all, a match that is over, a server still preparing, or the
   * server.
   *
   * "ready" in the match's own vocabulary means a server has been claimed and
   * the map is loading — which to a person reading the page is "setting up",
   * not "ready". The word is not reused.
   *
   * A finished match is checked FIRST, and that is the fix. serverIsUp is only
   * true while the state is ready or live, so an ended match fell into the
   * `!serverIsUp` branch and announced itself as still setting up — a match
   * with a result on the page and "Setting up" beside it. It kept its server
   * name on purpose ("which server did that run on" is asked afterwards), so
   * the honest thing to show is the name, told apart by tone rather than by
   * pretending the server is still coming.
   */
  const over = wire.state === "finished" || wire.state === "ended";

  const value = !wire.serverName
    ? t("match.serverUnset")
    : over
      ? wire.serverName
      : wire.state === "ready" || !wire.serverIsUp
        ? t("match.serverSettingUp")
        : wire.serverName;

  const tone = !wire.serverName
    ? "none"
    : over
      ? "done"
      : wire.serverIsUp && wire.state === "live"
        ? "on"
        : "wait";

  return (
    <span className={`msv msv-${tone}`}>
      <span className="msv-label">{t("match.serverLabel")}</span>
      <span className="msv-value">{value}</span>
    </span>
  );
}
