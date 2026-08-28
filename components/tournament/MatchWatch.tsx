"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Eye, SlidersHorizontal, Tv } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import MatchAdminModal from "./MatchAdminModal";
import "./watch.css";

// How to watch this match, and — for the people who run it — how to fix it.
//
// The Watch button is GOTV. It used to be the game server's connect address,
// which is the wrong thing to hand a viewer twice over: it spends one of the
// server's player slots on somebody who is not playing, and it drops them into
// a live round where they can hear and be heard. GOTV takes no slot, is what
// tournament.cfg already turns on, and is the address a caster wants anyway.
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

/**
 * A steam:// link that actually launches something.
 *
 * `steam://connect/host:port` names an address and no game. Steam has to guess
 * which title it belongs to by querying the server, and when that fails — a
 * server still loading a map, a firewalled query port, a client that has never
 * run the game — the link does nothing at all, silently. That is the "watch
 * button does nothing" report.
 *
 * `rungameid/730` says Counter-Strike 2 outright and passes +connect as a
 * launch option, so there is nothing left to infer.
 */
const CS2_APP_ID = 730;
const steamConnect = (address: string) =>
  `steam://rungameid/${CS2_APP_ID}//+connect%20${encodeURIComponent(address)}`;

export default function MatchWatch({
  matchId,
  matchKey,
  teamA,
  teamB,
  state,
  isOrganizer,
}: {
  matchId: number;
  matchKey: string;
  teamA: string;
  teamB: string;
  state: string;
  /** Organizers and admins get the controls; nobody else sees the button. */
  isOrganizer: boolean;
}) {
  const { t } = useI18n();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

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

  const admin = isOrganizer && (
    <>
      <button className="btn btn-secondary mw-btn" onClick={() => setAdminOpen(true)}>
        <SlidersHorizontal size={15} />
        {t("matchAdmin.open")}
      </button>

      {adminOpen && (
        <MatchAdminModal
          matchId={matchId}
          matchKey={matchKey}
          teamA={teamA}
          teamB={teamB}
          state={state}
          onClose={() => setAdminOpen(false)}
        />
      )}
    </>
  );

  if (!detail) return admin ? <div className="mw">{admin}</div> : null;

  // Nothing to watch. A finished match is not a fault worth explaining, but the
  // people who run the match still need their controls in every state.
  if (!detail.connect && !detail.gotv) {
    return (
      <div className="mw">
        {detail.state !== "finished" && (
          <p className="mw-why">
            {detail.canSpectate ? t("match.noServerYet") : t("match.notAllowed")}
          </p>
        )}
        {admin}
      </div>
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
      <a className="btn btn-primary mw-btn" href={steamConnect(watch)}>
        <Tv size={15} />
        {detail.gotv ? t("match.watchGotv") : t("match.spectate")}
      </a>

      <button className="btn mw-btn" onClick={() => copy(watch, "watch")}>
        {copied === "watch" ? <Check size={15} /> : <Copy size={15} />}
        {copied === "watch" ? t("register.copied") : t("match.copyWatch")}
      </button>

      {/* The controls sit next to the address, because "copy the address and
          go and fix it" is one motion. Only rendered for the people who may. */}
      {admin}

      {/* The server itself, for anybody who actually needs to be in it. Only
          offered when it is a different address from the one above. */}
      {detail.connect && detail.gotv && (
        <a className="btn btn-secondary mw-btn" href={steamConnect(detail.connect)}>
          <Eye size={15} />
          {t("match.joinServer")}
        </a>
      )}
    </div>
  );
}
