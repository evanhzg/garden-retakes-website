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
          {l === "en" ? "🇬🇧 EN" : "🇫🇷 FR"}
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
