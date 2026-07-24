import React from "react";
import { frontSprite, staticSprite, playCry } from "./sprites";
import "./pkmn.css";

const STARTERS = [
  { species: "Bulbasaur", type: "GRASS", cls: "pks-grass", blurb: "The reliable one" },
  { species: "Charmander", type: "FIRE", cls: "pks-fire", blurb: "The bold one" },
  { species: "Squirtle", type: "WATER", cls: "pks-water", blurb: "The steady one" },
];

export default function StarterPick({ onPick }: { onPick: (species: string) => void }) {
  return (
    <div className="pks-overlay">
      <h2 className="pks-title">Welcome to Garden PKMN!</h2>
      <p className="pks-sub">Professor Garden: “Choose your very first partner, trainer.”</p>
      <div className="pks-grid">
        {STARTERS.map((s) => (
          <button
            key={s.species}
            className="pks-card"
            onClick={() => {
              playCry(s.species);
              onPick(s.species);
            }}
          >
            <img
              src={frontSprite(s.species)}
              onError={(e) => { (e.target as HTMLImageElement).src = staticSprite(s.species); }}
              alt={s.species}
            />
            <strong>{s.species.toUpperCase()}</strong>
            <span className={`pks-type ${s.cls}`}>{s.type}</span>
            <span style={{ fontSize: "0.7rem", color: "#555", fontWeight: 600 }}>{s.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
