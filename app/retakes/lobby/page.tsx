"use client";

import React, { useState, useEffect } from "react";
import { useI18n } from "@/components/I18nProvider";

import "./retakes-lobby.css";

const MAP_POOL = [
  "de_mirage", "de_inferno", "de_nuke", "de_overpass", 
  "de_vertigo", "de_ancient", "de_anubis"
];

const BOT_NAMES = [
  "f0rest", "GeT_RiGhT", "s1mple", "dev1ce", "ZywOo", 
  "NiKo", "kennyS", "coldzera", "olofmeister"
];

type MatchState = "idle" | "queueing" | "found" | "veto" | "ready";

export default function RetakesLobby() {
  const { t } = useI18n();

  const [state, setState] = useState<MatchState>("idle");
  const [queueTime, setQueueTime] = useState(0);
  const [accepted, setAccepted] = useState(0);
  const [hasAccepted, setHasAccepted] = useState(false);
  
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  
  const [availableMaps, setAvailableMaps] = useState<string[]>(MAP_POOL);
  const [bannedMaps, setBannedMaps] = useState<string[]>([]);
  const [pickedMap, setPickedMap] = useState<string | null>(null);
  const [vetoTurn, setVetoTurn] = useState<"A" | "B">("A");

  // Queue timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state === "queueing") {
      interval = setInterval(() => setQueueTime(t => t + 1), 1000);
      
      // Simulate finding a match after 3 seconds
      const findTimer = setTimeout(() => {
        setState("found");
        setAccepted(0);
        setHasAccepted(false);
      }, 3000);
      return () => { clearInterval(interval); clearTimeout(findTimer); };
    }
    return () => clearInterval(interval);
  }, [state]);

  // Match found bots accepting
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state === "found") {
      interval = setInterval(() => {
        setAccepted(prev => {
          const next = prev + 1;
          // When 10/10 accept (9 bots + you)
          if (next >= 10) {
            setupLobby();
          }
          return Math.min(next, 10);
        });
      }, 800); // Bots accept randomly/gradually
    }
    return () => clearInterval(interval);
  }, [state]);

  // Simulate opponent's veto
  useEffect(() => {
    if (state === "veto" && vetoTurn === "B" && availableMaps.length > 1) {
      const timer = setTimeout(() => {
        const randomMap = availableMaps[Math.floor(Math.random() * availableMaps.length)];
        handleBan(randomMap);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state, vetoTurn, availableMaps]);

  const setupLobby = () => {
    const shuffledBots = [...BOT_NAMES].sort(() => 0.5 - Math.random());
    setTeamA(["You", ...shuffledBots.slice(0, 4)]);
    setTeamB(shuffledBots.slice(4, 9));
    setState("veto");
    setAvailableMaps(MAP_POOL);
    setBannedMaps([]);
    setPickedMap(null);
    setVetoTurn("A");
  };

  const handleAccept = () => {
    if (!hasAccepted) {
      setHasAccepted(true);
      setAccepted(a => a + 1);
      if (accepted + 1 >= 10) setupLobby();
    }
  };

  const handleBan = (map: string) => {
    if (state !== "veto" || availableMaps.length <= 1) return;
    
    setBannedMaps(prev => [...prev, map]);
    const remaining = availableMaps.filter(m => m !== map);
    setAvailableMaps(remaining);
    
    if (remaining.length === 1) {
      setPickedMap(remaining[0]);
      setTimeout(() => setState("ready"), 2000);
    } else {
      setVetoTurn(vetoTurn === "A" ? "B" : "A");
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="retakes-lobby-page">
      <section className="pro-hero" style={{ textAlign: "center", paddingBottom: "2rem" }}>
        <span className="kicker">COMPETITIVE</span>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 64px)", margin: "10px 0" }}>Retakes Matchmaking</h1>
        <p className="muted" style={{ maxWidth: "600px", margin: "0 auto" }}>
          Queue up for 5v5 competitive retakes. Faceit-style map vetos, dedicated servers, and pure skill.
        </p>
      </section>

      <section className="pro-section flex-center" style={{ minHeight: "50vh" }}>
        {state === "idle" && (
          <button className="btn btn-primary play-btn" onClick={() => { setState("queueing"); setQueueTime(0); }}>
            FIND MATCH
          </button>
        )}

        {state === "queueing" && (
          <div className="queue-box">
            <h2>SEARCHING FOR MATCH</h2>
            <div className="queue-timer">{formatTime(queueTime)}</div>
            <p className="muted">Players in queue: 42</p>
            <button className="btn btn-secondary" onClick={() => setState("idle")}>Cancel</button>
          </div>
        )}

        {state === "found" && (
          <div className="match-found-modal">
            <h2 className="pulse-text">MATCH FOUND</h2>
            <div className="accept-progress">
              <div className="accept-bar" style={{ width: `${(accepted / 10) * 100}%` }} />
            </div>
            <p className="accepted-count">{accepted} / 10 ACCEPTED</p>
            {!hasAccepted ? (
              <button className="btn btn-primary accept-btn" onClick={handleAccept}>ACCEPT</button>
            ) : (
              <button className="btn btn-secondary accept-btn" disabled>WAITING FOR OTHERS...</button>
            )}
          </div>
        )}

        {(state === "veto" || state === "ready") && (
          <div className="match-room">
            <div className="match-header">
              <div className="team-a-header">TEAM A</div>
              <div className="match-status">
                {state === "ready" ? "MATCH READY" : `VETO PHASE - TEAM ${vetoTurn} TO BAN`}
              </div>
              <div className="team-b-header">TEAM B</div>
            </div>

            <div className="match-content">
              <div className="roster team-a">
                {teamA.map((player, i) => (
                  <div key={i} className={`player-card ${player === "You" ? "is-me" : ""}`}>
                    <div className="avatar" />
                    <span>{player}</span>
                    {i === 0 && <span className="captain-badge">C</span>}
                  </div>
                ))}
              </div>

              <div className="veto-center">
                {state === "ready" ? (
                  <div className="ready-state">
                    <h3>MAP PICKED</h3>
                    <div className="picked-map">{pickedMap}</div>
                    <div className="server-ip">
                      <p>CONNECT TO SERVER</p>
                      <code>connect retakes1.garden.gg:27015</code>
                    </div>
                  </div>
                ) : (
                  <div className="map-pool">
                    {MAP_POOL.map(map => {
                      const isBanned = bannedMaps.includes(map);
                      return (
                        <button 
                          key={map} 
                          className={`map-card ${isBanned ? "banned" : ""} ${vetoTurn === "B" && !isBanned ? "disabled" : ""}`}
                          onClick={() => handleBan(map)}
                          disabled={isBanned || vetoTurn === "B"}
                        >
                          {map}
                          {isBanned && <span className="ban-overlay">BANNED</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="roster team-b">
                {teamB.map((player, i) => (
                  <div key={i} className="player-card">
                    <span>{player}</span>
                    {i === 0 && <span className="captain-badge">C</span>}
                    <div className="avatar" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
