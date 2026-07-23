// All localized Monopoly text lives here. The server is language-agnostic and
// only sends stable ids (board space id, card id, log key + params); this module
// turns those into EN / authentic-French-edition strings.

export type Lang = "en" | "fr";

// ---------------------------------------------------------------------------
// Currency — English uses "$400", the French edition uses "400 €".
// ---------------------------------------------------------------------------
export function money(amount: number, lang: Lang): string {
  const n = Math.round(amount);
  return lang === "fr" ? `${n.toLocaleString("fr-FR")} €` : `$${n.toLocaleString("en-US")}`;
}

// A board may declare its own currency (data-driven boards). When one is given
// we honour it; otherwise fall back to the localized classic $/€ formatting.
export type Currency = { symbol: string; position: "prefix" | "suffix" };
export function fmtMoney(amount: number, lang: Lang, currency?: Currency | null): string {
  if (!currency) return money(amount, lang);
  const n = Math.round(amount).toLocaleString(lang === "fr" ? "fr-FR" : "en-US");
  return currency.position === "suffix" ? `${n} ${currency.symbol}` : `${currency.symbol}${n}`;
}

// ---------------------------------------------------------------------------
// Board — full + short names per space id. The French column is the authentic
// Paris edition board.
// ---------------------------------------------------------------------------
type SpaceName = { en: string; fr: string; shortEn?: string; shortFr?: string };

export const BOARD_NAMES: Record<number, SpaceName> = {
  0:  { en: "GO", fr: "Départ" },
  1:  { en: "Mediterranean Avenue", fr: "Boulevard de Belleville", shortEn: "Mediterranean", shortFr: "Belleville" },
  2:  { en: "Community Chest", fr: "Caisse de Communauté", shortEn: "Community Chest", shortFr: "Caisse" },
  3:  { en: "Baltic Avenue", fr: "Rue Lecourbe", shortEn: "Baltic Ave", shortFr: "Lecourbe" },
  4:  { en: "Income Tax", fr: "Impôt sur le Revenu", shortEn: "Income Tax", shortFr: "Impôts" },
  5:  { en: "Reading Railroad", fr: "Gare Montparnasse", shortEn: "Reading RR", shortFr: "Montparnasse" },
  6:  { en: "Oriental Avenue", fr: "Rue de Vaugirard", shortEn: "Oriental Ave", shortFr: "Vaugirard" },
  7:  { en: "Chance", fr: "Chance" },
  8:  { en: "Vermont Avenue", fr: "Rue de Courcelles", shortEn: "Vermont Ave", shortFr: "Courcelles" },
  9:  { en: "Connecticut Avenue", fr: "Avenue de la République", shortEn: "Connecticut", shortFr: "République" },
  10: { en: "Jail", fr: "Prison" },
  11: { en: "St. Charles Place", fr: "Boulevard de la Villette", shortEn: "St. Charles", shortFr: "La Villette" },
  12: { en: "Electric Company", fr: "Compagnie d'Électricité", shortEn: "Electric Co.", shortFr: "Électricité" },
  13: { en: "States Avenue", fr: "Avenue de Neuilly", shortEn: "States Ave", shortFr: "Neuilly" },
  14: { en: "Virginia Avenue", fr: "Rue de Paradis", shortEn: "Virginia Ave", shortFr: "Paradis" },
  15: { en: "Pennsylvania Railroad", fr: "Gare de Lyon", shortEn: "Penn. RR", shortFr: "Gare de Lyon" },
  16: { en: "St. James Place", fr: "Avenue Mozart", shortEn: "St. James", shortFr: "Mozart" },
  17: { en: "Community Chest", fr: "Caisse de Communauté", shortEn: "Community Chest", shortFr: "Caisse" },
  18: { en: "Tennessee Avenue", fr: "Boulevard Saint-Michel", shortEn: "Tennessee", shortFr: "St-Michel" },
  19: { en: "New York Avenue", fr: "Place Pigalle", shortEn: "New York Ave", shortFr: "Pigalle" },
  20: { en: "Free Parking", fr: "Parc Gratuit", shortEn: "Free Parking", shortFr: "Parc Gratuit" },
  21: { en: "Kentucky Avenue", fr: "Avenue Matignon", shortEn: "Kentucky", shortFr: "Matignon" },
  22: { en: "Chance", fr: "Chance" },
  23: { en: "Indiana Avenue", fr: "Boulevard Malesherbes", shortEn: "Indiana Ave", shortFr: "Malesherbes" },
  24: { en: "Illinois Avenue", fr: "Avenue Henri-Martin", shortEn: "Illinois Ave", shortFr: "Henri-Martin" },
  25: { en: "B. & O. Railroad", fr: "Gare du Nord", shortEn: "B. & O. RR", shortFr: "Gare du Nord" },
  26: { en: "Atlantic Avenue", fr: "Faubourg Saint-Honoré", shortEn: "Atlantic Ave", shortFr: "St-Honoré" },
  27: { en: "Ventnor Avenue", fr: "Place de la Bourse", shortEn: "Ventnor Ave", shortFr: "La Bourse" },
  28: { en: "Water Works", fr: "Compagnie des Eaux", shortEn: "Water Works", shortFr: "Cie des Eaux" },
  29: { en: "Marvin Gardens", fr: "Rue La Fayette", shortEn: "Marvin Gardens", shortFr: "La Fayette" },
  30: { en: "Go To Jail", fr: "Allez en Prison", shortEn: "Go To Jail", shortFr: "En Prison" },
  31: { en: "Pacific Avenue", fr: "Avenue de Breteuil", shortEn: "Pacific Ave", shortFr: "Breteuil" },
  32: { en: "North Carolina Avenue", fr: "Avenue Foch", shortEn: "N. Carolina", shortFr: "Foch" },
  33: { en: "Community Chest", fr: "Caisse de Communauté", shortEn: "Community Chest", shortFr: "Caisse" },
  34: { en: "Pennsylvania Avenue", fr: "Boulevard des Capucines", shortEn: "Pennsylvania", shortFr: "Capucines" },
  35: { en: "Short Line Railroad", fr: "Gare Saint-Lazare", shortEn: "Short Line", shortFr: "St-Lazare" },
  36: { en: "Chance", fr: "Chance" },
  37: { en: "Park Place", fr: "Avenue des Champs-Élysées", shortEn: "Park Place", shortFr: "Champs-Élysées" },
  38: { en: "Luxury Tax", fr: "Taxe de Luxe", shortEn: "Luxury Tax", shortFr: "Taxe de Luxe" },
  39: { en: "Boardwalk", fr: "Rue de la Paix", shortEn: "Boardwalk", shortFr: "Rue de la Paix" },
};

export function spaceName(id: number, lang: Lang): string {
  const n = BOARD_NAMES[id];
  return n ? n[lang] : `#${id}`;
}
export function spaceShort(id: number, lang: Lang): string {
  const n = BOARD_NAMES[id];
  if (!n) return `#${id}`;
  return (lang === "fr" ? n.shortFr : n.shortEn) ?? n[lang];
}

// The classic board uses the localized name tables (keyed by tile id); themed /
// custom boards carry their own single-language names on each tile.
export function tileFullName(space: any, boardId: string, lang: Lang): string {
  return boardId === "classic" ? spaceName(space.id, lang) : (space.name || `#${space.id}`);
}
export function tileShortName(space: any, boardId: string, lang: Lang): string {
  return boardId === "classic" ? spaceShort(space.id, lang) : (space.name || `#${space.id}`);
}
export function groupLabelOf(space: any, boardId: string, lang: Lang): string {
  const key = space.group || space.type;
  if (boardId === "classic") return GROUP_LABEL[space.group]?.[lang] || GROUP_LABEL[space.type]?.[lang] || "";
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "";
}

// Colour-group display labels (for the property card header).
export const GROUP_LABEL: Record<string, { en: string; fr: string }> = {
  brown:     { en: "Brown", fr: "Marron" },
  lightblue: { en: "Light Blue", fr: "Bleu ciel" },
  pink:      { en: "Pink", fr: "Rose" },
  orange:    { en: "Orange", fr: "Orange" },
  red:       { en: "Red", fr: "Rouge" },
  yellow:    { en: "Yellow", fr: "Jaune" },
  green:     { en: "Green", fr: "Vert" },
  blue:      { en: "Dark Blue", fr: "Bleu foncé" },
  rail:      { en: "Railroad", fr: "Gare" },
  util:      { en: "Utility", fr: "Service public" },
};

// ---------------------------------------------------------------------------
// Card decks — text keyed by card id (matches ids in scripts/monopolyLogic.js).
// ---------------------------------------------------------------------------
type CardText = { title: { en: string; fr: string }; body: { en: string; fr: string } };

export const CARDS: Record<string, CardText> = {
  // --- Chance ---
  ch_go:        { title: { en: "Advance to GO", fr: "Case Départ" }, body: { en: "Advance to GO. Collect $200.", fr: "Avancez jusqu'à la case Départ. Recevez 200 €." } },
  ch_illinois:  { title: { en: "Illinois Avenue", fr: "Avenue Henri-Martin" }, body: { en: "Advance to Illinois Avenue. If you pass GO, collect $200.", fr: "Rendez-vous Avenue Henri-Martin. Si vous passez par le Départ, recevez 200 €." } },
  ch_charles:   { title: { en: "St. Charles Place", fr: "Bd de la Villette" }, body: { en: "Advance to St. Charles Place. If you pass GO, collect $200.", fr: "Rendez-vous Boulevard de la Villette. Si vous passez par le Départ, recevez 200 €." } },
  ch_util:      { title: { en: "Nearest Utility", fr: "Service public" }, body: { en: "Advance to the nearest Utility. If owned, pay ten times your dice roll.", fr: "Avancez jusqu'au service public le plus proche. S'il a un propriétaire, payez dix fois la valeur des dés." } },
  ch_rail:      { title: { en: "Nearest Railroad", fr: "Gare la plus proche" }, body: { en: "Advance to the nearest Railroad and pay the owner twice the rental.", fr: "Avancez jusqu'à la gare la plus proche et payez au propriétaire le double du loyer." } },
  ch_dividend:  { title: { en: "Bank Dividend", fr: "Dividende" }, body: { en: "The bank pays you a dividend of $50.", fr: "La banque vous verse un dividende de 50 €." } },
  ch_gojf:      { title: { en: "Get Out of Jail Free", fr: "Libéré de prison" }, body: { en: "Get Out of Jail Free. Keep this card until needed.", fr: "Vous êtes libéré de prison. Conservez cette carte." } },
  ch_back3:     { title: { en: "Go Back 3 Spaces", fr: "Reculez de 3 cases" }, body: { en: "Go back three spaces.", fr: "Reculez de trois cases." } },
  ch_jail:      { title: { en: "Go To Jail", fr: "Allez en prison" }, body: { en: "Go directly to Jail. Do not pass GO, do not collect $200.", fr: "Allez directement en prison. Ne passez pas par le Départ, ne recevez pas 200 €." } },
  ch_repairs:   { title: { en: "General Repairs", fr: "Réparations" }, body: { en: "Make general repairs on your property: $25 per house, $100 per hotel.", fr: "Faites des réparations : payez 25 € par maison et 100 € par hôtel." } },
  ch_speeding:  { title: { en: "Speeding Fine", fr: "Excès de vitesse" }, body: { en: "Pay a speeding fine of $15.", fr: "Amende pour excès de vitesse : payez 15 €." } },
  ch_reading:   { title: { en: "Reading Railroad", fr: "Gare Montparnasse" }, body: { en: "Take a trip to Reading Railroad. If you pass GO, collect $200.", fr: "Rendez-vous à la Gare Montparnasse. Si vous passez par le Départ, recevez 200 €." } },
  ch_boardwalk: { title: { en: "Boardwalk", fr: "Rue de la Paix" }, body: { en: "Advance to Boardwalk.", fr: "Rendez-vous Rue de la Paix." } },
  ch_chairman:  { title: { en: "Elected Chairman", fr: "Élu président" }, body: { en: "You are elected Chairman of the Board. Pay each player $50.", fr: "Vous êtes élu président du conseil. Payez 50 € à chaque joueur." } },
  ch_loan:      { title: { en: "Building Loan", fr: "Emprunt" }, body: { en: "Your building loan matures. Collect $150.", fr: "Votre emprunt de construction vous rapporte. Recevez 150 €." } },
  ch_crossword: { title: { en: "Crossword Prize", fr: "Mots croisés" }, body: { en: "You won a crossword competition. Collect $100.", fr: "Vous gagnez un concours de mots croisés. Recevez 100 €." } },

  // --- Community Chest ---
  cc_go:        { title: { en: "Advance to GO", fr: "Case Départ" }, body: { en: "Advance to GO. Collect $200.", fr: "Avancez jusqu'à la case Départ. Recevez 200 €." } },
  cc_bankerror: { title: { en: "Bank Error", fr: "Erreur de la banque" }, body: { en: "Bank error in your favour. Collect $200.", fr: "Erreur de la banque en votre faveur. Recevez 200 €." } },
  cc_doctor:    { title: { en: "Doctor's Fee", fr: "Note du médecin" }, body: { en: "Doctor's fee. Pay $50.", fr: "Payez la note du médecin : 50 €." } },
  cc_stock:     { title: { en: "Stock Sale", fr: "Vente d'actions" }, body: { en: "From the sale of stock you get $50.", fr: "La vente de vos actions vous rapporte 50 €." } },
  cc_gojf:      { title: { en: "Get Out of Jail Free", fr: "Libéré de prison" }, body: { en: "Get Out of Jail Free. Keep this card until needed.", fr: "Vous êtes libéré de prison. Conservez cette carte." } },
  cc_jail:      { title: { en: "Go To Jail", fr: "Allez en prison" }, body: { en: "Go directly to Jail. Do not pass GO, do not collect $200.", fr: "Allez directement en prison. Ne passez pas par le Départ, ne recevez pas 200 €." } },
  cc_holiday:   { title: { en: "Holiday Fund", fr: "Caisse de vacances" }, body: { en: "Holiday fund matures. Collect $100.", fr: "Votre caisse de vacances vous rapporte. Recevez 100 €." } },
  cc_taxrefund: { title: { en: "Tax Refund", fr: "Remboursement" }, body: { en: "Income tax refund. Collect $20.", fr: "Remboursement d'impôts. Recevez 20 €." } },
  cc_birthday:  { title: { en: "Your Birthday", fr: "Anniversaire" }, body: { en: "It's your birthday. Collect $10 from every player.", fr: "C'est votre anniversaire. Recevez 10 € de chaque joueur." } },
  cc_lifeins:   { title: { en: "Life Insurance", fr: "Assurance-vie" }, body: { en: "Life insurance matures. Collect $100.", fr: "Votre assurance-vie arrive à échéance. Recevez 100 €." } },
  cc_hospital:  { title: { en: "Hospital Fees", fr: "Frais d'hôpital" }, body: { en: "Hospital fees. Pay $50.", fr: "Frais d'hôpital : payez 50 €." } },
  cc_school:    { title: { en: "School Fees", fr: "Frais de scolarité" }, body: { en: "School fees. Pay $50.", fr: "Frais de scolarité : payez 50 €." } },
  cc_consult:   { title: { en: "Consultancy Fee", fr: "Honoraires" }, body: { en: "Receive $25 consultancy fee.", fr: "Recevez 25 € d'honoraires de conseil." } },
  cc_streets:   { title: { en: "Street Repairs", fr: "Travaux de voirie" }, body: { en: "You are assessed for street repairs: $40 per house, $115 per hotel.", fr: "Travaux de voirie : payez 40 € par maison et 115 € par hôtel." } },
  cc_beauty:    { title: { en: "Beauty Contest", fr: "Concours de beauté" }, body: { en: "You win second prize in a beauty contest. Collect $10.", fr: "Vous gagnez le 2e prix de beauté. Recevez 10 €." } },
  cc_inherit:   { title: { en: "Inheritance", fr: "Héritage" }, body: { en: "You inherit $100.", fr: "Vous héritez de 100 €." } },
};

export function cardTitle(id: string, lang: Lang): string {
  return CARDS[id]?.title[lang] ?? id;
}
export function cardBody(id: string, lang: Lang): string {
  return CARDS[id]?.body[lang] ?? "";
}

// ---------------------------------------------------------------------------
// UI strings.
// ---------------------------------------------------------------------------
export const UI = {
  rollDice:     { en: "Roll Dice", fr: "Lancer les dés" },
  buy:          { en: "Buy", fr: "Acheter" },
  skip:         { en: "Skip", fr: "Passer" },
  endTurn:      { en: "End Turn", fr: "Fin du tour" },
  rolling:      { en: "Rolling…", fr: "Lancement…" },
  yourTurn:     { en: "Your turn", fr: "À votre tour" },
  turnOf:       { en: "{name}'s turn", fr: "Au tour de {name}" },
  waiting:      { en: "Waiting…", fr: "En attente…" },
  doubles:      { en: "Doubles — roll again!", fr: "Double — rejouez !" },
  rolled:       { en: "Rolled {a} + {b} = {t}", fr: "Dés : {a} + {b} = {t}" },
  cash:         { en: "Cash", fr: "Argent" },
  properties:   { en: "Properties", fr: "Propriétés" },
  inJail:       { en: "In Jail", fr: "En prison" },
  visiting:     { en: "Just visiting", fr: "Simple visite" },
  you:          { en: "You", fr: "Vous" },
  bot:          { en: "Bot", fr: "Bot" },
  bankrupt:     { en: "Bankrupt", fr: "En faillite" },
  payJail:      { en: "Pay {amt}", fr: "Payer {amt}" },
  useCard:      { en: "Use Jail Card", fr: "Carte de sortie" },
  buildHouse:   { en: "Build House", fr: "Bâtir une maison" },
  buildHotel:   { en: "Build Hotel", fr: "Bâtir un hôtel" },
  sellHouse:    { en: "Sell House", fr: "Vendre une maison" },
  mortgage:     { en: "Mortgage", fr: "Hypothéquer" },
  unmortgage:   { en: "Lift Mortgage", fr: "Lever l'hypothèque" },
  mortgaged:    { en: "MORTGAGED", fr: "HYPOTHÉQUÉE" },
  rent:         { en: "Rent", fr: "Loyer" },
  baseRent:     { en: "Base rent", fr: "Loyer de base" },
  withSet:      { en: "With colour set", fr: "Avec le groupe complet" },
  withHouses:   { en: "With {n} house(s)", fr: "Avec {n} maison(s)" },
  withHotel:    { en: "With hotel", fr: "Avec hôtel" },
  perHouse:     { en: "House cost", fr: "Prix d'une maison" },
  price:        { en: "Price", fr: "Prix" },
  ownedBy:      { en: "Owned by {name}", fr: "Propriété de {name}" },
  unowned:      { en: "Unowned", fr: "Libre" },
  railRent:     { en: "Rent: 1 owned $25 · 2 $50 · 3 $100 · 4 $200", fr: "Loyer : 1 gare 25 € · 2 50 € · 3 100 € · 4 200 €" },
  utilRent:     { en: "Rent: 4× dice (1 owned) or 10× dice (both)", fr: "Loyer : 4× les dés (1) ou 10× les dés (les deux)" },
  winner:       { en: "{name} wins!", fr: "{name} gagne !" },
  gameOver:     { en: "Game Over", fr: "Partie terminée" },
  backToLobby:  { en: "Back to Lobby", fr: "Retour au salon" },
  log:          { en: "Activity", fr: "Journal" },
  chanceDeck:   { en: "Chance", fr: "Chance" },
  chestDeck:    { en: "Community Chest", fr: "Caisse de Communauté" },
  gojfHeld:     { en: "Jail card", fr: "Carte prison" },
} as const;

export function t(key: keyof typeof UI, lang: Lang, params?: Record<string, string | number>): string {
  let s: string = UI[key][lang];
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

// ---------------------------------------------------------------------------
// Log localization. The server sends { key, params }; we render a sentence.
// `nameOf` resolves a player id to a display name.
// ---------------------------------------------------------------------------
export type LogCtx = {
  lang: Lang;
  nameOf: (pid: string) => string;
  currency?: Currency | null;
  boardId?: string;
  board?: any[]; // active board tiles, for board-authored place names
};

export function localizeLog(key: string, params: any, ctx: LogCtx): string {
  const { lang, nameOf } = ctx;
  const P = params || {};
  const who = P.pid ? nameOf(P.pid) : "";
  const other = P.otherPid ? nameOf(P.otherPid) : "";
  const boardId = ctx.boardId || "classic";
  const placeTile = P.spaceId != null && ctx.board ? ctx.board[P.spaceId] : null;
  const place = P.spaceId != null
    ? (placeTile ? tileFullName(placeTile, boardId, lang) : spaceName(P.spaceId, lang))
    : "";
  const amt = P.amount != null ? fmtMoney(P.amount, lang, ctx.currency) : "";
  // "You" needs different grammar than a name in the possessive turn-start line.
  const isYou = P.pid && nameOf(P.pid) === (lang === "fr" ? "Vous" : "You");

  const en = (): string => {
    switch (key) {
      case "game_start": return "The game begins. Good luck!";
      case "turn_start": return isYou ? "Your turn." : `${who}'s turn.`;
      case "roll": return `${who} rolled ${P.d1} + ${P.d2} = ${P.d1 + P.d2}.`;
      case "pass_go": return `${who} passed GO and collected ${amt || "$200"}.`;
      case "land": return `${who} landed on ${place}.`;
      case "buy": return `${who} bought ${place}.`;
      case "pay_rent": return `${who} paid ${amt} rent to ${other}.`;
      case "pay_tax": return `${who} paid ${amt} in tax.`;
      case "build": return P.houses === 5 ? `${who} built a hotel on ${place}.` : `${who} built a house on ${place}.`;
      case "sell_house": return `${who} sold a house on ${place}.`;
      case "mortgage": return `${who} mortgaged ${place}.`;
      case "unmortgage": return `${who} lifted the mortgage on ${place}.`;
      case "jail_enter": return `${who} was sent to Jail.`;
      case "jail_leave_doubles": return `${who} rolled doubles and left Jail.`;
      case "jail_leave_pay": return `${who} paid $50 and left Jail.`;
      case "jail_leave_card": return `${who} used a card and left Jail.`;
      case "jail_fail": return `${who} failed to roll doubles in Jail.`;
      case "jail_fine": return `${who} paid the $50 Jail fine.`;
      case "card": return `${who} drew ${P.deck === "chance" ? "Chance" : "Community Chest"}: “${cardTitle(P.cardId, lang)}”.`;
      case "bankrupt": return P.creditor ? `${who} went bankrupt to ${nameOf(P.creditor)}.` : `${who} went bankrupt.`;
      case "skip_turn": return `${who} skips a turn.`;
      case "special": {
        const m: Record<string, string> = {
          reward: `collected ${amt}`, fee: `paid ${amt}`, collectAll: `collected ${amt} from everyone`,
          payAll: `paid ${amt} to everyone`, teleport: "was teleported", jail: "was sent to Jail",
          extraRoll: "rolls again", skipTurn: "will skip a turn", drawChance: "drew a Chance card",
          drawChest: "drew a Community Chest card", safe: "reached a safe space",
        };
        return `${who} — ${m[P.effect] || "special event"}${place ? ` (${place})` : ""}.`;
      }
      case "world_cup_move": return `🏆 The World Cup moved to ${place} (rent ×${P.level}).`;
      case "jackpot_win": return `🅿️ ${who} scooped the jackpot: ${amt}!`;
      case "auction_start": return `🔨 ${place} goes to auction.`;
      case "auction_bid": return `🔨 ${who} bid ${amt}.`;
      case "auction_won": return `🔨 ${who} won ${place} at auction for ${amt}.`;
      case "auction_none": return `🔨 No bids — ${place} stays unowned.`;
      case "win": return `${who} wins the game! 🏆`;
      default: return "";
    }
  };

  const fr = (): string => {
    switch (key) {
      case "game_start": return "La partie commence. Bonne chance !";
      case "turn_start": return isYou ? "À vous de jouer." : `Au tour de ${who}.`;
      case "roll": return `${who} a lancé ${P.d1} + ${P.d2} = ${P.d1 + P.d2}.`;
      case "pass_go": return `${who} passe par le Départ et reçoit ${amt || "200 €"}.`;
      case "land": return `${who} arrive sur ${place}.`;
      case "buy": return `${who} achète ${place}.`;
      case "pay_rent": return `${who} paie ${amt} de loyer à ${other}.`;
      case "pay_tax": return `${who} paie ${amt} d'impôts.`;
      case "build": return P.houses === 5 ? `${who} construit un hôtel sur ${place}.` : `${who} construit une maison sur ${place}.`;
      case "sell_house": return `${who} vend une maison sur ${place}.`;
      case "mortgage": return `${who} hypothèque ${place}.`;
      case "unmortgage": return `${who} lève l'hypothèque de ${place}.`;
      case "jail_enter": return `${who} est envoyé en prison.`;
      case "jail_leave_doubles": return `${who} fait un double et sort de prison.`;
      case "jail_leave_pay": return `${who} paie 50 € et sort de prison.`;
      case "jail_leave_card": return `${who} utilise une carte et sort de prison.`;
      case "jail_fail": return `${who} n'a pas fait de double en prison.`;
      case "jail_fine": return `${who} paie l'amende de 50 € de la prison.`;
      case "card": return `${who} pioche ${P.deck === "chance" ? "Chance" : "Caisse de Communauté"} : « ${cardTitle(P.cardId, lang)} ».`;
      case "bankrupt": return P.creditor ? `${who} fait faillite au profit de ${nameOf(P.creditor)}.` : `${who} fait faillite.`;
      case "skip_turn": return `${who} passe son tour.`;
      case "special": {
        const m: Record<string, string> = {
          reward: `reçoit ${amt}`, fee: `paie ${amt}`, collectAll: `reçoit ${amt} de chaque joueur`,
          payAll: `paie ${amt} à chaque joueur`, teleport: "est téléporté", jail: "est envoyé en prison",
          extraRoll: "rejoue", skipTurn: "passera un tour", drawChance: "pioche une carte Chance",
          drawChest: "pioche une carte Caisse", safe: "arrive sur une case sûre",
        };
        return `${who} — ${m[P.effect] || "événement"}${place ? ` (${place})` : ""}.`;
      }
      case "world_cup_move": return `🏆 La Coupe du Monde passe sur ${place} (loyer ×${P.level}).`;
      case "jackpot_win": return `🅿️ ${who} rafle la cagnotte : ${amt} !`;
      case "auction_start": return `🔨 ${place} est mis aux enchères.`;
      case "auction_bid": return `🔨 ${who} mise ${amt}.`;
      case "auction_won": return `🔨 ${who} remporte ${place} aux enchères pour ${amt}.`;
      case "auction_none": return `🔨 Aucune mise — ${place} reste libre.`;
      case "win": return `${who} remporte la partie ! 🏆`;
      default: return "";
    }
  };

  return lang === "fr" ? fr() : en();
}

// Coarse category for log styling.
export function logCategory(key: string): string {
  if (key === "buy" || key === "build" || key === "pass_go" || key === "jackpot_win") return "gain";
  if (key === "pay_rent" || key === "pay_tax" || key === "bankrupt" || key === "jail_fine") return "loss";
  if (key.startsWith("jail")) return "jail";
  if (key === "card" || key === "world_cup_move") return "card";
  if (key === "win") return "win";
  return "";
}
