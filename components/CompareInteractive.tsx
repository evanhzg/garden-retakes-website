"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ratingClass } from "@/lib/stats";
import { RadarCompare, TrendCompare } from "@/components/stats/charts";

type PlayerSummary = {
  steamId: string;
  name: string;
  elo: number;
  peakElo: number;
  rank: number;
  avatarSrc: string;
};

// ... type definitions for metrics and stats

export default function CompareInteractive({
  ladder,
  seasonName,
  statsA,
  statsB,
  mapStatsA,
  mapStatsB,
  sidesA,
  sidesB,
  trendPoints,
  nameA,
  nameB,
  playerAInfo,
  playerBInfo,
  metrics,
  rankedOnly
}: {
  ladder: PlayerSummary[];
  seasonName: string;
  statsA: any;
  statsB: any;
  mapStatsA: any;
  mapStatsB: any;
  sidesA?: { t: any; ct: any } | null;
  sidesB?: { t: any; ct: any } | null;
  trendPoints?: { label: string; a: number | null; b: number | null }[];
  nameA: string | null;
  nameB: string | null;
  playerAInfo?: PlayerSummary;
  playerBInfo?: PlayerSummary;
  metrics: { label: string, key: string, format: string, lowerIsBetter?: boolean }[];
  rankedOnly: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const currentA = searchParams.get("a");
  const currentB = searchParams.get("b");

  // Local selection state before pushing to URL
  const [pickA, setPickA] = useState<string | null>(currentA);
  const [pickB, setPickB] = useState<string | null>(currentB);

  // If both selected in state, but not yet in URL, we wait for navigation.
  // Actually, better: pick A, pick B -> router.push immediately.
  const handlePick = (steamId: string) => {
    if (!pickA) {
      setPickA(steamId);
    } else if (!pickB && steamId !== pickA) {
      setPickB(steamId);
      router.push(`/stats/compare?a=${pickA}&b=${steamId}${rankedOnly ? "&ranked=1" : ""}`);
    }
  };

  const reset = () => {
    setPickA(null);
    setPickB(null);
    router.push(`/stats/compare${rankedOnly ? "?ranked=1" : ""}`);
  };

  // Render Roster Selection
  if (!statsA || !statsB) {
    return (
      <section className="panel">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h2>Player comparison — {seasonName}</h2>
          <p className="muted">
            {!pickA ? "Select Player A to begin." : "Select Player B to compare."}
          </p>
          <div style={{ marginTop: 12 }}>
            <label className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input 
                type="checkbox" 
                checked={rankedOnly} 
                onChange={(e) => {
                  router.push(`/stats/compare?${e.target.checked ? "ranked=1" : ""}`);
                }}
              />
              Ranked only
            </label>
          </div>
        </div>

        <div className="cmp-roster">
          {ladder.map(p => {
            const isPickedA = p.steamId === pickA;
            const isPickedB = p.steamId === pickB;
            const isPicked = isPickedA || isPickedB;
            
            return (
              <button 
                key={p.steamId}
                className={`cmp-roster-card ${isPicked ? "picked" : ""} ${isPickedA ? "picked-a" : ""} ${isPickedB ? "picked-b" : ""}`}
                onClick={() => handlePick(p.steamId)}
                disabled={isPicked}
              >
                <div className="crc-avatar">
                  <img src={p.avatarSrc} alt={p.name} />
                </div>
                <div className="crc-info">
                  <div className="crc-name">{p.name}</div>
                  <div className="crc-elo">{p.elo} CSR</div>
                </div>
                {isPickedA && <div className="crc-badge badge-a">A</div>}
                {isPickedB && <div className="crc-badge badge-b">B</div>}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // Formatting helpers based on metrics config
  const formatValue = (val: number, format: string) => {
    if (format === "fixed2") return val.toFixed(2);
    if (format === "fixed0") return val.toFixed(0);
    if (format === "fixed1") return val.toFixed(1);
    if (format === "pct") return `${val.toFixed(0)}%`;
    return String(val);
  };

  // Gather all unique maps played by either player
  const allMaps = Array.from(new Set([...Object.keys(mapStatsA || {}), ...Object.keys(mapStatsB || {})])).sort();

  return (
    <>
      <section className="panel cmp-header-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2>Head-to-Head</h2>
          <button className="btn secondary small" onClick={reset}>Pick different players</button>
        </div>

        <div className="cmp-header">
          {/* Player A Header */}
          <div className="cmp-hero-player left">
            <div className="chp-avatar">
              <img src={playerAInfo?.avatarSrc || "/default_pp.png"} alt={nameA || "Player A"} />
            </div>
            <div className="chp-details">
              <div className="chp-name">{nameA}</div>
              <div className="chp-badges">
                <span className="mini-badge">Rank {playerAInfo?.rank || "-"}</span>
                <span className="mini-badge">Peak {playerAInfo?.peakElo || "-"}</span>
              </div>
            </div>
            <div className={`chp-rating ${ratingClass(statsA.rating)}`}>
              {statsA.rating.toFixed(2)}
            </div>
          </div>

          <div className="cmp-vs">VS</div>

          {/* Player B Header */}
          <div className="cmp-hero-player right">
            <div className={`chp-rating ${ratingClass(statsB.rating)}`}>
              {statsB.rating.toFixed(2)}
            </div>
            <div className="chp-details">
              <div className="chp-name">{nameB}</div>
              <div className="chp-badges">
                <span className="mini-badge">Rank {playerBInfo?.rank || "-"}</span>
                <span className="mini-badge">Peak {playerBInfo?.peakElo || "-"}</span>
              </div>
            </div>
            <div className="chp-avatar">
              <img src={playerBInfo?.avatarSrc || "/default_pp.png"} alt={nameB || "Player B"} />
            </div>
          </div>
        </div>
      </section>

      {/* Profile shape + form charts */}
      <div className="chart-grid-2">
        <section className="panel">
          <h3 style={{ marginBottom: 8, textAlign: "center" }}>Profile shape</h3>
          <p className="muted" style={{ fontSize: "0.75rem", textAlign: "center", margin: "0 0 6px" }}>
            Each axis scaled to the better of the two players.
          </p>
          <RadarCompare
            nameA={nameA || "A"}
            nameB={nameB || "B"}
            axes={[
              { key: "rating", label: "Rating" },
              { key: "kd", label: "K/D" },
              { key: "adr", label: "ADR" },
              { key: "kast", label: "KAST" },
              { key: "hs", label: "HS%" },
              { key: "utilPerRound", label: "Util" },
            ].map(({ key, label }) => {
              const a = statsA[key] ?? 0;
              const b = statsB[key] ?? 0;
              const max = Math.max(a, b, 0.001);
              return { label, a: a / max, b: b / max };
            })}
          />
        </section>
        <section className="panel">
          <h3 style={{ marginBottom: 8, textAlign: "center" }}>Form — daily rating</h3>
          {trendPoints && trendPoints.length >= 2 ? (
            <TrendCompare points={trendPoints} nameA={nameA || "A"} nameB={nameB || "B"} />
          ) : (
            <p className="muted" style={{ textAlign: "center" }}>Not enough shared play days yet.</p>
          )}
        </section>
      </div>

      {/* T/CT side split */}
      {sidesA && sidesB && (
        <section className="panel">
          <h3 style={{ marginBottom: 16, textAlign: "center" }}>By side</h3>
          <div className="side-compare-grid">
            {(["t", "ct"] as const).map((side) => {
              const sA = sidesA[side];
              const sB = sidesB[side];
              return (
                <div key={side} className="side-compare-card">
                  <div className={`side-compare-title side-${side}`}>{side === "t" ? "T side" : "CT side"}</div>
                  {[
                    { label: "Rating", a: sA.rating, b: sB.rating, fmt: (v: number) => v.toFixed(2) },
                    { label: "ADR", a: sA.adr, b: sB.adr, fmt: (v: number) => v.toFixed(0) },
                    { label: "Win %", a: sA.winPct, b: sB.winPct, fmt: (v: number) => `${v.toFixed(0)}%` },
                    { label: "Rounds", a: sA.rounds, b: sB.rounds, fmt: (v: number) => String(v) },
                  ].map((row) => (
                    <div key={row.label} className="side-compare-row">
                      <span className={row.a > row.b ? "scr-val win" : "scr-val"}>{row.fmt(row.a)}</span>
                      <span className="scr-label">{row.label}</span>
                      <span className={row.b > row.a ? "scr-val win" : "scr-val"}>{row.fmt(row.b)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel">
        <h3 style={{ marginBottom: 24, textAlign: "center" }}>Overall Stats</h3>
        {metrics.map((metric) => {
          const a = statsA[metric.key];
          const b = statsB[metric.key];
          const totalValue = a + b;
          const shareA = totalValue > 0 ? (a / totalValue) * 100 : 50;
          const shareB = totalValue > 0 ? (b / totalValue) * 100 : 50;
          const aWins = metric.lowerIsBetter ? a < b : a > b;
          const bWins = metric.lowerIsBetter ? b < a : b > a;

          return (
            <div key={metric.label} className="cmp-grid" style={{ marginBottom: 10 }}>
              <div>
                <div className={`cmp-val ${aWins ? "rating-good" : ""}`} style={{ textAlign: "right" }}>
                  {formatValue(a, metric.format)}
                </div>
                <div className="cmp-bar left">
                  <div className="fill anim-fill" style={{ width: `${shareA}%`, opacity: aWins ? 1 : 0.35 }} />
                </div>
              </div>
              <div className="cmp-metric">{metric.label}</div>
              <div>
                <div className={`cmp-val ${bWins ? "rating-good" : ""}`}>{formatValue(b, metric.format)}</div>
                <div className="cmp-bar right">
                  <div className="fill anim-fill" style={{ width: `${shareB}%`, opacity: bWins ? 1 : 0.35 }} />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {allMaps.length > 0 && (
        <section className="panel">
          <h3 style={{ marginBottom: 24, textAlign: "center" }}>Per Map Breakdown</h3>
          <div className="map-breakdown-list">
            {allMaps.map(map => {
              const mA = mapStatsA[map];
              const mB = mapStatsB[map];

              const winA = mA ? (mA.winPct || 0).toFixed(0) + "%" : "-";
              const winB = mB ? (mB.winPct || 0).toFixed(0) + "%" : "-";

              const rA = mA ? mA.rating.toFixed(2) : "-";
              const rB = mB ? mB.rating.toFixed(2) : "-";

              return (
                <div key={map} className="map-cmp-card">
                  <div className="mcc-title">{map}</div>
                  <div className="mcc-body">
                    <div className="mcc-col left">
                      <div><strong>{rA}</strong> Rating</div>
                      <div className="muted">{winA} win</div>
                      <div className="muted">{mA?.rounds || 0} rds</div>
                    </div>
                    <div className="mcc-col right">
                      <div><strong>{rB}</strong> Rating</div>
                      <div className="muted">{winB} win</div>
                      <div className="muted">{mB?.rounds || 0} rds</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
