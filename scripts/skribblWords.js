// Skribbl word banks. The drawing language follows the lobby's language, so a
// French lobby never gets handed an English word to sketch.

const EN = [
  // everyday
  "cat", "dog", "house", "tree", "sun", "moon", "car", "fish", "bird", "flower",
  "mountain", "river", "bridge", "castle", "robot", "dragon", "pizza", "guitar",
  "rocket", "balloon", "rainbow", "dinosaur", "pirate", "ninja", "zombie",
  "snowman", "volcano", "island", "submarine", "helicopter", "umbrella", "spider",
  "butterfly", "elephant", "penguin", "dolphin", "octopus", "unicorn", "wizard",
  "knight", "crown", "treasure", "anchor", "candle", "compass", "diamond",
  "feather", "globe", "hammer", "ladder", "magnet", "parachute", "telescope",
  "waterfall", "windmill", "skeleton", "ghost", "vampire", "witch", "alien",
  "astronaut", "cowboy", "mermaid", "angel", "devil", "clown", "scarecrow",
  "lighthouse", "campfire", "tornado", "cactus", "igloo", "windsurf", "hedgehog",
  "toaster", "microphone", "sandwich", "pancake", "popcorn", "cupcake", "donut",
  "keyboard", "headphones", "wallet", "suitcase", "envelope", "trophy", "puzzle",
  // CS2-themed
  "awp", "knife", "smoke grenade", "bomb", "chicken", "hostage", "defuse kit",
  "flashbang", "molotov", "sniper", "headshot", "crosshair", "scope", "silencer",
  "eco round", "clutch", "ace", "spray pattern", "bomb site", "rush b",
];

const FR = [
  // quotidien
  "chat", "chien", "maison", "arbre", "soleil", "lune", "voiture", "poisson",
  "oiseau", "fleur", "montagne", "rivière", "pont", "château", "robot", "dragon",
  "pizza", "guitare", "fusée", "ballon", "arc-en-ciel", "dinosaure", "pirate",
  "ninja", "zombie", "bonhomme de neige", "volcan", "île", "sous-marin",
  "hélicoptère", "parapluie", "araignée", "papillon", "éléphant", "manchot",
  "dauphin", "pieuvre", "licorne", "sorcier", "chevalier", "couronne", "trésor",
  "ancre", "bougie", "boussole", "diamant", "plume", "globe", "marteau",
  "échelle", "aimant", "parachute", "télescope", "cascade", "moulin",
  "squelette", "fantôme", "vampire", "sorcière", "extraterrestre", "astronaute",
  "cowboy", "sirène", "ange", "diable", "clown", "épouvantail", "phare",
  "feu de camp", "tornade", "cactus", "igloo", "hérisson", "grille-pain",
  "microphone", "sandwich", "crêpe", "pop-corn", "cupcake", "beignet",
  "clavier", "casque", "portefeuille", "valise", "enveloppe", "trophée",
  "baguette", "croissant", "fromage", "escargot", "tour eiffel", "métro",
  // CS2
  "awp", "couteau", "fumigène", "bombe", "poulet", "otage", "kit de désamorçage",
  "flash", "cocktail molotov", "sniper", "tir à la tête", "viseur", "lunette",
  "silencieux", "manche éco", "clutch", "ace", "site de bombe",
];

/** Strip accents + punctuation so "hérisson" and "herisson" both count. */
function normalize(word) {
  return String(word)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-'\u2019]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsFor(lang) {
  return lang === "fr" ? FR : EN;
}

module.exports = { EN, FR, wordsFor, normalize };
