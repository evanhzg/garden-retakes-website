"use client";

import { useState, useEffect } from "react";

type LobbyState = "waiting" | "queue" | "veto" | "draft" | "ready";

const MAP_POOL = [
  { id: "banana", name: "Inferno Banana", image: "https://files.retakes.fr/maps/de_inferno.jpg" },
  { id: "mid", name: "Mirage Mid", image: "https://files.retakes.fr/maps/de_mirage.jpg" },
  { id: "long", name: "Dust II Long", image: "https://files.retakes.fr/maps/de_dust2.jpg" },
  { id: "ramp", name: "Vertigo Ramp", image: "https://files.retakes.fr/maps/de_vertigo.jpg" },
];

const CLASSES = [
  { id: "juggernaut", name: "Juggernaut", role: "Tank / Melee", color: "#ef4444", icon: "🛡️" },
  { id: "assassin", name: "Assassin", role: "Burst / Mobility", color: "#a855f7", icon: "🗡️" },
  { id: "caster", name: "Caster", role: "Ranged / Utility", color: "#3b82f6", icon: "🔮" },
];

const MOCK_NAMES = ["morgoth", "frost", "nton", "Taeho", "vz7y", "trezza", "garden", "Niko", "s1mple"];

export default function SpellTakersLobby() {
  const [lobbyState, setLobbyState] = useState<LobbyState>("waiting");
  const [players, setPlayers] = useState<{ name: string; avatar: string; class?: string }[]>([]);
  const [maps, setMaps] = useState(MAP_POOL.map(m => ({ ...m, banned: false })));
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  // Simulation: Queue filling up
  useEffect(() => {
    if (lobbyState === "queue") {
      let count = 1; // You
      const interval = setInterval(() => {
        if (count < 10) {
          const randomName = MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)];
          setPlayers(prev => [...prev, { name: randomName, avatar: `https://avatars.dicebear.com/api/bottts/${randomName}.svg` }]);
          count++;
        } else {
          clearInterval(interval);
          setTimeout(() => setLobbyState("veto"), 1500);
        }
      }, 600);
      return () => clearInterval(interval);
    }
  }, [lobbyState]);

  // Simulation: Map Vetoes
  useEffect(() => {
    if (lobbyState === "veto") {
      let banCount = 0;
      const interval = setInterval(() => {
        if (banCount < 3) {
          setMaps(prev => {
            const unbanned = prev.filter(m => !m.banned);
            if (unbanned.length > 1) {
              const toBan = unbanned[Math.floor(Math.random() * unbanned.length)];
              return prev.map(m => m.id === toBan.id ? { ...m, banned: true } : m);
            }
            return prev;
          });
          banCount++;
        } else {
          clearInterval(interval);
          setTimeout(() => setLobbyState("draft"), 2000);
        }
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [lobbyState]);

  const handleJoinQueue = () => {
    setPlayers([{ name: "YOU", avatar: "https://avatars.dicebear.com/api/bottts/you.svg" }]);
    setLobbyState("queue");
  };

  const handleLockClass = () => {
    if (selectedClass) {
      setLobbyState("ready");
    }
  };

  return (
    <div className="st-container">
      <div className="st-header">
        <h1>SpellTakers</h1>
        <p className="st-subtitle">A League of Legends inspired 5v5 mode for Counter-Strike 2</p>
      </div>

      {lobbyState === "waiting" && (
        <div className="st-panel st-center">
          <div className="st-glow-orb"></div>
          <h2>Ready for Battle?</h2>
          <p>Join the matchmaking queue to draft classes and vote for single-lane arenas.</p>
          <button className="st-btn-primary" onClick={handleJoinQueue}>Join Queue</button>
        </div>
      )}

      {lobbyState === "queue" && (
        <div className="st-panel">
          <h2>Searching for Match...</h2>
          <div className="st-progress-bar">
            <div className="st-progress-fill" style={{ width: `${(players.length / 10) * 100}%` }}></div>
          </div>
          <p className="st-queue-status">{players.length} / 10 Players Found</p>
          
          <div className="st-players-grid">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={`st-player-slot ${players[i] ? 'filled' : ''}`}>
                {players[i] ? (
                  <>
                    <img src={players[i].avatar} alt="avatar" />
                    <span>{players[i].name}</span>
                  </>
                ) : (
                  <span className="st-empty-slot">Searching...</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {lobbyState === "veto" && (
        <div className="st-panel">
          <h2>Map Veto Phase</h2>
          <p className="st-subtitle">Players are banning arenas...</p>
          
          <div className="st-maps-container">
            {maps.map((map) => (
              <div key={map.id} className={`st-map-card ${map.banned ? 'banned' : 'active'}`}>
                <div className="st-map-bg" style={{ backgroundImage: `url(${map.image})` }}></div>
                <div className="st-map-overlay">
                  <h3>{map.name}</h3>
                  {map.banned && <div className="st-banned-stamp">BANNED</div>}
                  {!map.banned && maps.filter(m => !m.banned).length === 1 && <div className="st-picked-stamp">SELECTED</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lobbyState === "draft" && (
        <div className="st-panel">
          <h2>Draft Your Class</h2>
          <p className="st-subtitle">Select your role for this match.</p>

          <div className="st-classes-container">
            {CLASSES.map((cls) => (
              <div 
                key={cls.id} 
                className={`st-class-card ${selectedClass === cls.id ? 'selected' : ''}`}
                style={{ '--theme-color': cls.color } as React.CSSProperties}
                onClick={() => setSelectedClass(cls.id)}
              >
                <div className="st-class-icon">{cls.icon}</div>
                <h3>{cls.name}</h3>
                <span className="st-class-role">{cls.role}</span>
              </div>
            ))}
          </div>

          <div className="st-draft-actions">
            <button 
              className="st-btn-primary" 
              disabled={!selectedClass}
              onClick={handleLockClass}
            >
              Lock In
            </button>
          </div>
        </div>
      )}

      {lobbyState === "ready" && (
        <div className="st-panel st-center">
          <div className="st-glow-orb success"></div>
          <h2>Match Ready!</h2>
          <p className="st-match-details">
            Arena: <strong>{maps.find(m => !m.banned)?.name}</strong><br/>
            Your Class: <strong>{CLASSES.find(c => c.id === selectedClass)?.name}</strong>
          </p>
          <a href="steam://connect/adrien.gamergod.net:26541" className="st-btn-connect">
            Connect to Server
          </a>
          <p className="st-small-hint">The server has been configured. Teams are locked.</p>
        </div>
      )}

    </div>
  );
}
