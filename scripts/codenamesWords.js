// CODENAMES word banks, in English and French, split into packs the host picks
// from in the lobby.
//
// Every word carries a category tag. Tags are what make the bot spymaster
// playable without a semantic model: it looks for the category holding the most
// of its own unrevealed words (and none of the assassin's), then gives that
// category's name as the clue. Bot operatives read the same map back. Tags are
// never shown to human players.

/** Category name as an actual clue word, per language. */
const CATEGORIES = {
  animal:   { en: "CREATURE", fr: "CRÉATURE" },
  nature:   { en: "NATURE",   fr: "NATURE" },
  plant:    { en: "PLANT",    fr: "PLANTE" },
  water:    { en: "WATER",    fr: "EAU" },
  weather:  { en: "WEATHER",  fr: "MÉTÉO" },
  space:    { en: "SPACE",    fr: "ESPACE" },
  food:     { en: "FOOD",     fr: "NOURRITURE" },
  drink:    { en: "DRINK",    fr: "BOISSON" },
  body:     { en: "BODY",     fr: "CORPS" },
  clothes:  { en: "CLOTHING", fr: "VÊTEMENT" },
  building: { en: "BUILDING", fr: "BÂTIMENT" },
  transport:{ en: "VEHICLE",  fr: "VÉHICULE" },
  tool:     { en: "TOOL",     fr: "OUTIL" },
  weapon:   { en: "WEAPON",   fr: "ARME" },
  war:      { en: "BATTLE",   fr: "BATAILLE" },
  music:    { en: "MUSIC",    fr: "MUSIQUE" },
  sport:    { en: "SPORT",    fr: "SPORT" },
  tech:     { en: "TECH",     fr: "TECHNO" },
  money:    { en: "MONEY",    fr: "ARGENT" },
  job:      { en: "JOB",      fr: "MÉTIER" },
  royal:    { en: "ROYALTY",  fr: "ROYAUTÉ" },
  myth:     { en: "LEGEND",   fr: "LÉGENDE" },
  color:    { en: "COLOUR",   fr: "COULEUR" },
  time:     { en: "TIME",     fr: "TEMPS" },
  place:    { en: "PLACE",    fr: "LIEU" },
  school:   { en: "SCHOOL",   fr: "ÉCOLE" },
  emotion:  { en: "FEELING",  fr: "ÉMOTION" },
  game:     { en: "GAMING",   fr: "JEU" },
  map:      { en: "MAP",      fr: "CARTE" },
  gun:      { en: "GUN",      fr: "FLINGUE" },
  tactic:   { en: "TACTIC",   fr: "TACTIQUE" },
  party:    { en: "PARTY",    fr: "FÊTE" },
  garden:   { en: "GARDEN",   fr: "JARDIN" },
};

// Words are [WORD, category]. Keep them single-token and unambiguous — a word
// that is also a category label would let the bot give itself away.
const EN = {
  classic: [
    ["APPLE", "food"], ["BANANA", "food"], ["BREAD", "food"], ["CHEESE", "food"],
    ["HONEY", "food"], ["LEMON", "food"], ["PEPPER", "food"], ["SUGAR", "food"],
    ["CHOCOLATE", "food"], ["NOODLE", "food"],
    ["COFFEE", "drink"], ["WINE", "drink"], ["CIDER", "drink"], ["SODA", "drink"], ["MILK", "drink"],
    ["EAGLE", "animal"], ["TIGER", "animal"], ["WHALE", "animal"], ["SNAKE", "animal"],
    ["RAVEN", "animal"], ["JAGUAR", "animal"], ["LION", "animal"], ["WOLF", "animal"],
    ["VIPER", "animal"], ["FALCON", "animal"], ["SPIDER", "animal"], ["OCTOPUS", "animal"],
    ["BEAR", "animal"], ["MOTH", "animal"],
    ["FOREST", "nature"], ["DESERT", "nature"], ["GLACIER", "nature"], ["VOLCANO", "nature"],
    ["ISLAND", "nature"], ["CANYON", "nature"], ["MEADOW", "nature"], ["CAVE", "nature"],
    ["OAK", "plant"], ["OLIVE", "plant"], ["LOTUS", "plant"], ["CACTUS", "plant"],
    ["IVY", "plant"], ["CLOVER", "plant"], ["ROSE", "plant"], ["FERN", "plant"],
    ["OCEAN", "water"], ["HARBOR", "water"], ["RIVER", "water"], ["WAVE", "water"],
    ["ANCHOR", "water"], ["ISLE", "water"], ["TIDE", "water"], ["REEF", "water"],
    ["STORM", "weather"], ["THUNDER", "weather"], ["FROST", "weather"], ["ICE", "weather"],
    ["FOG", "weather"], ["RAINBOW", "weather"], ["DROUGHT", "weather"],
    ["MOON", "space"], ["ORBIT", "space"], ["ECLIPSE", "space"], ["COMET", "space"],
    ["ROCKET", "space"], ["NEBULA", "space"], ["MARS", "space"], ["SATELLITE", "space"],
    ["HEART", "body"], ["SHOULDER", "body"], ["THUMB", "body"], ["SPINE", "body"],
    ["PULSE", "body"], ["BONE", "body"],
    ["HELMET", "clothes"], ["MASK", "clothes"], ["GLOVE", "clothes"], ["BOOT", "clothes"],
    ["SILK", "clothes"], ["COLLAR", "clothes"],
    ["CASTLE", "building"], ["TOWER", "building"], ["BRIDGE", "building"], ["PALACE", "building"],
    ["BUNKER", "building"], ["CHAPEL", "building"], ["MILL", "building"], ["VAULT", "building"],
    ["TRAIN", "transport"], ["SHIP", "transport"], ["JET", "transport"], ["SLED", "transport"],
    ["ENGINE", "transport"], ["WHEEL", "transport"], ["SUBWAY", "transport"],
    ["HAMMER", "tool"], ["NEEDLE", "tool"], ["LADDER", "tool"], ["WRENCH", "tool"],
    ["COMPASS", "tool"], ["MAGNET", "tool"], ["LEVER", "tool"],
    ["BLADE", "weapon"], ["ARROW", "weapon"], ["SHIELD", "weapon"], ["CANNON", "weapon"],
    ["TORCH", "weapon"], ["TRAP", "weapon"],
    ["PIANO", "music"], ["DRUM", "music"], ["CHORD", "music"], ["OPERA", "music"],
    ["TRUMPET", "music"], ["CHOIR", "music"],
    ["MARATHON", "sport"], ["RACKET", "sport"], ["HURDLE", "sport"], ["PODIUM", "sport"],
    ["REFEREE", "sport"], ["STADIUM", "sport"],
    ["ROBOT", "tech"], ["LASER", "tech"], ["CIRCUIT", "tech"], ["SIGNAL", "tech"],
    ["ANTENNA", "tech"], ["BATTERY", "tech"], ["PIXEL", "tech"],
    ["BANK", "money"], ["DIAMOND", "money"], ["COPPER", "money"], ["MARKET", "money"],
    ["TREASURE", "money"], ["INVOICE", "money"],
    ["PILOT", "job"], ["SURGEON", "job"], ["BAKER", "job"], ["JUDGE", "job"],
    ["MINER", "job"], ["SAILOR", "job"], ["TAILOR", "job"],
    ["QUEEN", "royal"], ["KNIGHT", "royal"], ["CROWN", "royal"], ["THRONE", "royal"],
    ["JEWEL", "royal"], ["DUKE", "royal"],
    ["DRAGON", "myth"], ["GHOST", "myth"], ["PHOENIX", "myth"], ["WIZARD", "myth"],
    ["ANGEL", "myth"], ["ORACLE", "myth"], ["GIANT", "myth"], ["CURSE", "myth"],
    ["IVORY", "color"], ["AMBER", "color"], ["SCARLET", "color"], ["INDIGO", "color"],
    ["SHADOW", "color"], ["CRYSTAL", "color"],
    ["CENTURY", "time"], ["DAWN", "time"], ["MIDNIGHT", "time"], ["SEASON", "time"],
    ["CLOCK", "time"], ["DECADE", "time"],
    ["MARKETPLACE", "place"], ["EMBASSY", "place"], ["HARVEST", "place"], ["BORDER", "place"],
    ["CAPITAL", "place"], ["ALLEY", "place"],
    ["PENCIL", "school"], ["LECTURE", "school"], ["RULER", "school"], ["DIPLOMA", "school"],
    ["LIBRARY", "school"], ["ESSAY", "school"],
    ["PANIC", "emotion"], ["PRIDE", "emotion"], ["GRUDGE", "emotion"], ["MERCY", "emotion"],
    ["DOUBT", "emotion"], ["THRILL", "emotion"],
  ],
  cs2: [
    ["DUST", "map"], ["MIRAGE", "map"], ["NUKE", "map"], ["INFERNO", "map"],
    ["OVERPASS", "map"], ["ANUBIS", "map"], ["VERTIGO", "map"], ["ANCIENT", "map"],
    ["CACHE", "map"], ["COBBLE", "map"], ["TUSCAN", "map"], ["OFFICE", "map"],
    ["AWP", "gun"], ["DEAGLE", "gun"], ["GALIL", "gun"], ["FAMAS", "gun"],
    ["SCOUT", "gun"], ["NEGEV", "gun"], ["TASER", "gun"], ["USP", "gun"],
    ["SMOKE", "tactic"], ["FLASH", "tactic"], ["MOLOTOV", "tactic"], ["DECOY", "tactic"],
    ["DEFUSE", "tactic"], ["RETAKE", "tactic"], ["ECO", "tactic"], ["FORCE", "tactic"],
    ["RUSH", "tactic"], ["ROTATE", "tactic"], ["STACK", "tactic"], ["FLANK", "tactic"],
    ["BOOST", "tactic"], ["SPRAY", "tactic"], ["BURST", "tactic"], ["PEEK", "tactic"],
    ["CLUTCH", "war"], ["ACE", "war"], ["ENTRY", "war"], ["LURKER", "war"],
    ["TRADE", "war"], ["HEADSHOT", "war"], ["WHIFF", "war"], ["FRAG", "war"],
    ["ARMORY", "place"], ["BANANA", "place"], ["CATWALK", "place"], ["MIDDLE", "place"],
    ["CONNECTOR", "place"], ["APARTMENTS", "place"], ["PALACE", "place"], ["RAMP", "place"],
    ["SKIN", "money"], ["CASE", "money"], ["STICKER", "money"], ["KNIFE", "money"],
    ["FLOAT", "money"], ["DROP", "money"],
    ["RANK", "game"], ["PREMIER", "game"], ["QUEUE", "game"], ["DEMO", "game"],
    ["PING", "tech"], ["TICKRATE", "tech"], ["CROSSHAIR", "tech"], ["MACRO", "tech"],
  ],
  gaming: [
    ["RESPAWN", "game"], ["CHECKPOINT", "game"], ["LOOT", "game"], ["QUEST", "game"],
    ["BOSS", "game"], ["COMBO", "game"], ["SPEEDRUN", "game"], ["GLITCH", "game"],
    ["LOBBY", "game"], ["SEASON", "game"], ["PATCH", "game"], ["NERF", "game"],
    ["META", "game"], ["GRIND", "game"], ["EMOTE", "game"], ["SKILL", "game"],
    ["MANA", "myth"], ["POTION", "myth"], ["DUNGEON", "myth"], ["GOBLIN", "myth"],
    ["PALADIN", "myth"], ["SUMMON", "myth"], ["RUNE", "myth"], ["PORTAL", "myth"],
    ["JOYSTICK", "tech"], ["CONSOLE", "tech"], ["SERVER", "tech"], ["MODDING", "tech"],
    ["AVATAR", "tech"], ["STREAM", "tech"], ["LATENCY", "tech"], ["RENDER", "tech"],
    ["TOURNAMENT", "sport"], ["BRACKET", "sport"], ["SCRIM", "sport"], ["ROSTER", "sport"],
    ["CHAMPION", "sport"], ["TROPHY", "sport"], ["DRAFT", "sport"], ["OVERTIME", "sport"],
    ["ARCADE", "place"], ["BASEMENT", "place"], ["COUCH", "place"], ["CAFE", "place"],
    ["PIZZA", "food"], ["ENERGY", "drink"], ["SNACK", "food"], ["CEREAL", "food"],
    ["INSOMNIA", "time"], ["ALLNIGHTER", "time"],
  ],
  party: [
    ["KARAOKE", "party"], ["CONFETTI", "party"], ["PIÑATA", "party"], ["BALLOON", "party"],
    ["DANCEFLOOR", "party"], ["PLAYLIST", "party"], ["TOAST", "party"], ["COSTUME", "party"],
    ["HANGOVER", "party"], ["SHOTS", "party"], ["DARE", "party"], ["GOSSIP", "party"],
    ["SELFIE", "party"], ["ROAST", "party"], ["PRANK", "party"], ["DRAMA", "party"],
    ["CRUSH", "emotion"], ["AWKWARD", "emotion"], ["CRINGE", "emotion"], ["CHAOS", "emotion"],
    ["MEME", "tech"], ["VIRAL", "tech"], ["FILTER", "tech"], ["NOTIFICATION", "tech"],
    ["SPROUT", "garden"], ["COMPOST", "garden"], ["GREENHOUSE", "garden"], ["HEDGE", "garden"],
    ["PETAL", "garden"], ["THORN", "garden"], ["SEEDLING", "garden"], ["TRELLIS", "garden"],
    ["BONFIRE", "party"], ["FIREWORK", "party"], ["PICNIC", "party"], ["BARBECUE", "party"],
    ["ROADTRIP", "transport"], ["SLEEPOVER", "time"], ["BRUNCH", "food"], ["SUNRISE", "time"],
  ],
};

const FR = {
  classic: [
    ["POMME", "food"], ["BANANE", "food"], ["PAIN", "food"], ["FROMAGE", "food"],
    ["MIEL", "food"], ["CITRON", "food"], ["POIVRE", "food"], ["SUCRE", "food"],
    ["CHOCOLAT", "food"], ["NOUILLE", "food"],
    ["CAFÉ", "drink"], ["VIN", "drink"], ["CIDRE", "drink"], ["SODA", "drink"], ["LAIT", "drink"],
    ["AIGLE", "animal"], ["TIGRE", "animal"], ["BALEINE", "animal"], ["SERPENT", "animal"],
    ["CORBEAU", "animal"], ["JAGUAR", "animal"], ["LION", "animal"], ["LOUP", "animal"],
    ["VIPÈRE", "animal"], ["FAUCON", "animal"], ["ARAIGNÉE", "animal"], ["PIEUVRE", "animal"],
    ["OURS", "animal"], ["PAPILLON", "animal"],
    ["FORÊT", "nature"], ["DÉSERT", "nature"], ["GLACIER", "nature"], ["VOLCAN", "nature"],
    ["ÎLE", "nature"], ["CANYON", "nature"], ["PRAIRIE", "nature"], ["GROTTE", "nature"],
    ["CHÊNE", "plant"], ["OLIVE", "plant"], ["LOTUS", "plant"], ["CACTUS", "plant"],
    ["LIERRE", "plant"], ["TRÈFLE", "plant"], ["ROSE", "plant"], ["FOUGÈRE", "plant"],
    ["OCÉAN", "water"], ["PORT", "water"], ["RIVIÈRE", "water"], ["VAGUE", "water"],
    ["ANCRE", "water"], ["LAGON", "water"], ["MARÉE", "water"], ["RÉCIF", "water"],
    ["TEMPÊTE", "weather"], ["TONNERRE", "weather"], ["GIVRE", "weather"], ["GLACE", "weather"],
    ["BROUILLARD", "weather"], ["ARC-EN-CIEL", "weather"], ["SÉCHERESSE", "weather"],
    ["LUNE", "space"], ["ORBITE", "space"], ["ÉCLIPSE", "space"], ["COMÈTE", "space"],
    ["FUSÉE", "space"], ["NÉBULEUSE", "space"], ["MARS", "space"], ["SATELLITE", "space"],
    ["CŒUR", "body"], ["ÉPAULE", "body"], ["POUCE", "body"], ["COLONNE", "body"],
    ["POULS", "body"], ["OS", "body"],
    ["CASQUE", "clothes"], ["MASQUE", "clothes"], ["GANT", "clothes"], ["BOTTE", "clothes"],
    ["SOIE", "clothes"], ["COL", "clothes"],
    ["CHÂTEAU", "building"], ["TOUR", "building"], ["PONT", "building"], ["PALAIS", "building"],
    ["BUNKER", "building"], ["CHAPELLE", "building"], ["MOULIN", "building"], ["COFFRE", "building"],
    ["TRAIN", "transport"], ["NAVIRE", "transport"], ["JET", "transport"], ["LUGE", "transport"],
    ["MOTEUR", "transport"], ["ROUE", "transport"], ["MÉTRO", "transport"],
    ["MARTEAU", "tool"], ["AIGUILLE", "tool"], ["ÉCHELLE", "tool"], ["CLÉ", "tool"],
    ["BOUSSOLE", "tool"], ["AIMANT", "tool"], ["LEVIER", "tool"],
    ["LAME", "weapon"], ["FLÈCHE", "weapon"], ["BOUCLIER", "weapon"], ["CANON", "weapon"],
    ["TORCHE", "weapon"], ["PIÈGE", "weapon"],
    ["PIANO", "music"], ["TAMBOUR", "music"], ["ACCORD", "music"], ["OPÉRA", "music"],
    ["TROMPETTE", "music"], ["CHORALE", "music"],
    ["MARATHON", "sport"], ["RAQUETTE", "sport"], ["HAIE", "sport"], ["PODIUM", "sport"],
    ["ARBITRE", "sport"], ["STADE", "sport"],
    ["ROBOT", "tech"], ["LASER", "tech"], ["CIRCUIT", "tech"], ["SIGNAL", "tech"],
    ["ANTENNE", "tech"], ["BATTERIE", "tech"], ["PIXEL", "tech"],
    ["BANQUE", "money"], ["DIAMANT", "money"], ["CUIVRE", "money"], ["MARCHÉ", "money"],
    ["TRÉSOR", "money"], ["FACTURE", "money"],
    ["PILOTE", "job"], ["CHIRURGIEN", "job"], ["BOULANGER", "job"], ["JUGE", "job"],
    ["MINEUR", "job"], ["MARIN", "job"], ["TAILLEUR", "job"],
    ["REINE", "royal"], ["CHEVALIER", "royal"], ["COURONNE", "royal"], ["TRÔNE", "royal"],
    ["JOYAU", "royal"], ["DUC", "royal"],
    ["DRAGON", "myth"], ["FANTÔME", "myth"], ["PHÉNIX", "myth"], ["SORCIER", "myth"],
    ["ANGE", "myth"], ["ORACLE", "myth"], ["GÉANT", "myth"], ["MALÉDICTION", "myth"],
    ["IVOIRE", "color"], ["AMBRE", "color"], ["ÉCARLATE", "color"], ["INDIGO", "color"],
    ["OMBRE", "color"], ["CRISTAL", "color"],
    ["SIÈCLE", "time"], ["AUBE", "time"], ["MINUIT", "time"], ["SAISON", "time"],
    ["HORLOGE", "time"], ["DÉCENNIE", "time"],
    ["HALLE", "place"], ["AMBASSADE", "place"], ["MOISSON", "place"], ["FRONTIÈRE", "place"],
    ["CAPITALE", "place"], ["RUELLE", "place"],
    ["CRAYON", "school"], ["COURS", "school"], ["RÈGLE", "school"], ["DIPLÔME", "school"],
    ["BIBLIOTHÈQUE", "school"], ["DISSERTATION", "school"],
    ["PANIQUE", "emotion"], ["FIERTÉ", "emotion"], ["RANCUNE", "emotion"], ["PITIÉ", "emotion"],
    ["DOUTE", "emotion"], ["FRISSON", "emotion"],
  ],
  cs2: [
    ["DUST", "map"], ["MIRAGE", "map"], ["NUKE", "map"], ["INFERNO", "map"],
    ["OVERPASS", "map"], ["ANUBIS", "map"], ["VERTIGO", "map"], ["ANCIENT", "map"],
    ["CACHE", "map"], ["COBBLE", "map"], ["TUSCAN", "map"], ["OFFICE", "map"],
    ["AWP", "gun"], ["DEAGLE", "gun"], ["GALIL", "gun"], ["FAMAS", "gun"],
    ["SCOUT", "gun"], ["NEGEV", "gun"], ["TASER", "gun"], ["USP", "gun"],
    ["FUMIGÈNE", "tactic"], ["FLASH", "tactic"], ["MOLOTOV", "tactic"], ["LEURRE", "tactic"],
    ["DÉSAMORÇAGE", "tactic"], ["RETAKE", "tactic"], ["ECO", "tactic"], ["FORCE", "tactic"],
    ["RUSH", "tactic"], ["ROTATION", "tactic"], ["STACK", "tactic"], ["FLANC", "tactic"],
    ["BOOST", "tactic"], ["SPRAY", "tactic"], ["RAFALE", "tactic"], ["PEEK", "tactic"],
    ["CLUTCH", "war"], ["ACE", "war"], ["ENTRÉE", "war"], ["LURK", "war"],
    ["ÉCHANGE", "war"], ["HEADSHOT", "war"], ["RATÉ", "war"], ["FRAG", "war"],
    ["ARMURERIE", "place"], ["BANANE", "place"], ["PASSERELLE", "place"], ["MILIEU", "place"],
    ["CONNECTEUR", "place"], ["APPARTEMENTS", "place"], ["PALAIS", "place"], ["RAMPE", "place"],
    ["SKIN", "money"], ["CAISSE", "money"], ["AUTOCOLLANT", "money"], ["COUTEAU", "money"],
    ["USURE", "money"], ["DROP", "money"],
    ["RANG", "game"], ["PREMIER", "game"], ["FILE", "game"], ["DÉMO", "game"],
    ["PING", "tech"], ["TICKRATE", "tech"], ["VISEUR", "tech"], ["MACRO", "tech"],
  ],
  gaming: [
    ["RÉAPPARITION", "game"], ["POINT", "game"], ["BUTIN", "game"], ["QUÊTE", "game"],
    ["BOSS", "game"], ["COMBO", "game"], ["SPEEDRUN", "game"], ["BUG", "game"],
    ["SALON", "game"], ["SAISON", "game"], ["PATCH", "game"], ["NERF", "game"],
    ["META", "game"], ["FARM", "game"], ["EMOTE", "game"], ["TALENT", "game"],
    ["MANA", "myth"], ["POTION", "myth"], ["DONJON", "myth"], ["GOBELIN", "myth"],
    ["PALADIN", "myth"], ["INVOCATION", "myth"], ["RUNE", "myth"], ["PORTAIL", "myth"],
    ["MANETTE", "tech"], ["CONSOLE", "tech"], ["SERVEUR", "tech"], ["MOD", "tech"],
    ["AVATAR", "tech"], ["STREAM", "tech"], ["LATENCE", "tech"], ["RENDU", "tech"],
    ["TOURNOI", "sport"], ["TABLEAU", "sport"], ["SCRIM", "sport"], ["EFFECTIF", "sport"],
    ["CHAMPION", "sport"], ["TROPHÉE", "sport"], ["DRAFT", "sport"], ["PROLONGATION", "sport"],
    ["ARCADE", "place"], ["SOUS-SOL", "place"], ["CANAPÉ", "place"], ["CYBERCAFÉ", "place"],
    ["PIZZA", "food"], ["ÉNERGISANT", "drink"], ["GOÛTER", "food"], ["CÉRÉALE", "food"],
    ["INSOMNIE", "time"], ["NUIT-BLANCHE", "time"],
  ],
  party: [
    ["KARAOKÉ", "party"], ["CONFETTIS", "party"], ["PIÑATA", "party"], ["BALLON", "party"],
    ["PISTE", "party"], ["PLAYLIST", "party"], ["TOAST", "party"], ["DÉGUISEMENT", "party"],
    ["GUEULE-DE-BOIS", "party"], ["SHOTS", "party"], ["DÉFI", "party"], ["RAGOT", "party"],
    ["SELFIE", "party"], ["VANNE", "party"], ["BLAGUE", "party"], ["DRAME", "party"],
    ["BÉGUIN", "emotion"], ["MALAISE", "emotion"], ["HONTE", "emotion"], ["CHAOS", "emotion"],
    ["MÈME", "tech"], ["VIRAL", "tech"], ["FILTRE", "tech"], ["NOTIFICATION", "tech"],
    ["POUSSE", "garden"], ["COMPOST", "garden"], ["SERRE", "garden"], ["HAIE", "garden"],
    ["PÉTALE", "garden"], ["ÉPINE", "garden"], ["SEMIS", "garden"], ["TREILLIS", "garden"],
    ["FEU-DE-CAMP", "party"], ["FEU-ARTIFICE", "party"], ["PIQUE-NIQUE", "party"], ["BARBECUE", "party"],
    ["ROADTRIP", "transport"], ["PYJAMA", "time"], ["BRUNCH", "food"], ["AURORE", "time"],
  ],
};

const BANKS = { en: EN, fr: FR };
const PACK_IDS = ["classic", "cs2", "gaming", "party"];

/**
 * Flatten the chosen packs into `{ word, cat }` entries, de-duplicated (a few
 * words appear in more than one pack).
 */
function buildPool(lang, packs) {
  const bank = BANKS[lang] || BANKS.en;
  const enabled = PACK_IDS.filter((id) => packs && packs[id]);
  const use = enabled.length ? enabled : ["classic"];

  const seen = new Set();
  const pool = [];
  for (const id of use) {
    for (const [word, cat] of bank[id] || []) {
      if (seen.has(word)) continue;
      seen.add(word);
      pool.push({ word, cat });
    }
  }
  return pool;
}

/** The clue a bot spymaster would say for a category, in the table's language. */
function categoryLabel(cat, lang) {
  const entry = CATEGORIES[cat];
  if (!entry) return cat.toUpperCase();
  return entry[lang === "fr" ? "fr" : "en"];
}

module.exports = { BANKS, PACK_IDS, CATEGORIES, buildPool, categoryLabel };
