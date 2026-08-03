import React from "react";
import "../games.css";
import { getT } from '@/lib/serverI18n';

export default function GamesRoadmap() {
    const t = getT();

  const games = [
    {
      name: "OUNO",
      status: "Playable",
      description: "A fast-paced card game focusing on real-time interactions, cards that fly out of the hand that played them, and a ruleset you build yourself.",
      features: [
        "Real-time Server-Authoritative Gameplay",
        "Timed OUNO call — forget it and the table fines you",
        "Stacking Modifiers (e.g. +2 on +2, +4 on +4)",
        "7-0 Rule Swapping (7 swaps hands, 0 rotates hands)",
        "Jump-In (Play identical card out of turn)",
        "Draw-to-Match, Forced Play and +4 bluff challenges",
        "Optional cards: Swap Hands, Shuffle Hands, Skip Everyone, Discard All, +6"
      ]
    },
    {
      name: "PENTAKILL",
      status: "Playable",
      description: "Guess the League champion — one a day for everyone, or a race against friends.",
      features: [
        "173 champions, re-seeded from Riot Data Dragon each patch",
        "Class / position / region / resource / range / damage / year grid",
        "Regions and release dates pulled from the League wiki data modules",
        "Daily puzzle, endless practice and a multiplayer race",
      ]
    },
    {
      name: "BUILD PATH",
      status: "Playable",
      description: "LoL item and champion quiz across four difficulty tiers.",
      features: [
        "Questions generated from live build paths, costs and stats",
        "Iron → Challenger tiers, from recognition to exact combine costs",
        "Every answer is a fact of the patch, not a tier list",
        "Daily paper per tier, practice mode and a race to N correct",
      ]
    },
    {
      name: "BUY MENU",
      status: "Playable",
      description: "CS2 economy, weapon and callout quiz across four ranks.",
      features: [
        "Prices, kill rewards, the loss ladder and map callouts",
        "Silver → Global tiers, ending on exact magazine and damage values",
        "Full-buy maths questions that mirror the real buy menu",
        "Daily paper per tier, practice mode and a race to N correct",
      ]
    },
    {
      name: "HEADSHOT",
      status: "Playable",
      description: "Guess the Counter-Strike pro — one a day for everyone, or a race against friends.",
      features: [
        "Daily puzzle derived from the UTC date, identical worldwide",
        "600+ Major-attending pros, seeded from Liquipedia",
        "Nationality / team / role / age / Majors comparison grid",
        "Streaks, shareable result grid, and a multiplayer race mode",
      ]
    },
    {
      name: "MONOPO7Y (Business Tour)",
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
      status: "Playable",
      description: "The classic spy word association game adapted for online competitive play.",
      features: [
        "Spectator Mode with live team chat",
        "Custom Word Lists (CS2, Memes, Insider Jokes)",
        "Built-in voice integration markers",
        "Timer settings for rapid-fire rounds"
      ]
    },
    { 
      name: "HASAMEME", 
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
      name: "PILE OF...", 
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
      name: "FREE-DRAW",
      status: "Playable",
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
        <h1>{t("auto.page.garden_games_roadmap")}</h1>
        <p>
          {t("auto.page.the_future_of_retakes_fr_is_mo")}
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
              <h4>{t("auto.page.planned_features")}</h4>
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
