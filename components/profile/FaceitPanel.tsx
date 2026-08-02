"use client";

import { useEffect, useState } from "react";

// FACEIT standing on the profile.
//
// There is no "connect" button because there is nothing to connect: FACEIT
// resolves a player from the Steam id we already signed them in with, so anyone
// with a FACEIT account is linked the moment they log in. Fetched lazily when
// the tab is opened.

type Stats = {
  matches: number | null;
  wins: number | null;
  winRate: number | null;
  kd: number | null;
  adr: number | null;
  hs: number | null;
  krRatio: number | null;
  entryRate: number | null;
  entrySuccess: number | null;
  clutch1v1: number | null;
  clutch1v2: number | null;
  utilityDamagePerRound: number | null;
  flashesPerRound: number | null;
  longestWinStreak: number | null;
  currentWinStreak: number | null;
  recentResults: boolean[];
};

type Profile = {
  playerId: string;
  nickname: string;
  country: string | null;
  avatar: string | null;
  url: string;
  level: number | null;
  elo: number | null;
  region: string | null;
  stats: Stats | null;
};

type State =
  | { kind: "loading" }
  | { kind: "unlinked" }
  | { kind: "error"; message: string }
  | { kind: "ready"; profile: Profile };

/** FACEIT's own level ramp: grey 1, green 2-3, yellow 4-7, orange 8-9, red 10. */
function levelColor(level: number | null): string {
  if (!level) return "var(--color-neutral-500)";
  if (level >= 10) return "#e8433a";
  if (level >= 8) return "#ff6c20";
  if (level >= 4) return "#ffc11a";
  if (level >= 2) return "#1fd014";
  return "#eeeeee";
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
/** FACEIT returns the rate fields as 0..1 fractions. */
const frac = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const dec = (v: number | null, places = 2) => (v == null ? "—" : v.toFixed(places));

export default function FaceitPanel({ steamId }: { steamId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/faceit/${steamId}`)
      .then(async (r) => {
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok) return setState({ kind: "error", message: json.error ?? "Could not reach FACEIT." });
        setState(json.linked ? { kind: "ready", profile: json.profile } : { kind: "unlinked" });
      })
      .catch(() => !cancelled && setState({ kind: "error", message: "Could not reach FACEIT." }));
    return () => {
      cancelled = true;
    };
  }, [steamId]);

  if (state.kind === "loading") return <p className="muted">Reading your FACEIT profile…</p>;

  if (state.kind === "error") {
    return (
      <p className="skin-note skin-note-warn">
        <span>
          <strong>FACEIT unavailable.</strong> {state.message}
        </span>
      </p>
    );
  }

  if (state.kind === "unlinked") {
    return (
      <div className="empty-hint">
        <p style={{ margin: 0 }}>No FACEIT account is registered to this Steam ID.</p>
        <p className="muted" style={{ fontSize: 13 }}>
          Play a match on FACEIT with this Steam account and it will appear here — there is nothing to link.
        </p>
      </div>
    );
  }

  const { profile } = state;
  const s = profile.stats;

  return (
    <div className="fc">
      <div className="fc-head">
        <span className="fc-level" style={{ borderColor: levelColor(profile.level) }}>
          <span className="num" style={{ color: levelColor(profile.level) }}>{profile.level ?? "—"}</span>
          <span className="fc-level-k">Level</span>
        </span>

        <div className="fc-id">
          <a className="fc-nick" href={profile.url} target="_blank" rel="noreferrer noopener">
            {profile.nickname} ↗
          </a>
          <span className="fc-meta">
            {profile.region ?? "—"}
            {profile.country ? ` · ${profile.country.toUpperCase()}` : ""}
          </span>
        </div>

        <div className="fc-elo">
          <span className="num fc-elo-v">{profile.elo ?? "—"}</span>
          <span className="pro-stat-k">FACEIT ELO</span>
        </div>

        {s && s.recentResults.length > 0 && (
          <div className="fc-recent" aria-label="Recent results, newest first">
            {s.recentResults.map((won, i) => (
              <span key={i} className={`fc-pip ${won ? "win" : "loss"}`} title={won ? "Win" : "Loss"}>
                {won ? "W" : "L"}
              </span>
            ))}
          </div>
        )}
      </div>

      {!s ? (
        <p className="muted">FACEIT has no lifetime CS2 stats for this account yet.</p>
      ) : (
        <>
          <div className="pro-headline" style={{ borderTop: 0, paddingTop: 0 }}>
            {[
              { k: "K/D", v: dec(s.kd) },
              { k: "ADR", v: dec(s.adr, 1) },
              { k: "Headshots", v: pct(s.hs) },
              { k: "Win rate", v: pct(s.winRate), sub: s.matches ? `${s.matches} matches` : undefined },
              { k: "K/R", v: dec(s.krRatio) },
              { k: "Win streak", v: s.currentWinStreak ?? "—", sub: s.longestWinStreak ? `best ${s.longestWinStreak}` : undefined },
            ].map((f) => (
              <div key={f.k} className="pro-stat">
                <span className="num pro-stat-v">{f.v}</span>
                <span className="pro-stat-k">{f.k}</span>
                {f.sub && <span className="pro-stat-sub">{f.sub}</span>}
              </div>
            ))}
          </div>

          <h3 className="fc-sub">Openings and clutches</h3>
          <div className="pro-meters">
            {[
              { label: "Entry success", display: frac(s.entrySuccess), pct: (s.entrySuccess ?? 0) * 100 },
              { label: "Entry rate", display: frac(s.entryRate), pct: (s.entryRate ?? 0) * 100 },
              { label: "1v1 won", display: frac(s.clutch1v1), pct: (s.clutch1v1 ?? 0) * 100 },
              { label: "1v2 won", display: frac(s.clutch1v2), pct: (s.clutch1v2 ?? 0) * 100 },
            ].map((m) => (
              <div key={m.label} className="pro-meter">
                <span className="pro-meter-k">{m.label}</span>
                <div className="pro-meter-track">
                  <div className="pro-meter-fill" style={{ width: `${Math.min(100, Math.max(0, m.pct))}%` }} />
                </div>
                <span className="num pro-meter-v">{m.display}</span>
              </div>
            ))}
          </div>

          <h3 className="fc-sub">Utility</h3>
          <div className="pro-details">
            {[
              { k: "Util dmg / round", v: dec(s.utilityDamagePerRound, 2) },
              { k: "Flashes / round", v: dec(s.flashesPerRound, 2) },
              { k: "Matches won", v: s.wins ?? "—" },
              { k: "Matches", v: s.matches ?? "—" },
            ].map((f) => (
              <div key={f.k} className="pro-stat">
                <span className="num pro-stat-v">{f.v}</span>
                <span className="pro-stat-k">{f.k}</span>
              </div>
            ))}
          </div>

          <p className="pro-section-note" style={{ marginTop: "var(--space-6)" }}>
            Lifetime FACEIT figures · refreshed every 15 minutes
          </p>
        </>
      )}
    </div>
  );
}
