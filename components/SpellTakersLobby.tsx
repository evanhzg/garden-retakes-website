"use client";

import { useState, useEffect, useRef } from "react";

type LobbyPhase = "team-select" | "veto" | "draft" | "recap";

interface Player {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isReady: boolean;
  team: "alpha" | "omega" | null;
  votedMapId: string | null;
  selectedClassId: string | null;
}

interface MapItem {
  id: string;
  name: string;
  image: string;
  isBanned: boolean;
}

const INITIAL_MAPS: MapItem[] = [
  { id: "inferno", name: "Inferno Banana", image: "https://files.retakes.fr/maps/de_inferno.jpg", isBanned: false },
  { id: "mirage", name: "Mirage Mid", image: "https://files.retakes.fr/maps/de_mirage.jpg", isBanned: false },
  { id: "dust2", name: "Dust II Long", image: "https://files.retakes.fr/maps/de_dust2.jpg", isBanned: false },
  { id: "vertigo", name: "Vertigo Ramp", image: "https://files.retakes.fr/maps/de_vertigo.jpg", isBanned: false },
];

const CLASSES = [
  { id: "juggernaut", name: "Juggernaut", role: "Tank", color: "#ef4444", icon: "🛡️" },
  { id: "assassin", name: "Assassin", role: "Burst", color: "#a855f7", icon: "🗡️" },
  { id: "caster", name: "Caster", role: "Ranged", color: "#3b82f6", icon: "🔮" },
  { id: "cleric", name: "Cleric", role: "Healer", color: "#fcd34d", icon: "✨" },
  { id: "berserker", name: "Berserker", role: "Melee DPS", color: "#dc2626", icon: "🪓" },
  { id: "ranger", name: "Ranger", role: "Sniper", color: "#22c55e", icon: "🏹" },
  { id: "elementalist", name: "Elementalist", role: "AoE", color: "#06b6d4", icon: "🌪️" },
  { id: "necromancer", name: "Necromancer", role: "Summoner", color: "#16a34a", icon: "💀" },
  { id: "paladin", name: "Paladin", role: "Support Tank", color: "#f59e0b", icon: "⚔️" },
  { id: "rogue", name: "Rogue", role: "Stealth", color: "#6366f1", icon: "🥷" },
  { id: "illusionist", name: "Illusionist", role: "Control", color: "#d946ef", icon: "🎭" },
  { id: "engineer", name: "Engineer", role: "Builder", color: "#f97316", icon: "⚙️" },
];

const MOCK_NAMES = ["morgoth", "frost", "nton", "Taeho", "vz7y", "trezza", "garden", "Niko", "s1mple", "donk", "m0NESY", "ZywOo"];

export default function SpellTakersLobby() {
  const [phase, setPhase] = useState<LobbyPhase>("team-select");
  const [players, setPlayers] = useState<Player[]>([]);
  const [maps, setMaps] = useState<MapItem[]>(INITIAL_MAPS);
  
  // Timers & Rounds
  const [timeLeft, setTimeLeft] = useState<number>(0);
  
  const myPlayerId = "player-me";
  const myPlayer = players.find(p => p.id === myPlayerId);
  const myTeam = myPlayer?.team;

  // Initialize Me
  useEffect(() => {
    setPlayers([{
      id: myPlayerId,
      name: "YOU",
      avatar: "https://avatars.dicebear.com/api/bottts/you.svg",
      isBot: false,
      isReady: false,
      team: null,
      votedMapId: null,
      selectedClassId: null
    }]);
  }, []);

  // Team Select Bot Simulation
  useEffect(() => {
    if (phase !== "team-select") return;
    if (!myPlayer?.isReady) return;

    const interval = setInterval(() => {
      setPlayers(prev => {
        const bots = prev.filter(p => p.isBot);
        const alphaCount = prev.filter(p => p.team === "alpha").length;
        const omegaCount = prev.filter(p => p.team === "omega").length;

        if (bots.length < 9) {
          // Add a bot
          const newBot: Player = {
            id: `bot-${Date.now()}`,
            name: MOCK_NAMES[bots.length % MOCK_NAMES.length],
            avatar: `https://avatars.dicebear.com/api/bottts/bot-${bots.length}.svg`,
            isBot: true,
            isReady: false,
            team: alphaCount < 5 ? "alpha" : "omega",
            votedMapId: null,
            selectedClassId: null
          };
          return [...prev, newBot];
        } else {
          // Ready up bots
          const unreadyBot = prev.find(p => p.isBot && !p.isReady);
          if (unreadyBot) {
            return prev.map(p => p.id === unreadyBot.id ? { ...p, isReady: true } : p);
          }
        }
        return prev;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [phase, myPlayer?.isReady]);

  // Check if everyone is ready to proceed to Veto
  useEffect(() => {
    if (phase === "team-select" && players.length === 10 && players.every(p => p.isReady)) {
      setTimeout(() => {
        setPhase("veto");
        setTimeLeft(10);
      }, 1000);
    }
  }, [players, phase]);

  // Veto & Draft Timer Loop
  useEffect(() => {
    if (timeLeft <= 0) {
      if (phase === "veto") {
        resolveVetoRound();
      } else if (phase === "draft") {
        setPhase("recap");
      }
      return;
    }

    const timerId = setTimeout(() => {
      setTimeLeft(prev => prev - 1);
      
      // Bot actions during timer
      if (phase === "veto") {
        simulateBotVotes();
      } else if (phase === "draft" && timeLeft === 5) {
        simulateBotDrafts(); // Bots pick instantly at 5s
      }
    }, 1000);

    return () => clearTimeout(timerId);
  }, [timeLeft, phase]);

  const simulateBotVotes = () => {
    setPlayers(prev => prev.map(p => {
      if (p.isBot && Math.random() > 0.7) {
        const activeMaps = maps.filter(m => !m.isBanned);
        if (activeMaps.length > 0) {
          const randomMap = activeMaps[Math.floor(Math.random() * activeMaps.length)];
          return { ...p, votedMapId: randomMap.id };
        }
      }
      return p;
    }));
  };

  const simulateBotDrafts = () => {
    setPlayers(prev => prev.map(p => {
      if (p.isBot && !p.selectedClassId) {
        const randomClass = CLASSES[Math.floor(Math.random() * CLASSES.length)];
        return { ...p, selectedClassId: randomClass.id };
      }
      return p;
    }));
  };

  const resolveVetoRound = () => {
    const activeMaps = maps.filter(m => !m.isBanned);
    if (activeMaps.length <= 1) {
      setPhase("draft");
      setTimeLeft(10);
      return;
    }

    // Tally votes
    const votes: Record<string, number> = {};
    activeMaps.forEach(m => votes[m.id] = 0);
    players.forEach(p => {
      if (p.votedMapId && votes[p.votedMapId] !== undefined) {
        votes[p.votedMapId]++;
      }
    });

    let maxVotes = -1;
    let mapsToBan: string[] = [];
    Object.entries(votes).forEach(([mapId, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        mapsToBan = [mapId];
      } else if (count === maxVotes) {
        mapsToBan.push(mapId);
      }
    });

    // Random choice if tie or no votes
    const bannedMapId = mapsToBan[Math.floor(Math.random() * mapsToBan.length)];

    setMaps(prev => prev.map(m => m.id === bannedMapId ? { ...m, isBanned: true } : m));
    
    // Clear votes
    setPlayers(prev => prev.map(p => ({ ...p, votedMapId: null })));

    // Continue to next map or draft
    const remaining = activeMaps.length - 1;
    if (remaining > 1) {
      setTimeLeft(10); // Start next round
    } else {
      setTimeout(() => {
        setPhase("draft");
        setTimeLeft(10);
      }, 2000);
    }
  };

  // User Actions
  const joinTeam = (team: "alpha" | "omega") => {
    setPlayers(prev => prev.map(p => p.id === myPlayerId ? { ...p, team, isReady: false } : p));
  };

  const leaveTeam = () => {
    setPlayers(prev => prev.map(p => p.id === myPlayerId ? { ...p, team: null, isReady: false } : p));
  };

  const toggleReady = () => {
    setPlayers(prev => prev.map(p => p.id === myPlayerId ? { ...p, isReady: !p.isReady } : p));
  };

  const voteMap = (mapId: string) => {
    if (phase !== "veto" || timeLeft === 0) return;
    setPlayers(prev => prev.map(p => p.id === myPlayerId ? { ...p, votedMapId: mapId } : p));
  };

  const draftClass = (classId: string) => {
    if (phase !== "draft" || timeLeft === 0) return;
    setPlayers(prev => prev.map(p => p.id === myPlayerId ? { ...p, selectedClassId: classId } : p));
  };

  // Render Helpers
  const alphaPlayers = Array.from({ length: 5 }).map((_, i) => players.filter(p => p.team === "alpha")[i] || null);
  const omegaPlayers = Array.from({ length: 5 }).map((_, i) => players.filter(p => p.team === "omega")[i] || null);
  
  const ourPlayers = myTeam === "omega" ? omegaPlayers : alphaPlayers;
  const enemyPlayers = myTeam === "omega" ? alphaPlayers : omegaPlayers;

  const finalMap = maps.find(m => !m.isBanned) || INITIAL_MAPS[0];

  return (
    <div className={`st-container ${phase === "recap" ? "st-recap-mode" : ""}`}>
      {phase === "recap" && (
        <div className="st-recap-bg" style={{ backgroundImage: `url(${finalMap.image})` }}></div>
      )}

      {phase !== "recap" && (
        <div className="st-header">
          <h1>SpellTakers</h1>
          <p className="st-subtitle">A League of Legends inspired 5v5 mode for Counter-Strike 2</p>
        </div>
      )}

      {/* PHASE 1: TEAM SELECT */}
      {phase === "team-select" && (
        <div className="st-panel">
          <div className="st-teams-wrapper">
            <div className="st-team-col">
              <h2>Team Alpha</h2>
              <div className="st-players-list">
                {alphaPlayers.map((p, i) => (
                  <div key={i} className={`st-player-row ${p ? (p.isReady ? 'ready' : '') : 'empty'}`}>
                    {p ? (
                      <>
                        <img src={p.avatar} alt="avatar" />
                        <span>{p.name}</span>
                        {p.isReady && <span className="st-status-badge">READY</span>}
                      </>
                    ) : <span>Empty Slot</span>}
                  </div>
                ))}
              </div>
              {!myTeam && <button className="st-btn-secondary" onClick={() => joinTeam("alpha")}>Join Alpha</button>}
            </div>

            <div className="st-vs-divider">VS</div>

            <div className="st-team-col">
              <h2>Team Omega</h2>
              <div className="st-players-list">
                {omegaPlayers.map((p, i) => (
                  <div key={i} className={`st-player-row ${p ? (p.isReady ? 'ready' : '') : 'empty'}`}>
                    {p ? (
                      <>
                        <img src={p.avatar} alt="avatar" />
                        <span>{p.name}</span>
                        {p.isReady && <span className="st-status-badge">READY</span>}
                      </>
                    ) : <span>Empty Slot</span>}
                  </div>
                ))}
              </div>
              {!myTeam && <button className="st-btn-secondary" onClick={() => joinTeam("omega")}>Join Omega</button>}
            </div>
          </div>

          {myTeam && (
            <div className="st-action-bar">
              <button className="st-btn-danger" onClick={leaveTeam} disabled={myPlayer?.isReady}>Leave Team</button>
              <button className={`st-btn-primary ${myPlayer?.isReady ? 'active' : ''}`} onClick={toggleReady}>
                {myPlayer?.isReady ? "Cancel Ready" : "Ready Up"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* PHASE 2: MAP VETO */}
      {phase === "veto" && (
        <div className="st-panel">
          <div className="st-timer-header">
            <h2>Map Veto Phase</h2>
            <div className="st-timer-circle">{timeLeft}s</div>
          </div>
          <p className="st-subtitle">Vote to <strong>BAN</strong> an arena. Map with most votes is eliminated.</p>
          
          <div className="st-maps-container">
            {maps.map((map) => {
              const votesForMap = players.filter(p => p.votedMapId === map.id);
              return (
                <div 
                  key={map.id} 
                  className={`st-map-card ${map.isBanned ? 'banned' : 'active'} ${myPlayer?.votedMapId === map.id ? 'my-vote' : ''}`}
                  onClick={() => !map.isBanned && voteMap(map.id)}
                >
                  <div className="st-map-bg" style={{ backgroundImage: `url(${map.image})` }}></div>
                  <div className="st-map-overlay">
                    <h3>{map.name}</h3>
                    {map.isBanned && <div className="st-banned-stamp">BANNED</div>}
                    
                    {/* Vote Indicators */}
                    {!map.isBanned && votesForMap.length > 0 && (
                      <div className="st-vote-avatars">
                        {votesForMap.map(v => (
                          <img key={v.id} src={v.avatar} title={v.name} alt="vote" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PHASE 3: CLASS DRAFT */}
      {phase === "draft" && (
        <div className="st-panel">
          <div className="st-timer-header">
            <h2>Draft Your Class</h2>
            <div className="st-timer-circle">{timeLeft}s</div>
          </div>
          
          <div className="st-draft-layout">
            <div className="st-roster st-roster-left">
              <h3>Your Team</h3>
              {ourPlayers.map((p, i) => {
                const pickedClass = CLASSES.find(c => c.id === p?.selectedClassId);
                return (
                  <div key={i} className={`st-roster-slot ${p?.id === myPlayerId ? 'is-me' : ''}`}>
                    <img src={p?.avatar || ""} alt="avatar" className={!p ? 'hidden' : ''} />
                    <div className="st-roster-info">
                      <span className="name">{p?.name || "..."}</span>
                      <span className="pick" style={{ color: pickedClass?.color }}>
                        {pickedClass ? `${pickedClass.icon} ${pickedClass.name}` : "Selecting..."}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="st-classes-grid">
              {CLASSES.map((cls) => (
                <div 
                  key={cls.id} 
                  className={`st-class-card mini ${myPlayer?.selectedClassId === cls.id ? 'selected' : ''}`}
                  style={{ '--theme-color': cls.color } as React.CSSProperties}
                  onClick={() => draftClass(cls.id)}
                >
                  <div className="st-class-icon">{cls.icon}</div>
                  <h4>{cls.name}</h4>
                  <span className="st-class-role">{cls.role}</span>
                </div>
              ))}
            </div>

            <div className="st-roster st-roster-right">
              <h3>Opponents</h3>
              {enemyPlayers.map((p, i) => (
                <div key={i} className="st-roster-slot enemy">
                  <div className="st-roster-info right">
                    <span className="name">{p?.name || "..."}</span>
                    <span className="pick hidden-pick">?</span>
                  </div>
                  <img src={p?.avatar || ""} alt="avatar" className={!p ? 'hidden' : ''} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PHASE 4: RECAP / READY */}
      {phase === "recap" && (
        <div className="st-recap-content">
          <div className="st-recap-header">
            <h2 className="st-glow-text">Match Ready</h2>
            <p>Arena: {finalMap.name}</p>
          </div>

          <div className="st-recap-teams">
            <div className="st-recap-team">
              <h3>YOUR TEAM</h3>
              <div className="st-recap-cards">
                {ourPlayers.map((p, i) => {
                  const picked = CLASSES.find(c => c.id === p?.selectedClassId) || CLASSES[0];
                  return (
                    <div key={i} className={`st-recap-card ${p?.id === myPlayerId ? 'my-card' : ''}`} style={{ '--theme-color': picked.color } as React.CSSProperties}>
                      <img src={p?.avatar} alt="avatar" className="recap-avatar" />
                      <div className="recap-class-icon">{picked.icon}</div>
                      <span className="recap-name">{p?.name}</span>
                      <span className="recap-class">{picked.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="st-vs-divider vertical">VS</div>

            <div className="st-recap-team enemy-team">
              <h3>OPPONENTS</h3>
              <div className="st-recap-cards">
                {enemyPlayers.map((p, i) => (
                  <div key={i} className="st-recap-card hidden-card">
                    <img src={p?.avatar} alt="avatar" className="recap-avatar" />
                    <div className="recap-class-icon">?</div>
                    <span className="recap-name">{p?.name}</span>
                    <span className="recap-class">Hidden</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="st-center" style={{ marginTop: "40px" }}>
            <a href="steam://connect/adrien.gamergod.net:26541" className="st-btn-connect">
              Connect to Server
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
