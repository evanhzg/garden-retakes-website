"use client";

import { useState } from "react";
import { ArrowRight, Check, ChevronDown, Crosshair, GitBranch, Server, Shield, Swords, Trophy, X } from "lucide-react";

const maps = ["Ancient", "Mirage", "Inferno"];
const rounds = [
  ["CHECK-IN", "Les deux équipes confirment leur présence."],
  ["VETO", "Les capitaines retirent puis choisissent les cartes."],
  ["WARM-UP", "Cinq minutes pour régler les binds et la stratégie."],
  ["MATCH", "Le serveur lance le BO prévu. Chaque round compte."],
];
const rules = ["Inscription validée avant la deadline", "Roster verrouillé au lancement", "Pause technique : 10 minutes par équipe", "Déconnexion : capture + ticket admin", "Fair-play obligatoire, sanction immédiate"];
const types = {
  "Swiss stage": ["16 teams", "3 victoires = playoffs", "3 défaites = éliminé"],
  "Poules": ["4 × 4 teams", "Round-robin BO1", "Top 2 qualifiés"],
  "Playoffs": ["8 teams", "Single elimination", "Finale en BO5"],
};

export default function TournamentGuide() {
  const [map, setMap] = useState(0);
  const [step, setStep] = useState(1);
  const [rule, setRule] = useState(0);
  const [type, setType] = useState<keyof typeof types>("Swiss stage");
  const [server, setServer] = useState("Paris · 18 ms");

  return <div className="tourney-guide">
    <header className="tourney-hero">
      <div><span className="kicker">REEEETAKES / TOURNAMENT SYSTEM</span><h1>PLAY<br /><em>THE BRACKET.</em></h1><p>Un tournoi n&apos;est pas une suite de matchs.<br />C&apos;est une histoire qui se construit round après round.</p></div>
      <div className="hero-orbit"><div className="orbit-line" /><div className="orbit-core"><Trophy size={30} /><span>SEASON<br />01</span></div><div className="orbit-label">DISCOVER<br />THE SYSTEM <ArrowRight size={16} /></div></div>
    </header>

    <div className="guide-index"><span>05 MODULES</span><span className="index-line" /><span>SCROLL TO EXPLORE ↓</span></div>

    <section className="guide-module veto-module"><div className="module-copy"><span className="module-number">01 / MAP VETO</span><h2>Chaque carte<br /><i>se mérite.</i></h2><p>Le veto est votre première bataille. Retirez, choisissez, imposez votre rythme avant même que le warm-up commence.</p><div className="map-tabs">{maps.map((name, i) => <button key={name} className={map === i ? "is-active" : ""} onClick={() => setMap(i)}>{name}</button>)}</div></div><div className="map-board"><div className="map-top"><span>{maps[map].toUpperCase()} / CALLOUTS</span><span>ACTIVE MAP</span></div><div className="map-layout"><div className="map-shape"><div className="site site-a">A</div><div className="site site-b">B</div><div className="mid-dot">MID</div><div className="route route-one" /><div className="route route-two" /><div className="route route-three" /></div><div className="map-notes"><b>VETO LOG</b><span><X size={13} /> BAN · Vertigo</span><span><Check size={13} /> PICK · {maps[map]}</span><span><X size={13} /> BAN · Nuke</span></div></div><div className="map-footer"><span>ATTACKING SIDE</span><strong>TEAM T</strong><span>DEFENDING SIDE</span><strong className="blue-text">TEAM CT</strong></div></div></section>

    <section className="guide-module flow-module"><div className="module-copy"><span className="module-number">02 / GAMEPLAY FLOW</span><h2>Un match.<br /><i>Quatre actes.</i></h2><p>De la confirmation au dernier clutch, chaque étape est claire. Rien n&apos;est laissé au hasard.</p><div className="flow-status">ACTE {String(step).padStart(2, "0")} <span>{rounds[step - 1][0]}</span></div></div><div className="stepper">{rounds.map((item, i) => <button key={item[0]} className={step === i + 1 ? "is-current" : step > i + 1 ? "is-done" : ""} onClick={() => setStep(i + 1)}><span className="step-icon">{step > i + 1 ? <Check size={15} /> : String(i + 1).padStart(2, "0")}</span><span><b>{item[0]}</b><small>{item[1]}</small></span><ArrowRight size={17} /></button>)}</div></section>

    <section className="guide-module rules-module"><div className="rules-header"><span className="module-number">03 / TOURNAMENT CODE</span><h2>Les règles<br /><i>du jeu.</i></h2><p>Lisibles. Mesurables. Identiques pour tout le monde.</p></div><div className="rules-list">{rules.map((text, i) => <button key={text} className={rule === i ? "is-selected" : ""} onClick={() => setRule(i)}><span>0{i + 1}</span><strong>{text}</strong>{rule === i ? <Check size={18} /> : <ChevronDown size={18} />}</button>)}</div><div className="rule-callout"><Shield size={20} /><div><b>RÈGLE ACTIVE</b><span>{rules[rule]}</span></div></div></section>

    <section className="guide-module bracket-module"><div className="module-copy"><span className="module-number">04 / BRACKET ENGINE</span><h2>Choisissez<br /><i>votre arbre.</i></h2><p>Le format s&apos;adapte à votre tournoi. De la Swiss stage à la finale BO5, le système garde le cap.</p><div className="type-tabs">{(Object.keys(types) as (keyof typeof types)[]).map(t => <button key={t} className={type === t ? "is-active" : ""} onClick={() => setType(t)}>{t}</button>)}</div></div><div className="bracket-view"><div className="bracket-title"><GitBranch size={18} /> {type.toUpperCase()} <span>{types[type][0]}</span></div><div className="bracket-tree"><div className="tree-col"><span>ROUND 1</span><b>Team A <em>2</em></b><b>Team B <em>0</em></b><b>Team C <em>1</em></b><b>Team D <em>2</em></b></div><div className="tree-col middle"><span>ROUND 2</span><b>Team A <em>2</em></b><b>Team D <em>1</em></b></div><div className="tree-col final"><span>FINAL</span><b>TEAM A <Trophy size={15} /></b></div></div><div className="format-notes">{types[type].map(note => <span key={note}><Check size={13} /> {note}</span>)}</div></div></section>

    <section className="guide-module server-module"><div className="server-visual"><div className="server-radar"><div className="radar-ring" /><div className="radar-ring second" /><Crosshair size={38} /><span className="ping ping-one">18</span><span className="ping ping-two">26</span></div><div className="server-list">{["Paris · 18 ms", "Frankfurt · 24 ms", "London · 31 ms"].map(s => <button key={s} className={server === s ? "is-active" : ""} onClick={() => setServer(s)}><Server size={15} /><span>{s}</span>{server === s && <Check size={15} />}</button>)}</div></div><div className="module-copy"><span className="module-number">05 / VETO + SERVERS</span><h2>Le bon<br /><i>terrain.</i></h2><p>Le serveur est sélectionné selon le ping moyen. Le veto garantit que chaque choix est documenté et visible.</p><div className="server-selected"><span>SERVER SELECTED</span><strong>{server}</strong><small>● STABLE CONNECTION</small></div></div></section>
    <footer className="guide-footer"><Swords size={20} /><span>NOW YOU KNOW THE RULES.</span><b>YOUR MOVE.</b></footer>
  </div>;
}
