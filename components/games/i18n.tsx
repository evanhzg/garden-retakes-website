"use client";

// Shared EN/FR strings for the games, plus a client-side language switch.
//
// The lobby's language decides *content* the server owns (Skribbl's word bank,
// Monopoly's board). This module owns the UI chrome, and every player picks
// their own — the choice is stored per browser and applies everywhere.

import React, { useCallback, useEffect, useState } from "react";

export type Lang = "en" | "fr";

const LS_KEY = "garden_game_lang";
const listeners = new Set<(l: Lang) => void>();
let current: Lang | null = null;

function read(): Lang | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw === "fr" || raw === "en" ? raw : null;
  } catch {
    return null;
  }
}

export function setGameLang(lang: Lang) {
  current = lang;
  try { window.localStorage.setItem(LS_KEY, lang); } catch {}
  listeners.forEach((l) => l(lang));
}

/**
 * The player's UI language. Falls back to the lobby's language until they
 * choose one explicitly, so a French lobby still starts out in French.
 */
export function useGameLang(serverLang?: string | null): [Lang, (l: Lang) => void] {
  const fallback: Lang = serverLang === "fr" ? "fr" : "en";
  // Start on the server-side value so the markup matches, then settle on the
  // player's stored choice once we're in the browser.
  const [lang, setLang] = useState<Lang>(fallback);

  useEffect(() => {
    if (current == null) current = read();
    setLang(current ?? fallback);
    const fn = (l: Lang) => setLang(l);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [fallback]);

  return [lang, useCallback((l: Lang) => setGameLang(l), [])];
}

type Dict = Record<string, { en: string; fr: string }>;

/** Build a `t("key", { name })` for one dictionary + language. */
export function translator<T extends Dict>(dict: T, lang: Lang) {
  return (key: keyof T & string, params?: Record<string, string | number>): string => {
    const entry = dict[key] as { en: string; fr: string } | undefined;
    if (!entry) return key;
    let s: string = entry[lang] ?? entry.en;
    if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

// ---------------------------------------------------------------------------
// The EN / FR pill, dropped into a game's header.
// ---------------------------------------------------------------------------
export function LangToggle({ lang, onChange, className = "" }: {
  lang: Lang;
  onChange: (l: Lang) => void;
  className?: string;
}) {
  return (
    <div className={`game-lang-toggle ${className}`} role="group" aria-label="Language">
      {(["en", "fr"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          className={lang === l ? "active" : ""}
          onClick={() => onChange(l)}
          title={l === "en" ? "English" : "Français"}
          aria-pressed={lang === l}
        >
          {l === "en" ? (
            <><img src="https://flagcdn.com/w40/gb.png" alt="EN" style={{ display: "inline-block", width: "1.2em", height: "auto", borderRadius: "2px", verticalAlign: "middle", marginRight: "4px" }} /> EN</>
          ) : (
            <><img src="https://flagcdn.com/w40/fr.png" alt="FR" style={{ display: "inline-block", width: "1.2em", height: "auto", borderRadius: "2px", verticalAlign: "middle", marginRight: "4px" }} /> FR</>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OUNO
// ---------------------------------------------------------------------------
export const OUNO = {
  yourTurn:        { en: "YOUR TURN", fr: "À VOUS" },
  turnOf:          { en: "{name}'s turn", fr: "Au tour de {name}" },
  waiting:         { en: "Waiting…", fr: "En attente…" },
  youLabel:        { en: "You", fr: "Vous" },
  passTurn:        { en: "Pass turn", fr: "Passer" },
  drawCard:        { en: "Draw", fr: "Piocher" },
  cards:           { en: "{n} cards", fr: "{n} cartes" },
  oneCard:         { en: "1 card", fr: "1 carte" },
  callOuno:        { en: "OUNO!", fr: "OUNO !" },
  ounoCalled:      { en: "OUNO CALLED", fr: "OUNO ANNONCÉ" },
  catchThem:       { en: "CATCH!", fr: "ATTRAPER !" },
  catchTitle:      { en: "{name} never called OUNO — catch them", fr: "{name} n'a pas dit OUNO — attrapez-le" },
  callNow:         { en: "Call OUNO before the timer runs out", fr: "Annoncez OUNO avant la fin du chrono" },
  deckLeft:        { en: "{n} left", fr: "{n} restantes" },
  drawStack:       { en: "+{n} pending", fr: "+{n} en attente" },
  mustAnswer:      { en: "Play a draw card or take +{n}", fr: "Jouez une carte pioche ou prenez +{n}" },
  challenge:       { en: "Challenge the +4", fr: "Contester le +4" },
  challengeHint:   { en: "If they were bluffing they draw instead — if not, you take {n}", fr: "S'ils bluffaient, ils piochent — sinon vous prenez {n}" },
  chooseColor:     { en: "Choose a colour", fr: "Choisissez une couleur" },
  swapWith:        { en: "Swap hands with", fr: "Échanger sa main avec" },
  gameOver:        { en: "GAME OVER", fr: "PARTIE TERMINÉE" },
  youWon:          { en: "YOU WON! 🎉", fr: "VOUS AVEZ GAGNÉ ! 🎉" },
  someoneWon:      { en: "{name} won!", fr: "{name} a gagné !" },
  returnLobby:     { en: "Return to lobby", fr: "Retour au salon" },
  leaveGame:       { en: "Leave game", fr: "Quitter la partie" },
  houseRules:      { en: "House rules", fr: "Règles maison" },

  // colours
  red:    { en: "Red", fr: "Rouge" },
  yellow: { en: "Yellow", fr: "Jaune" },
  green:  { en: "Green", fr: "Vert" },
  blue:   { en: "Blue", fr: "Bleu" },

  // card names
  cardSkip:       { en: "Skip", fr: "Passe" },
  cardReverse:    { en: "Reverse", fr: "Sens inverse" },
  cardDraw2:      { en: "Draw Two", fr: "Pioche 2" },
  cardDraw4:      { en: "Wild Draw Four", fr: "Joker Pioche 4" },
  cardDraw6:      { en: "Draw Six", fr: "Pioche 6" },
  cardWild:       { en: "Wild", fr: "Joker" },
  cardSkipAll:    { en: "Skip Everyone", fr: "Tout le monde passe" },
  cardDiscardAll: { en: "Discard All", fr: "Tout défausser" },
  cardSwap:       { en: "Swap Hands", fr: "Échange de mains" },
  cardShuffle:    { en: "Shuffle Hands", fr: "Mains mélangées" },

  // short labels printed on the card faces
  lblAll:   { en: "ALL", fr: "TOUS" },
  lblSwap:  { en: "SWAP", fr: "ÉCHANGE" },
  lblMix:   { en: "MIX", fr: "MÉLANGE" },
  lblWild:  { en: "WILD", fr: "JOKER" },

  // event feed
  evPlay:         { en: "{name} played {card}", fr: "{name} a joué {card}" },
  evJumpIn:       { en: "{name} jumped in with {card}", fr: "{name} s'incruste avec {card}" },
  evDraw:         { en: "{name} drew {n}", fr: "{name} a pioché {n}" },
  evPenalty:      { en: "{name} takes +{n}", fr: "{name} prend +{n}" },
  evSkip:         { en: "{name} is skipped", fr: "{name} passe son tour" },
  evSkipAll:      { en: "Everyone is skipped!", fr: "Tout le monde passe !" },
  evReverse:      { en: "Direction reversed", fr: "Sens inversé" },
  evStack:        { en: "Stack is now +{n}", fr: "La pile monte à +{n}" },
  evSwap:         { en: "{name} swapped hands with {other}", fr: "{name} échange sa main avec {other}" },
  evShuffle:      { en: "{name} shuffled everyone's hands", fr: "{name} mélange toutes les mains" },
  evRotate:       { en: "Everyone passed their hand along", fr: "Toutes les mains changent de joueur" },
  evDiscardAll:   { en: "{name} dumped {n} cards", fr: "{name} se débarrasse de {n} cartes" },
  evCalled:       { en: "{name}: OUNO!", fr: "{name} : OUNO !" },
  evForgot:       { en: "{name} forgot OUNO — {n} cards", fr: "{name} a oublié OUNO — {n} cartes" },
  evCaught:       { en: "{name} caught {other} — {n} cards", fr: "{name} a attrapé {other} — {n} cartes" },
  evFalseCall:    { en: "{name} called too early — {n} cards", fr: "{name} a annoncé trop tôt — {n} cartes" },
  evFalseCatch:   { en: "{name} cried wolf — {n} cards", fr: "{name} a crié au loup — {n} cartes" },
  evChallengeWon: { en: "Bluff called! {other} draws {n}", fr: "Bluff démasqué ! {other} pioche {n}" },
  evChallengeLost:{ en: "Bad challenge — {name} draws {n}", fr: "Mauvaise contestation — {name} pioche {n}" },
  evReshuffle:    { en: "Discard pile reshuffled", fr: "Défausse remélangée" },
  evWin:          { en: "{name} is out of cards!", fr: "{name} n'a plus de cartes !" },

  // rules panel
  ruleStacking:      { en: "Stacking", fr: "Empilement" },
  ruleStackingD:     { en: "+2 / +4 / +6 pile up onto the next player instead of resolving right away.", fr: "Les +2 / +4 / +6 s'empilent sur le joueur suivant au lieu de se résoudre aussitôt." },
  ruleStackAny:      { en: "Mix draw cards", fr: "Mélanger les pioches" },
  ruleStackAnyD:     { en: "Any draw card can answer any other while stacking.", fr: "N'importe quelle carte pioche répond à une autre pendant l'empilement." },
  ruleSevenZero:     { en: "7-0 swaps", fr: "Échanges 7-0" },
  ruleSevenZeroD:    { en: "A 7 swaps hands with a player you pick, a 0 passes every hand along.", fr: "Un 7 échange votre main avec un joueur choisi, un 0 fait tourner toutes les mains." },
  ruleJumpIn:        { en: "Jump-in", fr: "Incrustation" },
  ruleJumpInD:       { en: "Hold an identical card? Play it out of turn and steal the lead.", fr: "Vous avez la carte identique ? Jouez-la hors tour et reprenez la main." },
  rulePlayOnDraw:    { en: "Play what you draw", fr: "Jouer la carte piochée" },
  rulePlayOnDrawD:   { en: "You may immediately play the card you just drew.", fr: "Vous pouvez jouer immédiatement la carte que vous venez de piocher." },
  ruleDrawToMatch:   { en: "Draw until playable", fr: "Piocher jusqu'à pouvoir jouer" },
  ruleDrawToMatchD:  { en: "Keep drawing until something in your hand is legal.", fr: "Piochez jusqu'à obtenir une carte jouable." },
  ruleForcePlay:     { en: "Forced play", fr: "Jeu obligatoire" },
  ruleForcePlayD:    { en: "If you hold a legal card you are not allowed to draw.", fr: "Si vous avez une carte jouable, vous ne pouvez pas piocher." },
  ruleChallenge:     { en: "Challenge the +4", fr: "Contestation du +4" },
  ruleChallengeD:    { en: "Suspect a bluff? Call it. Wrong guesses cost you two extra cards.", fr: "Vous flairez le bluff ? Contestez. Une erreur vous coûte deux cartes de plus." },
  ruleStartingCards: { en: "Starting hand", fr: "Main de départ" },
  ruleCallWindow:    { en: "OUNO window", fr: "Fenêtre OUNO" },
  ruleCallWindowD:   { en: "How long you have to shout OUNO after dropping to one card.", fr: "Temps pour annoncer OUNO après être descendu à une carte." },
  ruleAutoPenalty:   { en: "Table punishes you", fr: "La table vous punit" },
  ruleAutoPenaltyD:  { en: "The window fines you automatically — nobody has to be watching.", fr: "La fenêtre vous sanctionne automatiquement, même si personne ne surveille." },
  ruleForgotPenalty: { en: "Forgetting costs", fr: "Oubli" },
  ruleFalseCall:     { en: "Early call costs", fr: "Annonce trop tôt" },
  ruleFalseCatch:    { en: "Bad catch costs", fr: "Mauvaise accusation" },
  ruleCardsUnit:     { en: "{n} cards", fr: "{n} cartes" },
  ruleSeconds:       { en: "{n}s", fr: "{n} s" },

  extraSwap:       { en: "Wild Swap Hands", fr: "Joker Échange" },
  extraSwapD:      { en: "Trade your whole hand with any player.", fr: "Échangez toute votre main avec un joueur." },
  extraShuffle:    { en: "Wild Shuffle Hands", fr: "Joker Mélange" },
  extraShuffleD:   { en: "Every hand goes into one pile, shuffled and dealt back out.", fr: "Toutes les mains sont réunies, mélangées et redistribuées." },
  extraSkipAll:    { en: "Skip Everyone", fr: "Tout le monde passe" },
  extraSkipAllD:   { en: "The whole table loses a turn and play comes straight back to you.", fr: "Toute la table saute un tour et la main vous revient." },
  extraDiscardAll: { en: "Discard All", fr: "Tout défausser" },
  extraDiscardAllD:{ en: "Bin every card of that colour you are holding.", fr: "Défaussez toutes vos cartes de cette couleur." },
  extraDrawSix:    { en: "Draw Six", fr: "Pioche 6" },
  extraDrawSixD:   { en: "A coloured +6, because +4 was not enough.", fr: "Un +6 coloré, parce que le +4 ne suffisait pas." },

  presetsTitle:    { en: "Presets", fr: "Préréglages" },
  presetClassic:   { en: "Classic", fr: "Classique" },
  presetChaos:     { en: "Chaos", fr: "Chaos" },
  presetBrutal:    { en: "No Mercy", fr: "Sans pitié" },
  optionalCards:   { en: "Optional cards", fr: "Cartes optionnelles" },
  hostOnly:        { en: "Only the host changes the rules", fr: "Seul l'hôte modifie les règles" },
} as const;

// ---------------------------------------------------------------------------
// Skribbl
// ---------------------------------------------------------------------------
export const SKRIBBL = {
  round:            { en: "Round {n}/{m}", fr: "Manche {n}/{m}" },
  isDrawing:        { en: "{name} is drawing", fr: "{name} dessine" },
  youAreDrawing:    { en: "You are drawing", fr: "C'est vous qui dessinez" },
  isChoosing:       { en: "{name} is choosing a word…", fr: "{name} choisit un mot…" },
  chooseWord:       { en: "Choose a word to draw", fr: "Choisissez un mot à dessiner" },
  autoPick:         { en: "Auto-pick in {n}s", fr: "Choix automatique dans {n} s" },
  guessPlaceholder: { en: "Type your guess…", fr: "Votre proposition…" },
  youGuessed:       { en: "You got it! +{n}", fr: "Trouvé ! +{n}" },
  guessedIt:        { en: "{name} guessed the word", fr: "{name} a trouvé le mot" },
  closeGuess:       { en: "so close!", fr: "presque !" },
  theWordWas:       { en: "The word was", fr: "Le mot était" },
  nextIn:           { en: "Next turn in {n}s", fr: "Tour suivant dans {n} s" },
  nextTurn:         { en: "Next turn", fr: "Tour suivant" },
  returnLobby:      { en: "Return to lobby", fr: "Retour au salon" },
  leaveGame:        { en: "Leave game", fr: "Quitter la partie" },
  gameOver:         { en: "Game over", fr: "Partie terminée" },
  winner:           { en: "{name} wins with {n} points!", fr: "{name} gagne avec {n} points !" },
  finalScores:      { en: "Final scores", fr: "Scores finaux" },
  points:           { en: "pts", fr: "pts" },
  clear:            { en: "Clear", fr: "Effacer" },
  undo:             { en: "Undo", fr: "Annuler" },
  brush:            { en: "Brush", fr: "Pinceau" },
  eraser:           { en: "Eraser", fr: "Gomme" },
  waitingToStart:   { en: "Waiting for the round to start…", fr: "En attente du début de la manche…" },
  hurryUp:          { en: "Hurry up!", fr: "Dépêchez-vous !" },
  drawing:          { en: "drawing", fr: "dessine" },
  guessed:          { en: "guessed", fr: "trouvé" },
  youLabel:         { en: "you", fr: "vous" },
  hintRevealed:     { en: "A letter was revealed", fr: "Une lettre est révélée" },
  wordLanguage:     { en: "Words: {lang}", fr: "Mots : {lang}" },

  // launch options (lobby)
  optionsTitle:     { en: "FREE-DRAW setup", fr: "Réglages FREE-DRAW" },
  hostOnly:         { en: "Only the host changes the setup", fr: "Seul l'hôte modifie les réglages" },
  rounds:           { en: "Rounds", fr: "Manches" },
  roundsHint:       { en: "Everyone draws once per round", fr: "Chacun dessine une fois par manche" },
  roundsUnit:       { en: "{n} rounds", fr: "{n} manches" },
  wordsFrom:        { en: "Words: {lang}", fr: "Mots : {lang}" },
  langEnglish:      { en: "English", fr: "anglais" },
  langFrench:       { en: "French", fr: "français" },
} as const;

// ---------------------------------------------------------------------------
// HEADSHOT — guess the CS pro
// ---------------------------------------------------------------------------
export const HEADSHOT = {
  brand:          { en: "HEADSHOT", fr: "HEADSHOT" },
  tagline:        { en: "Guess today's Counter-Strike pro", fr: "Devinez le pro Counter-Strike du jour" },

  // modes
  modeDaily:      { en: "Daily", fr: "Quotidien" },
  modeDailyD:     { en: "One pro a day, the same one for everyone.", fr: "Un pro par jour, le même pour tout le monde." },
  modeEndless:    { en: "Endless", fr: "Sans fin" },
  modeEndlessD:   { en: "Keep going as long as you like.", fr: "Enchaînez autant que vous voulez." },
  modeRace:       { en: "Race", fr: "Course" },
  modeRaceD:      { en: "First to {n} correct wins.", fr: "Le premier à {n} bonnes réponses gagne." },
  playWithFriends:{ en: "Play with friends", fr: "Jouer entre amis" },

  // board
  searchPlaceholder: { en: "Type a player…", fr: "Tapez un joueur…" },
  noMatches:      { en: "No player by that name", fr: "Aucun joueur de ce nom" },
  alreadyGuessed: { en: "Already guessed", fr: "Déjà proposé" },
  guessCount:     { en: "{n} guesses", fr: "{n} essais" },
  oneGuess:       { en: "1 guess", fr: "1 essai" },
  loading:        { en: "Loading the roster…", fr: "Chargement de l'effectif…" },
  loadFailed:     { en: "Couldn't load the player list", fr: "Impossible de charger la liste des joueurs" },
  retry:          { en: "Retry", fr: "Réessayer" },

  // columns
  colPlayer:      { en: "Player", fr: "Joueur" },
  colNationality: { en: "Nation", fr: "Nation" },
  colTeam:        { en: "Team", fr: "Équipe" },
  colRole:        { en: "Role", fr: "Rôle" },
  colAge:         { en: "Age", fr: "Âge" },
  colMajors:      { en: "Majors", fr: "Majors" },

  // legend
  legendTitle:    { en: "How to read a row", fr: "Comment lire une ligne" },
  legendHit:      { en: "Exact match", fr: "Correspondance exacte" },
  legendNear:     { en: "Close — same continent, a shared team or role, or within 2", fr: "Proche — même continent, équipe ou rôle en commun, ou à 2 près" },
  legendMiss:     { en: "No match", fr: "Aucune correspondance" },
  legendArrow:    { en: "▲ / ▼ points towards the answer", fr: "▲ / ▼ indique la direction de la réponse" },

  // roles
  roleAwp:        { en: "AWPer", fr: "AWPeur" },
  roleIgl:        { en: "IGL", fr: "IGL" },
  roleEntry:      { en: "Entry", fr: "Entrée" },
  roleLurker:     { en: "Lurker", fr: "Lurkeur" },
  roleSupport:    { en: "Support", fr: "Soutien" },
  roleRifle:      { en: "Rifler", fr: "Rifleur" },
  roleCoach:      { en: "Coach", fr: "Coach" },

  // daily result
  solved:         { en: "Got it!", fr: "Trouvé !" },
  solvedIn:       { en: "Solved in {n}", fr: "Trouvé en {n}" },
  theAnswerWas:   { en: "The answer was", fr: "La réponse était" },
  nextIn:         { en: "Next pro in {t}", fr: "Prochain pro dans {t}" },
  streak:         { en: "Streak", fr: "Série" },
  bestStreak:     { en: "Best", fr: "Record" },
  played:         { en: "Played", fr: "Parties" },
  avgGuesses:     { en: "Avg", fr: "Moy." },
  share:          { en: "Share", fr: "Partager" },
  copied:         { en: "Copied!", fr: "Copié !" },
  puzzleNo:       { en: "HEADSHOT #{n}", fr: "HEADSHOT n°{n}" },
  playEndless:    { en: "Play endless mode", fr: "Passer en mode sans fin" },
  newPro:         { en: "New pro", fr: "Nouveau pro" },
  giveUp:         { en: "Give up", fr: "Abandonner" },

  // race
  raceTitle:      { en: "Race to {n}", fr: "Course à {n}" },
  raceScore:      { en: "{n}/{m}", fr: "{n}/{m}" },
  raceRivals:     { en: "Rivals", fr: "Adversaires" },
  raceYou:        { en: "You", fr: "Vous" },
  raceGuessing:   { en: "{n} guesses in", fr: "{n} essais" },
  raceRevealIn:   { en: "{n} left before it's revealed", fr: "{n} avant révélation" },
  raceRevealed:   { en: "Ran out of guesses — it was {name}", fr: "Plus d'essais — c'était {name}" },
  raceSolved:     { en: "{name} down!", fr: "{name}, trouvé !" },
  raceWon:        { en: "You won the race! 🎉", fr: "Vous gagnez la course ! 🎉" },
  raceLost:       { en: "{name} got there first", fr: "{name} est arrivé le premier" },
  raceStandings:  { en: "Standings", fr: "Classement" },
  raceRun:        { en: "The run", fr: "Le parcours" },
  returnLobby:    { en: "Return to lobby", fr: "Retour au salon" },
  leaveGame:      { en: "Leave game", fr: "Quitter la partie" },
  waitingStart:   { en: "Waiting for the race to start…", fr: "En attente du départ…" },

  // event log
  evSolved:       { en: "{name} identified {who}", fr: "{name} a trouvé {who}" },
  evRevealed:     { en: "{name} gave up on {who}", fr: "{name} a séché sur {who}" },
  evTimeout:      { en: "Time's up — it was {who}", fr: "Temps écoulé — c'était {who}" },
  evWin:          { en: "{name} wins the race!", fr: "{name} gagne la course !" },
  evStart:        { en: "Race to {n} — go!", fr: "Course à {n} — partez !" },

  // lobby setup
  optionsTitle:   { en: "HEADSHOT setup", fr: "Réglages HEADSHOT" },
  hostOnly:       { en: "Only the host changes the setup", fr: "Seul l'hôte modifie les réglages" },
  targetScore:    { en: "Race to", fr: "Course à" },
  targetScoreD:   { en: "How many pros you have to identify to win.", fr: "Nombre de pros à identifier pour gagner." },
  roundTimer:     { en: "Clock per pro", fr: "Chrono par pro" },
  revealAfter:    { en: "Guesses allowed", fr: "Essais autorisés" },
  revealAfterD:   { en: "Miss this many and the answer is shown so you can move on.", fr: "Après ce nombre d'erreurs, la réponse est révélée et vous passez au suivant." },
  seconds:        { en: "{n}s", fr: "{n} s" },
  noTimer:        { en: "Off", fr: "Sans" },
  correctUnit:    { en: "{n} correct", fr: "{n} bonnes" },

  dataFrom:       { en: "Player data from Liquipedia", fr: "Données joueurs via Liquipedia" },
} as const;

// ---------------------------------------------------------------------------
// PENTAKILL — guess the League champion
// ---------------------------------------------------------------------------
export const PENTAKILL = {
  brand:          { en: "PENTAKILL", fr: "PENTAKILL" },
  tagline:        { en: "Guess today's League champion", fr: "Devinez le champion League du jour" },

  modeDaily:      { en: "Daily", fr: "Quotidien" },
  modeDailyD:     { en: "One champion a day, the same one for everyone.", fr: "Un champion par jour, le même pour tout le monde." },
  modeEndless:    { en: "Endless", fr: "Sans fin" },
  modeEndlessD:   { en: "Keep going as long as you like.", fr: "Enchaînez autant que vous voulez." },
  modeRace:       { en: "Race", fr: "Course" },
  playWithFriends:{ en: "Play with friends", fr: "Jouer entre amis" },

  searchPlaceholder: { en: "Type a champion…", fr: "Tapez un champion…" },
  noMatches:      { en: "No champion by that name", fr: "Aucun champion de ce nom" },
  guessCount:     { en: "{n} guesses", fr: "{n} essais" },
  oneGuess:       { en: "1 guess", fr: "1 essai" },
  loading:        { en: "Loading champions…", fr: "Chargement des champions…" },
  loadFailed:     { en: "Couldn't load the champion list", fr: "Impossible de charger la liste des champions" },
  retry:          { en: "Retry", fr: "Réessayer" },

  // columns
  colChampion:    { en: "Champion", fr: "Champion" },
  colClass:       { en: "Class", fr: "Classe" },
  colPosition:    { en: "Position", fr: "Poste" },
  colRegion:      { en: "Region", fr: "Région" },
  colResource:    { en: "Resource", fr: "Ressource" },
  colRange:       { en: "Range", fr: "Portée" },
  colDamage:      { en: "Damage", fr: "Dégâts" },
  colYear:        { en: "Released", fr: "Sortie" },

  legendTitle:    { en: "How to read a row", fr: "Comment lire une ligne" },
  legendHit:      { en: "Exact match", fr: "Correspondance exacte" },
  legendNear:     { en: "Partial — some values shared, or within 2 years", fr: "Partiel — valeurs en commun, ou à 2 ans près" },
  legendMiss:     { en: "No match", fr: "Aucune correspondance" },
  legendArrow:    { en: "▲ / ▼ points towards the answer", fr: "▲ / ▼ indique la direction de la réponse" },

  // result
  solved:         { en: "Got it!", fr: "Trouvé !" },
  solvedIn:       { en: "Solved in {n}", fr: "Trouvé en {n}" },
  theAnswerWas:   { en: "The answer was", fr: "La réponse était" },
  nextIn:         { en: "Next champion in {t}", fr: "Prochain champion dans {t}" },
  streak:         { en: "Streak", fr: "Série" },
  bestStreak:     { en: "Best", fr: "Record" },
  played:         { en: "Played", fr: "Parties" },
  avgGuesses:     { en: "Avg", fr: "Moy." },
  share:          { en: "Share", fr: "Partager" },
  copied:         { en: "Copied!", fr: "Copié !" },
  puzzleNo:       { en: "PENTAKILL #{n}", fr: "PENTAKILL n°{n}" },
  playEndless:    { en: "Play endless mode", fr: "Passer en mode sans fin" },
  newChampion:    { en: "New champion", fr: "Nouveau champion" },
  giveUp:         { en: "Give up", fr: "Abandonner" },

  // race
  raceTitle:      { en: "Race to {n}", fr: "Course à {n}" },
  raceScore:      { en: "{n}/{m}", fr: "{n}/{m}" },
  raceRivals:     { en: "Rivals", fr: "Adversaires" },
  raceYou:        { en: "You", fr: "Vous" },
  raceGuessing:   { en: "{n} guesses in", fr: "{n} essais" },
  raceRevealIn:   { en: "{n} left before it's revealed", fr: "{n} avant révélation" },
  raceWon:        { en: "You won the race! 🎉", fr: "Vous gagnez la course ! 🎉" },
  raceLost:       { en: "{name} got there first", fr: "{name} est arrivé le premier" },
  raceStandings:  { en: "Standings", fr: "Classement" },
  raceRun:        { en: "The run", fr: "Le parcours" },
  returnLobby:    { en: "Return to lobby", fr: "Retour au salon" },
  leaveGame:      { en: "Leave game", fr: "Quitter la partie" },

  evSolved:       { en: "{name} identified {who}", fr: "{name} a trouvé {who}" },
  evRevealed:     { en: "{name} gave up on {who}", fr: "{name} a séché sur {who}" },
  evTimeout:      { en: "Time's up — it was {who}", fr: "Temps écoulé — c'était {who}" },
  evWin:          { en: "{name} wins the race!", fr: "{name} gagne la course !" },
  evStart:        { en: "Race to {n} — go!", fr: "Course à {n} — partez !" },

  // lobby setup
  optionsTitle:   { en: "PENTAKILL setup", fr: "Réglages PENTAKILL" },
  hostOnly:       { en: "Only the host changes the setup", fr: "Seul l'hôte modifie les réglages" },
  targetScore:    { en: "Race to", fr: "Course à" },
  targetScoreD:   { en: "How many champions you have to identify to win.", fr: "Nombre de champions à identifier pour gagner." },
  roundTimer:     { en: "Clock per champion", fr: "Chrono par champion" },
  revealAfter:    { en: "Guesses allowed", fr: "Essais autorisés" },
  revealAfterD:   { en: "Miss this many and the answer is shown so you can move on.", fr: "Après ce nombre d'erreurs, la réponse est révélée et vous passez au suivant." },
  seconds:        { en: "{n}s", fr: "{n} s" },
  noTimer:        { en: "Off", fr: "Sans" },
  correctUnit:    { en: "{n} correct", fr: "{n} bonnes" },

  dataFrom:       { en: "Champion data from Riot Data Dragon & the League wiki", fr: "Données via Riot Data Dragon et le wiki League" },
  patchLabel:     { en: "Patch {v}", fr: "Patch {v}" },
} as const;

/** Enum values that appear on the PENTAKILL board, localized. */
export const LOL_TERMS: Record<string, { en: string; fr: string }> = {
  // classes
  Mage: { en: "Mage", fr: "Mage" },
  Assassin: { en: "Assassin", fr: "Assassin" },
  Fighter: { en: "Fighter", fr: "Combattant" },
  Tank: { en: "Tank", fr: "Tank" },
  Marksman: { en: "Marksman", fr: "Tireur" },
  Support: { en: "Support", fr: "Support" },
  Specialist: { en: "Specialist", fr: "Spécialiste" },
  Controller: { en: "Controller", fr: "Contrôleur" },
  Juggernaut: { en: "Juggernaut", fr: "Mastodonte" },
  Diver: { en: "Diver", fr: "Plongeur" },
  Skirmisher: { en: "Skirmisher", fr: "Escarmoucheur" },
  Warden: { en: "Warden", fr: "Gardien" },
  Vanguard: { en: "Vanguard", fr: "Avant-garde" },
  Burst: { en: "Burst", fr: "Burst" },
  Battlemage: { en: "Battlemage", fr: "Mage de combat" },
  Artillery: { en: "Artillery", fr: "Artilleur" },
  Enchanter: { en: "Enchanter", fr: "Enchanteur" },
  Catcher: { en: "Catcher", fr: "Attrapeur" },

  // positions
  Top: { en: "Top", fr: "Top" },
  Jungle: { en: "Jungle", fr: "Jungle" },
  Middle: { en: "Mid", fr: "Milieu" },
  Bottom: { en: "Bot", fr: "Bot" },

  // regions
  Ionia: { en: "Ionia", fr: "Ionia" },
  Noxus: { en: "Noxus", fr: "Noxus" },
  Demacia: { en: "Demacia", fr: "Demacia" },
  Freljord: { en: "Freljord", fr: "Freljord" },
  Piltover: { en: "Piltover", fr: "Piltover" },
  Zaun: { en: "Zaun", fr: "Zaun" },
  Shurima: { en: "Shurima", fr: "Shurima" },
  Targon: { en: "Targon", fr: "Targon" },
  Ixtal: { en: "Ixtal", fr: "Ixtal" },
  Bilgewater: { en: "Bilgewater", fr: "Bilgewater" },
  "Bandle City": { en: "Bandle City", fr: "Bandle City" },
  "Shadow Isles": { en: "Shadow Isles", fr: "Îles Obscures" },
  Void: { en: "Void", fr: "Néant" },
  Runeterra: { en: "Runeterra", fr: "Runeterra" },

  // resources
  Mana: { en: "Mana", fr: "Mana" },
  Energy: { en: "Energy", fr: "Énergie" },
  None: { en: "None", fr: "Aucune" },
  Health: { en: "Health", fr: "Vie" },
  Rage: { en: "Rage", fr: "Rage" },
  Fury: { en: "Fury", fr: "Furie" },
  Ferocity: { en: "Ferocity", fr: "Férocité" },
  Heat: { en: "Heat", fr: "Chaleur" },
  Grit: { en: "Grit", fr: "Cran" },
  Courage: { en: "Courage", fr: "Courage" },
  Shield: { en: "Shield", fr: "Bouclier" },
  Flow: { en: "Flow", fr: "Flux" },
  Frenzy: { en: "Frenzy", fr: "Frénésie" },
  "Blood Well": { en: "Blood Well", fr: "Puits de sang" },
  "Crimson Rush": { en: "Crimson Rush", fr: "Ruée pourpre" },

  // range + damage
  Melee: { en: "Melee", fr: "Corps à corps" },
  Ranged: { en: "Ranged", fr: "À distance" },
  Physical: { en: "Physical", fr: "Physique" },
  Magic: { en: "Magic", fr: "Magique" },
  Mixed: { en: "Mixed", fr: "Mixte" },
};

/** Localize one LoL enum value, falling back to the raw English string. */
export function lolTerm(value: string, lang: Lang): string {
  const entry = LOL_TERMS[value];
  return entry ? entry[lang] ?? entry.en : value;
}

// ---------------------------------------------------------------------------
// Shared quiz chrome (BUILD PATH + BUY MENU)
// ---------------------------------------------------------------------------
export const QUIZ = {
  modeDaily:      { en: "Daily", fr: "Quotidien" },
  modeDailyD:     { en: "One paper a day per tier, the same for everyone.", fr: "Une série par jour et par palier, la même pour tous." },
  modePractice:   { en: "Practice", fr: "Entraînement" },
  modePracticeD:  { en: "Fresh questions whenever you want.", fr: "De nouvelles questions quand vous voulez." },
  modeRace:       { en: "Race", fr: "Course" },
  playWithFriends:{ en: "Play with friends", fr: "Jouer entre amis" },

  difficulty:     { en: "Difficulty", fr: "Difficulté" },
  question:       { en: "Question {n}/{m}", fr: "Question {n}/{m}" },
  score:          { en: "Score", fr: "Score" },
  correct:        { en: "Correct!", fr: "Correct !" },
  wrong:          { en: "Not quite", fr: "Raté" },
  theAnswer:      { en: "Answer: {a}", fr: "Réponse : {a}" },
  next:           { en: "Next", fr: "Suivant" },
  finish:         { en: "See results", fr: "Voir le résultat" },
  loading:        { en: "Building your quiz…", fr: "Préparation du quiz…" },
  loadFailed:     { en: "Couldn't load the quiz", fr: "Impossible de charger le quiz" },
  retry:          { en: "Retry", fr: "Réessayer" },

  resultTitle:    { en: "{n}/{m} correct", fr: "{n}/{m} bonnes réponses" },
  resultPerfect:  { en: "Flawless.", fr: "Sans faute." },
  resultGreat:    { en: "Strong showing.", fr: "Belle performance." },
  resultOk:       { en: "Room to climb.", fr: "Encore du chemin." },
  resultPoor:     { en: "Back to the drawing board.", fr: "On retourne réviser." },
  playAgain:      { en: "Play again", fr: "Rejouer" },
  harder:         { en: "Try the next tier", fr: "Palier suivant" },
  nextIn:         { en: "Next daily in {t}", fr: "Prochain quotidien dans {t}" },
  alreadyPlayed:  { en: "You've already played today's {tier} paper", fr: "Vous avez déjà fait la série {tier} du jour" },
  yourResult:     { en: "Your result: {n}/{m}", fr: "Votre résultat : {n}/{m}" },
  share:          { en: "Share", fr: "Partager" },
  copied:         { en: "Copied!", fr: "Copié !" },
  streak:         { en: "Streak", fr: "Série" },
  bestScore:      { en: "Best", fr: "Record" },
  played:         { en: "Played", fr: "Parties" },
  accuracy:       { en: "Accuracy", fr: "Précision" },

  // race
  raceTitle:      { en: "First to {n}", fr: "Premier à {n}" },
  raceRivals:     { en: "Rivals", fr: "Adversaires" },
  raceYou:        { en: "You", fr: "Vous" },
  raceWon:        { en: "You won the race! 🎉", fr: "Vous gagnez la course ! 🎉" },
  raceLost:       { en: "{name} got there first", fr: "{name} est arrivé le premier" },
  raceStandings:  { en: "Standings", fr: "Classement" },
  returnLobby:    { en: "Return to lobby", fr: "Retour au salon" },
  leaveGame:      { en: "Leave game", fr: "Quitter la partie" },
  waitingOthers:  { en: "Waiting for the others…", fr: "En attente des autres…" },
} as const;

// ---------------------------------------------------------------------------
// BUILD PATH — LoL item / champion quiz
// ---------------------------------------------------------------------------
export const BUILDPATH = {
  brand:      { en: "BUILD PATH", fr: "BUILD PATH" },
  tagline:    { en: "Items, champions and the maths behind them", fr: "Objets, champions et les calculs qui vont avec" },
  dataFrom:   { en: "Item & champion data from Riot Data Dragon and the League wiki", fr: "Objets et champions via Riot Data Dragon et le wiki League" },
  patchLabel: { en: "Patch {v}", fr: "Patch {v}" },

  tier1: { en: "Iron", fr: "Fer" },
  tier2: { en: "Gold", fr: "Or" },
  tier3: { en: "Diamond", fr: "Diamant" },
  tier4: { en: "Challenger", fr: "Challenger" },
  tier1D: { en: "Do you know what things are called and what they cost?", fr: "Connaissez-vous les noms et les prix ?" },
  tier2D: { en: "Build paths and champion basics.", fr: "Chemins d'objets et bases des champions." },
  tier3D: { en: "Applied knowledge — what fits which champion.", fr: "Savoir appliqué — quel objet pour quel champion." },
  tier4D: { en: "Exact combine costs, stats and release years.", fr: "Coûts de combinaison, stats et années exactes." },

  // question prompts
  qItemCost:        { en: "How much does {item} cost in total?", fr: "Combien coûte {item} au total ?" },
  eItemCost:        { en: "{item} costs {n} gold.", fr: "{item} coûte {n} po." },
  qChampRegion:     { en: "Which region is {champ} from?", fr: "De quelle région vient {champ} ?" },
  qChampClass:      { en: "What is {champ}'s primary class?", fr: "Quelle est la classe principale de {champ} ?" },
  qChampPosition:   { en: "Which lane does {champ} play?", fr: "Sur quelle voie joue {champ} ?" },
  qBuildsFrom:      { en: "Which component does {item} build from?", fr: "À partir de quel composant se construit {item} ?" },
  eBuildsFrom:      { en: "{item} = {parts}.", fr: "{item} = {parts}." },
  qBuildsInto:      { en: "Which item does {item} build into?", fr: "En quel objet {item} se transforme-t-il ?" },
  qItemForChampion: { en: "{champ} deals {type} damage. Which of these scales it?", fr: "{champ} inflige des dégâts {type}. Lequel de ces objets les augmente ?" },
  eItemForChampion: { en: "{champ}'s damage is {type}, so {item} is the one that scales it.", fr: "Les dégâts de {champ} sont {type} : c'est {item} qui les augmente." },
  qWhoseAbility:    { en: "Which champion has the ability “{ability}”?", fr: "Quel champion possède la compétence « {ability} » ?" },
  qHighestStat:     { en: "Which of these gives the most {stat}?", fr: "Lequel donne le plus de {stat} ?" },
  eHighestStat:     { en: "{item}, with {n}.", fr: "{item}, avec {n}." },
  qCombineCost:     { en: "What is {item}'s combine cost (the upgrade fee alone)?", fr: "Quel est le coût de combinaison de {item} (hors composants) ?" },
  eCombineCost:     { en: "{n} gold on top of its parts, {total} gold all in.", fr: "{n} po en plus des composants, {total} po au total." },
  qChampYear:       { en: "Which year was {champ} released?", fr: "En quelle année {champ} est-il sorti ?" },
  qMostExpensive:   { en: "Which of these items is the most expensive?", fr: "Lequel de ces objets est le plus cher ?" },
  eMostExpensive:   { en: "{item}, at {n} gold.", fr: "{item}, à {n} po." },

  // stat labels
  statAp:    { en: "Ability Power", fr: "Puissance" },
  statAd:    { en: "Attack Damage", fr: "Dégâts d'attaque" },
  statArmor: { en: "Armour", fr: "Armure" },
  statMr:    { en: "Magic Resist", fr: "Résistance magique" },
  statHp:    { en: "Health", fr: "Vie" },
  statMs:    { en: "Move Speed", fr: "Vitesse" },
  statAs:    { en: "Attack Speed", fr: "Vitesse d'attaque" },
  statCrit:  { en: "Crit Chance", fr: "Chances de critique" },

  optionsTitle: { en: "BUILD PATH setup", fr: "Réglages BUILD PATH" },
  hostOnly:     { en: "Only the host changes the setup", fr: "Seul l'hôte modifie les réglages" },
} as const;

// ---------------------------------------------------------------------------
// BUY MENU — CS2 economy / weapon quiz
// ---------------------------------------------------------------------------
export const BUYMENU = {
  brand:      { en: "BUY MENU", fr: "BUY MENU" },
  tagline:    { en: "Prices, rewards and the economy behind every round", fr: "Prix, primes et l'économie de chaque round" },
  dataFrom:   { en: "Curated CS2 constants — prices, kill rewards and the loss ladder", fr: "Constantes CS2 curées — prix, primes et échelle de défaite" },
  patchLabel: { en: "{v}", fr: "{v}" },

  tier1: { en: "Silver", fr: "Silver" },
  tier2: { en: "Gold Nova", fr: "Gold Nova" },
  tier3: { en: "Eagle", fr: "Eagle" },
  tier4: { en: "Global", fr: "Global" },
  tier1D: { en: "The prices you punch in every round.", fr: "Les prix que vous tapez chaque round." },
  tier2D: { en: "Kill rewards and who can buy what.", fr: "Primes de kill et qui achète quoi." },
  tier3D: { en: "Round economy and map callouts.", fr: "Économie de round et callouts." },
  tier4D: { en: "The loss ladder, magazines and exact numbers.", fr: "Échelle de défaite, chargeurs et chiffres exacts." },

  qWeaponPrice:    { en: "How much does the {weapon} cost?", fr: "Combien coûte le {weapon} ?" },
  eWeaponPrice:    { en: "The {weapon} costs ${n}.", fr: "Le {weapon} coûte {n} $." },
  qUtilityPrice:   { en: "How much does {item} cost?", fr: "Combien coûte {item} ?" },
  qWeaponCategory: { en: "Which category is the {weapon} in?", fr: "Dans quelle catégorie se trouve le {weapon} ?" },
  qKillReward:     { en: "How much does a kill with the {weapon} pay?", fr: "Combien rapporte un kill au {weapon} ?" },
  eKillReward:     { en: "${n} per kill.", fr: "{n} $ par kill." },
  qWhichTeam:      { en: "Which side can buy the {weapon}?", fr: "Quel camp peut acheter le {weapon} ?" },
  eWhichTeam:      { en: "The {weapon} is {team} only.", fr: "Le {weapon} est réservé aux {team}." },
  qCheapestOf:     { en: "Which of these is the cheapest?", fr: "Lequel est le moins cher ?" },
  eCheapestOf:     { en: "The {weapon}, at ${n}.", fr: "Le {weapon}, à {n} $." },
  qPriciestOf:     { en: "Which of these is the most expensive?", fr: "Lequel est le plus cher ?" },
  ePriciestOf:     { en: "The {weapon}, at ${n}.", fr: "Le {weapon}, à {n} $." },
  qCallout:        { en: "Which map has the callout “{callout}”?", fr: "Quelle carte a le callout « {callout} » ?" },
  qFullBuy:        { en: "{weapon}, armour + helmet, a smoke and a flash — what's the total?", fr: "{weapon}, armure + casque, une fumi et une flash — quel total ?" },
  eFullBuy:        { en: "${a} + ${b} + ${c} = ${n}.", fr: "{a} $ + {b} $ + {c} $ = {n} $." },
  qLossLadder:     { en: "What is the loss bonus on your {n}th consecutive loss?", fr: "Quelle est la prime après {n} défaites consécutives ?" },
  eLossLadder:     { en: "The ladder runs {ladder}.", fr: "L'échelle est {ladder}." },
  qMagSize:        { en: "How many rounds are in a {weapon} magazine?", fr: "Combien de balles dans un chargeur de {weapon} ?" },
  qWeaponDamage:   { en: "What is the {weapon}'s base damage?", fr: "Quels sont les dégâts de base du {weapon} ?" },

  qEco_winElimination:    { en: "How much does winning a round by elimination pay?", fr: "Combien rapporte une victoire par élimination ?" },
  qEco_winBombDetonated:  { en: "How much does the T side get when the bomb detonates?", fr: "Combien gagnent les T quand la bombe explose ?" },
  qEco_winBombDefused:    { en: "How much does the CT side get for defusing?", fr: "Combien gagnent les CT pour un désamorçage ?" },
  qEco_plantBonusTeam:    { en: "How much does the T team get for planting, even in a lost round?", fr: "Combien gagnent les T pour une pose, même en perdant ?" },
  qEco_defuseBonusPlayer: { en: "How much does the player who defuses get personally?", fr: "Combien touche personnellement le joueur qui désamorce ?" },

  teamCt:   { en: "Counter-Terrorists", fr: "Anti-terroristes" },
  teamT:    { en: "Terrorists", fr: "Terroristes" },
  teamBoth: { en: "Both sides", fr: "Les deux camps" },

  optionsTitle: { en: "BUY MENU setup", fr: "Réglages BUY MENU" },
  hostOnly:     { en: "Only the host changes the setup", fr: "Seul l'hôte modifie les réglages" },
} as const;

// ---------------------------------------------------------------------------
// MONOPO7Y — lobby setup strings only; the board itself is served localized.
// ---------------------------------------------------------------------------
export const MONOPOLY = {
  optionsTitle:  { en: "MONOPO7Y setup", fr: "Réglages MONOPO7Y" },
  hostOnly:      { en: "Only the host changes the setup", fr: "Seul l'hôte modifie les réglages" },
  board:         { en: "Board", fr: "Plateau" },
  boardHint:     { en: "Pick a built-in board or one you made in the editor", fr: "Choisissez un plateau intégré ou créé dans l'éditeur" },
  custom:        { en: "custom", fr: "perso" },
  tiles:         { en: "{n} tiles", fr: "{n} cases" },
  editBoards:    { en: "Create / edit boards", fr: "Créer / modifier des plateaux" },
  testBuildings: { en: "Test buildings", fr: "Tester les bâtiments" },
  mode:          { en: "Mode", fr: "Mode" },
  modeFfa:       { en: "Free-for-all", fr: "Chacun pour soi" },
  modeFfaD:      { en: "Everyone plays for themselves.", fr: "Chacun joue pour soi." },
  mode2v2:       { en: "2v2 allies", fr: "Alliés 2c2" },
  mode2v2D:      { en: "Exactly 4 players, 2 per team — teammates pay no rent to each other.", fr: "Exactement 4 joueurs, 2 par équipe — les alliés ne se paient pas de loyer." },
} as const;

// ---------------------------------------------------------------------------
// Make It Meme
// ---------------------------------------------------------------------------
export const MEME = {
  round:            { en: "Round {n}/{m}", fr: "Manche {n}/{m}" },
  phaseCaption:     { en: "Caption it!", fr: "Légendez !" },
  phaseGif:         { en: "Answer with a GIF", fr: "Répondez en GIF" },
  phaseVote:        { en: "Vote for the best", fr: "Votez pour le meilleur" },
  phaseResults:     { en: "Results", fr: "Résultats" },
  writeCaption:     { en: "Your caption", fr: "Votre légende" },
  captionSlot:      { en: "Caption {n}", fr: "Légende {n}" },
  submit:           { en: "Submit", fr: "Valider" },
  submitted:        { en: "Submitted! Waiting for the others…", fr: "Envoyé ! En attente des autres…" },
  waitingCount:     { en: "{n}/{m} ready", fr: "{n}/{m} prêts" },
  pickGif:          { en: "Pick a GIF", fr: "Choisissez un GIF" },
  searchGif:        { en: "Search reactions…", fr: "Rechercher…" },
  pasteGifUrl:      { en: "…or paste a GIF URL", fr: "…ou collez une URL de GIF" },
  useThis:          { en: "Use this GIF", fr: "Utiliser ce GIF" },
  tapToVote:        { en: "Tap your favourite", fr: "Touchez votre préféré" },
  voted:            { en: "Vote cast! Waiting…", fr: "Vote enregistré ! En attente…" },
  cantVoteOwn:      { en: "That one's yours", fr: "Celui-ci est le vôtre" },
  yours:            { en: "YOURS", fr: "LA VÔTRE" },
  votes:            { en: "{n} votes", fr: "{n} votes" },
  oneVote:          { en: "1 vote", fr: "1 vote" },
  noVotes:          { en: "no votes", fr: "aucun vote" },
  roundWinner:      { en: "{name} takes the round!", fr: "{name} remporte la manche !" },
  nextIn:           { en: "Next round in {n}s", fr: "Manche suivante dans {n} s" },
  nextRound:        { en: "Next round", fr: "Manche suivante" },
  gameOver:         { en: "Game over", fr: "Partie terminée" },
  winner:           { en: "{name} wins!", fr: "{name} gagne !" },
  finalScores:      { en: "Final scores", fr: "Scores finaux" },
  returnLobby:      { en: "Return to lobby", fr: "Retour au salon" },
  leaveGame:        { en: "Leave game", fr: "Quitter la partie" },
  points:           { en: "pts", fr: "pts" },
  youLabel:         { en: "You", fr: "Vous" },
  timesUp:          { en: "Time's up!", fr: "Temps écoulé !" },
  shuffling:        { en: "Shuffling captions…", fr: "Mélange des légendes…" },

  // launch options (lobby)
  optionsTitle:     { en: "HASAMEME setup", fr: "Réglages HASAMEME" },
  hostOnly:         { en: "Only the host changes the setup", fr: "Seul l'hôte modifie les réglages" },
  answerMode:       { en: "Answer mode", fr: "Mode de réponse" },
  modeCaption:      { en: "Caption templates", fr: "Légender des modèles" },
  modeCaptionD:     { en: "Write text onto a meme template.", fr: "Écrivez du texte sur un modèle de mème." },
  modeGif:          { en: "GIF reactions", fr: "Réactions GIF" },
  modeGifD:         { en: "Answer a prompt with the perfect reaction GIF.", fr: "Répondez à une phrase avec le GIF parfait." },
  rounds:           { en: "Rounds", fr: "Manches" },
  captionTime:      { en: "Caption time", fr: "Temps de légende" },
  voteTime:         { en: "Vote time", fr: "Temps de vote" },
  seconds:          { en: "{n}s", fr: "{n} s" },
  templatePacks:    { en: "Template packs", fr: "Packs de modèles" },
  packClassic:      { en: "Classic", fr: "Classiques" },
  packCs2:          { en: "CS2", fr: "CS2" },
  packWholesome:    { en: "Wholesome", fr: "Mignons" },
  packChaos:        { en: "Chaos", fr: "Chaos" },
  packGif:          { en: "Animated GIFs", fr: "GIFs animés" },
  customMemes:      { en: "Custom memes", fr: "Mèmes personnalisés" },
  customHint:       { en: "Paste an image or GIF URL to add your own template", fr: "Collez une URL d'image ou de GIF pour ajouter votre modèle" },
  addMeme:          { en: "Add", fr: "Ajouter" },
  customCount:      { en: "{n} imported", fr: "{n} importés" },
  remove:           { en: "Remove", fr: "Retirer" },
  invalidUrl:       { en: "Needs an http(s) or data image URL", fr: "URL d'image http(s) ou data requise" },

  // event feed
  evSubmitted:      { en: "{name} locked in", fr: "{name} a validé" },
  evVoted:          { en: "{name} voted", fr: "{name} a voté" },
} as const;

// ---------------------------------------------------------------------------
// CODENAMES
// ---------------------------------------------------------------------------
export const CODENAMES = {
  brand:           { en: "CODENAMES", fr: "CODENAMES" },
  red:             { en: "RED", fr: "ROUGE" },
  blue:            { en: "BLUE", fr: "BLEU" },
  redTeam:         { en: "Red team", fr: "Équipe rouge" },
  blueTeam:        { en: "Blue team", fr: "Équipe bleue" },
  spymaster:       { en: "Spymaster", fr: "Maître-espion" },
  operative:       { en: "Operative", fr: "Agent" },
  youLabel:        { en: "You", fr: "Vous" },
  agentsLeft:      { en: "{n} left", fr: "{n} restants" },

  // turn banner
  yourTurnClue:    { en: "Your clue, spymaster", fr: "À vous, maître-espion" },
  yourTurnGuess:   { en: "Your turn — start guessing", fr: "À vous — devinez" },
  waitingClue:     { en: "{team} spymaster is thinking…", fr: "Le maître-espion {team} réfléchit…" },
  waitingGuess:    { en: "{team} is guessing…", fr: "{team} devine…" },
  spectating:      { en: "Watching {team} play", fr: "Vous observez {team}" },
  phaseClue:       { en: "Clue phase", fr: "Phase d'indice" },
  phaseGuess:      { en: "Guess phase", fr: "Phase de devinettes" },

  // clue bar
  cluePlaceholder: { en: "One word…", fr: "Un seul mot…" },
  giveClue:        { en: "Give clue", fr: "Donner l'indice" },
  clueCount:       { en: "Words", fr: "Mots" },
  unlimited:       { en: "∞", fr: "∞" },
  clueRejected:    { en: "That clue can't be a word on the board — one word only.", fr: "L'indice ne peut pas être un mot du plateau — un seul mot." },
  clueIs:          { en: "Clue", fr: "Indice" },
  guessesLeft:     { en: "{n} guesses left", fr: "{n} essais restants" },
  oneGuessLeft:    { en: "1 guess left", fr: "1 essai restant" },
  unlimitedGuesses:{ en: "Unlimited guesses", fr: "Essais illimités" },
  endGuessing:     { en: "Stop guessing", fr: "Arrêter" },
  mustGuessOnce:   { en: "Answer the clue at least once first", fr: "Répondez d'abord à l'indice au moins une fois" },
  spymasterHold:   { en: "You gave the clue — sit tight", fr: "Vous avez donné l'indice — patientez" },
  keyCard:         { en: "You can see the key card", fr: "Vous voyez la grille des agents" },

  // card kinds
  kindRed:         { en: "red agent", fr: "agent rouge" },
  kindBlue:        { en: "blue agent", fr: "agent bleu" },
  kindNeutral:     { en: "bystander", fr: "passant" },
  kindAssassin:    { en: "the assassin", fr: "l'assassin" },
  kindDouble:      { en: "the double agent", fr: "l'agent double" },

  // log lines
  logStart:        { en: "{team} goes first.", fr: "{team} commence." },
  logClue:         { en: "{name}: “{word}” — {count}", fr: "{name} : « {word} » — {count}" },
  logPick:         { en: "{name} picked {word} — {kind}", fr: "{name} a choisi {word} — {kind}" },
  logDouble:       { en: "{name} flipped the double agent!", fr: "{name} retourne l'agent double !" },
  logMiss:         { en: "Wrong card — the turn passes to {team}.", fr: "Mauvaise carte — au tour de {team}." },
  logOutOfGuesses: { en: "Out of guesses — {team} is up.", fr: "Plus d'essais — à {team}." },
  logStopped:      { en: "They stopped there — {team} is up.", fr: "Ils s'arrêtent là — à {team}." },
  logTimeout:      { en: "Time's up — {team} is up.", fr: "Temps écoulé — à {team}." },
  logClueTimeout:  { en: "{team}'s spymaster ran out of time.", fr: "Le maître-espion {team} n'a plus de temps." },
  logNewSpymaster: { en: "{name} takes over as {team} spymaster.", fr: "{name} devient maître-espion {team}." },
  logWin:          { en: "{team} wins!", fr: "{team} gagne !" },

  // end screen
  gameOver:        { en: "Game over", fr: "Partie terminée" },
  winsAgents:      { en: "{team} found every agent!", fr: "{team} a trouvé tous ses agents !" },
  winsAssassin:    { en: "{loser} hit the assassin — {team} wins!", fr: "{loser} a touché l'assassin — {team} gagne !" },
  winsForfeit:     { en: "{team} wins by forfeit", fr: "{team} gagne par forfait" },
  youWon:          { en: "Your team wins! 🎉", fr: "Votre équipe gagne ! 🎉" },
  youLost:         { en: "Your team lost", fr: "Votre équipe a perdu" },
  finalKey:        { en: "The key card", fr: "La grille des agents" },
  returnLobby:     { en: "Return to lobby", fr: "Retour au salon" },
  leaveGame:       { en: "Leave game", fr: "Quitter la partie" },
  clueLog:         { en: "Clues", fr: "Indices" },
  feed:            { en: "Feed", fr: "Journal" },

  // ---- lobby setup ----
  optionsTitle:    { en: "CODENAMES setup", fr: "Réglages CODENAMES" },
  hostOnly:        { en: "Only the host changes the setup", fr: "Seul l'hôte modifie les réglages" },
  teamsTitle:      { en: "Teams", fr: "Équipes" },
  teamsHint:       { en: "Tap a colour to switch sides · 🕵️ makes you spymaster", fr: "Touchez une couleur pour changer de camp · 🕵️ vous nomme maître-espion" },
  shuffleTeams:    { en: "Shuffle teams", fr: "Mélanger les équipes" },
  unassigned:      { en: "Not seated", fr: "Sans équipe" },
  needTwoPerTeam:  { en: "Each colour needs a spymaster and at least one operative", fr: "Chaque couleur a besoin d'un maître-espion et d'au moins un agent" },

  boardSize:       { en: "Board", fr: "Plateau" },
  boardSizeD:      { en: "5×5 is the classic grid; 6×6 is a longer, meaner game.", fr: "5×5 est la grille classique ; 6×6 donne une partie plus longue et plus rude." },
  packs:           { en: "Word packs", fr: "Packs de mots" },
  packClassic:     { en: "Classic", fr: "Classiques" },
  packCs2:         { en: "CS2", fr: "CS2" },
  packGaming:      { en: "Gaming", fr: "Gaming" },
  packParty:       { en: "Party", fr: "Soirée" },
  packsHint:       { en: "Mix as many as you like — words are drawn from all of them.", fr: "Mélangez-en autant que vous voulez — les mots viennent de tous." },
  assassins:       { en: "Assassins", fr: "Assassins" },
  assassinsD:      { en: "Two assassins turns every guess into a gamble.", fr: "Deux assassins transforment chaque essai en pari." },
  firstTeam:       { en: "Starts", fr: "Commence" },
  firstRandom:     { en: "Random", fr: "Aléatoire" },
  clueTimer:       { en: "Spymaster clock", fr: "Chrono maître-espion" },
  turnTimer:       { en: "Guessing clock", fr: "Chrono devinettes" },
  seconds:         { en: "{n}s", fr: "{n} s" },
  noTimer:         { en: "Off", fr: "Sans" },

  ruleBonus:       { en: "Bonus guess", fr: "Essai bonus" },
  ruleBonusD:      { en: "The classic +1: a team may risk one guess beyond the number.", fr: "Le +1 classique : une équipe peut tenter un essai de plus que le nombre." },
  ruleUnlimited:   { en: "Unlimited guesses", fr: "Essais illimités" },
  ruleUnlimitedD:  { en: "Keep guessing until you miss — the number is only a hint.", fr: "Devinez jusqu'à l'erreur — le nombre n'est qu'une indication." },
  ruleZero:        { en: "Allow 0 / ∞", fr: "Autoriser 0 / ∞" },
  ruleZeroD:       { en: "A clue of 0 means \"none of these\" and grants unlimited guesses.", fr: "Un indice à 0 signifie « aucun de ceux-là » et donne des essais illimités." },
  ruleDouble:      { en: "Double agent", fr: "Agent double" },
  ruleDoubleD:     { en: "One card counts for whichever team flips it first.", fr: "Une carte compte pour l'équipe qui la retourne en premier." },
  ruleRevealKey:   { en: "Reveal the key", fr: "Révéler la grille" },
  ruleRevealKeyD:  { en: "Show the whole board once the game is decided.", fr: "Montre tout le plateau une fois la partie jouée." },

  presetsTitle:    { en: "Presets", fr: "Préréglages" },
  presetClassic:   { en: "Classic", fr: "Classique" },
  presetBlitz:     { en: "Blitz", fr: "Blitz" },
  presetDeadly:    { en: "Deadly", fr: "Mortel" },
} as const;

// ---------------------------------------------------------------------------
// PILE OF... (Cards Against–style)
// ---------------------------------------------------------------------------
export const PILEOF = {
  round:          { en: "Round {n}/{m}", fr: "Manche {n}/{m}" },
  phaseSubmit:    { en: "Fill in the blank", fr: "Complétez le vide" },
  phaseJudge:     { en: "The Czar is judging", fr: "Le Tsar délibère" },
  phaseReveal:    { en: "Winner!", fr: "Gagnant !" },
  czar:           { en: "Card Czar", fr: "Tsar des cartes" },
  youAreCzar:     { en: "You're the Card Czar — sit back and judge", fr: "Vous êtes le Tsar — observez et jugez" },
  czarWaiting:    { en: "{name} is the Czar", fr: "{name} est le Tsar" },
  pickText:       { en: "Pick {n}", fr: "Choisissez {n}" },
  submit:         { en: "Submit", fr: "Valider" },
  submittedWait:  { en: "Locked in — waiting for the others…", fr: "Validé — en attente des autres…" },
  waitingCount:   { en: "{n}/{m} submitted", fr: "{n}/{m} validés" },
  writeCustom:    { en: "Write your own", fr: "Écrire la vôtre" },
  customCard:     { en: "Custom card {n}", fr: "Carte perso {n}" },
  submitCustom:   { en: "Submit custom", fr: "Valider perso" },
  cancel:         { en: "Cancel", fr: "Annuler" },
  customHint:     { en: "Spelling & caps are tidied up automatically", fr: "L'orthographe et les majuscules sont corrigées" },
  backToHand:     { en: "Back to hand", fr: "Retour à la main" },
  tapToPick:      { en: "Tap the funniest answer", fr: "Touchez la réponse la plus drôle" },
  czarPicks:      { en: "Only the Czar picks the winner", fr: "Seul le Tsar choisit le gagnant" },
  roundWinner:    { en: "{name} wins the round!", fr: "{name} remporte la manche !" },
  nextIn:         { en: "Next round in {n}s", fr: "Manche suivante dans {n} s" },
  nextRound:      { en: "Next round", fr: "Manche suivante" },
  gameOver:       { en: "Game over", fr: "Partie terminée" },
  winner:         { en: "{name} wins!", fr: "{name} gagne !" },
  finalScores:    { en: "Final scores", fr: "Scores finaux" },
  recap:          { en: "Best of the night", fr: "Le meilleur de la soirée" },
  returnLobby:    { en: "Return to lobby", fr: "Retour au salon" },
  leaveGame:      { en: "Leave game", fr: "Quitter la partie" },
  points:         { en: "pts", fr: "pts" },
  youLabel:       { en: "You", fr: "Vous" },
  blank:          { en: "________", fr: "________" },

  // options
  optionsTitle:   { en: "PILE OF... setup", fr: "Réglages PILE OF..." },
  hostOnly:       { en: "Only the host changes the setup", fr: "Seul l'hôte modifie les réglages" },
  rounds:         { en: "Rounds", fr: "Manches" },
  timer:          { en: "Turn timer", fr: "Chrono par tour" },
  infinite:       { en: "∞", fr: "∞" },
  seconds:        { en: "{n}s", fr: "{n} s" },
  allowCustom:    { en: "Custom cards", fr: "Cartes personnalisées" },
  allowCustomD:   { en: "Let players write their own answer instead of playing a card.", fr: "Les joueurs peuvent écrire leur propre réponse au lieu de jouer une carte." },
} as const;
