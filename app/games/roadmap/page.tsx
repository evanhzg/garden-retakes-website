import React from "react";
import "../games.css";

export default function GamesRoadmap() {
  const games = [
    { 
      name: "UNO", 
      status: "In Development", 
      description: "A fast-paced card game focusing on real-time interactions, smooth CSS-based card animations, and multiple game-changing modifiers.",
      features: [
        "Real-time Server-Authoritative Gameplay",
        "Stacking Modifiers (e.g. +2 on +2, +4 on +4)",
        "7-0 Rule Swapping (7 swaps hands, 0 rotates hands)",
        "Jump-In (Play identical card out of turn)",
        "Draw-to-Match (Keep drawing until you get a playable card)"
      ]
    },
    { 
      name: "Monopoly (Business Tour)", 
      status: "Planned", 
      description: "Fast-paced property trading game with modified rules for quick sessions.",
      features: [
        "1v1, 1v1v1, and 2v2 Team Modes",
        "Fast-Forward Trading (Simultaneous turn phases)",
        "Custom Board Themes & Player Tokens",
        "Instant Auction system for declined properties"
      ]
    },
    { 
      name: "Codenames", 
      status: "Planned", 
      description: "The classic spy word association game adapted for online competitive play.",
      features: [
        "Spectator Mode with live team chat",
        "Custom Word Lists (CS2, Memes, Insider Jokes)",
        "Built-in voice integration markers",
        "Timer settings for rapid-fire rounds"
      ]
    },
    { 
      name: "Make it Meme", 
      status: "Planned", 
      description: "Compete to create the funniest meme using provided templates.",
      features: [
        "Private Meme Template Library",
        "Live Voting & Scoring System",
        "Export winning memes directly to Discord",
        "GIF Support"
      ]
    },
    { 
      name: "Cards Against Humanity", 
      status: "Planned", 
      description: "A party game for terrible people.",
      features: [
        "Custom Blank Card creations mid-game",
        "Huge library of custom expansion packs",
        "Anonymous submissions",
        "Card Czar rotation modes"
      ]
    },
    { 
      name: "Skribbl.io", 
      status: "Planned", 
      description: "Multiplayer drawing and guessing game.",
      features: [
        "Ultra-low latency WebSocket Canvas",
        "Custom Word Libraries",
        "Brush sizes, bucket fill, and undo mechanics",
        "Fuzzy string matching for typo-tolerant guessing"
      ]
    },
  ];

  return (
    <div className="roadmap-container">
      <div className="roadmap-header">
        <h1>GARDEN GAMES ROADMAP</h1>
        <p>
          The future of Retakes.fr is more than just CS2. We're building a real-time multiplayer hub for our favorite games, optimized for fast-paced play, smooth animations, and ultimate fun.
        </p>
      </div>

      <div className="roadmap-grid">
        {games.map((game, i) => (
          <div key={i} className="roadmap-card">
            <div className="roadmap-card-top">
              <h3>{game.name}</h3>
              <span className={`status-badge ${game.status === 'In Development' ? 'dev' : 'plan'}`}>
                {game.status}
              </span>
            </div>
            <p className="roadmap-desc">{game.description}</p>
            
            <div className="roadmap-features">
              <h4>Planned Features:</h4>
              <ul>
                {game.features.map((feat, idx) => (
                  <li key={idx}><span>✓</span> {feat}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
