"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Eye, Tv } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import "./watch.css";

// How to watch this match.
//
// The Watch button is GOTV. It used to be the game server's connect address,
// which is the wrong thing to hand a viewer twice over: it spends one of the
// server's player slots on somebody who is not playing, and it drops them into
// a live round where they can hear and be heard. GOTV takes no slot, is what
// tournament.cfg already turns on, and is the address a caster wants anyway.
//
// The direct connect stays, one step down, because an organizer joining to fix
// something genuinely does want the server itself.
//
// Polled rather than rendered once: startMatch claims a server, loads the map
// and only then goes live, and a series goes back to "ready" between maps — so
// the address appears and disappears several times over a BO3, and a page that
// asked once would be wrong for most of it.

type Detail = {
  connect: string | null;
  gotv: string | null;
  canSpectate: boolean;
  serverIsUp: boolean;
  state: string;
};

export default function MatchWatch({ matchId }: { matchId: number }) {
  const { t } = useI18n();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/tournament/match?matchId=${matchId}`, { cache: "no-store" });
        if (!res.ok) return;

        const data: Detail = await res.json();
        if (alive) setDetail(data);
      } catch {
        // Leaves the last answer on screen, which is better than blanking a
        // button somebody was about to click.
      }
    };

    load();
    const timer = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [matchId]);

  if (!detail) return null;

  // Nothing to watch, and a finished match is not a fault worth explaining.
  if (!detail.connect && !detail.gotv) {
    if (detail.state === "finished") return null;

    return (
      <p className="mw-why">
        {detail.canSpectate ? t("match.noServerYet") : t("match.notAllowed")}
      </p>
    );
  }

  // GOTV when there is one. Falling back to the server itself rather than
  // showing nothing: an organizer who has not set a GOTV address should still
  // get a working button, not a silent absence they have to diagnose.
  const watch = detail.gotv ?? detail.connect!;

  const copy = (value: string, what: string) => {
    navigator.clipboard?.writeText(`connect ${value}`);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="mw">
      <a className="btn btn-primary mw-btn" href={`steam://connect/${watch}`}>
        <Tv size={15} />
        {detail.gotv ? t("match.watchGotv") : t("match.spectate")}
      </a>

      <button className="btn mw-btn" onClick={() => copy(watch, "watch")}>
        {copied === "watch" ? <Check size={15} /> : <Copy size={15} />}
        {copied === "watch" ? t("register.copied") : t("match.copyWatch")}
      </button>

      {/* The server itself, for anybody who actually needs to be in it. Only
          offered when it is a different address from the one above. */}
      {detail.connect && detail.gotv && (
        <a className="btn btn-secondary mw-btn" href={`steam://connect/${detail.connect}`}>
          <Eye size={15} />
          {t("match.joinServer")}
        </a>
      )}
    </div>
  );
}
