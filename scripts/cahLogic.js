// Cards Against Humanity — Server-Authoritative Game Logic

const BLACK_CARDS = {
  en: [
    "I drink to forget _____.",
    "What's that smell?",
    "I got 99 problems but _____ ain't one.",
    "_____ is a slippery slope that leads to _____.",
    "What ended my last relationship?",
    "In M. Night Shyamalan's newest movie, Bruce Willis discovers that _____ had really been _____ all along.",
    "What's the next Happy Meal toy?",
    "Alternative medicine is now embracing the curative powers of _____.",
    "What's my secret talent?",
    "What never fails to liven up the party?",
    "What's Batman's guilty pleasure?",
    "_____ + _____ = _____.",
    "TSA guidelines now prohibit _____ on airplanes.",
    "What's the most _____ thing about _____ ?",
    "The class field trip was ruined by _____.",
    "In a world ravaged by _____, our only solace is _____.",
    "What did I bring back from Mexico?",
    "What keeps me up at night?",
    "During Wrestlemania XXX, John Cena made his opponent tap out using _____.",
    "Step 1: _____. Step 2: _____. Step 3: Profit.",
    "Instead of coal, Santa now gives _____ to naughty children.",
    "What would grandma find disturbing, yet oddly charming?",
    "I couldn't complete my homework because of _____.",
    "Next on Fox News: _____ somehow linked to terrorism.",
    "When the pharaoh remained unmoved, Moses called forth _____.",
  ],
  fr: [
    "Je bois pour oublier _____.",
    "C'est quoi cette odeur ?",
    "J'ai 99 problèmes mais _____ n'en est pas un.",
    "_____ est une pente glissante qui mène à _____.",
    "Qu'est-ce qui a mis fin à ma dernière relation ?",
    "Dans le dernier film de M. Night Shyamalan, Bruce Willis découvre que _____ était en fait _____ depuis le début.",
    "Quel est le prochain jouet du Happy Meal ?",
    "La médecine alternative s'intéresse maintenant aux pouvoirs curatifs de _____.",
    "Quel est mon talent secret ?",
    "Qu'est-ce qui ne manque jamais d'animer une soirée ?",
    "Quel est le plaisir coupable de Batman ?",
    "_____ + _____ = _____.",
    "Les directives de la TSA interdisent désormais _____ dans les avions.",
    "Quelle est la chose la plus _____ à propos de _____ ?",
    "Le voyage scolaire a été gâché par _____.",
    "Dans un monde ravagé par _____, notre seul réconfort est _____.",
    "Qu'est-ce que j'ai ramené du Mexique ?",
    "Qu'est-ce qui m'empêche de dormir la nuit ?",
    "Lors de Wrestlemania XXX, John Cena a fait abandonner son adversaire en utilisant _____.",
    "Étape 1 : _____. Étape 2 : _____. Étape 3 : Profit.",
    "Au lieu de charbon, le Père Noël donne maintenant _____ aux enfants méchants.",
    "Qu'est-ce que grand-mère trouverait dérangeant, mais étrangement charmant ?",
    "Je n'ai pas pu finir mes devoirs à cause de _____.",
    "Prochainement sur Fox News : _____ serait lié au terrorisme.",
    "Quand le pharaon est resté insensible, Moïse a invoqué _____."
  ]
};

const WHITE_CARDS = {
  en: [
    "Being on fire.", "Racism.", "Old-people smell.", "A micropenis.",
    "Women in yogurt commercials.", "Classist undertones.", "Not giving a shit about the third world.",
    "Coat hanger abortions.", "The three-fifths compromise.", "Roofies.",
    "A salty surprise.", "A windmill full of corpses.", "Lunchables.",
    "Poverty.", "Face-sitting.", "A snapping turtle biting the tip of your penis.",
    "A middle school talent show.", "A bleached asshole.", "Chunks of dead hitchhiker.",
    "PB&J.", "Passive-aggressive Post-it notes.", "Fancy Feast.", "Flying sex snakes.",
    "MechaHitler.", "Being a motherfucking sorcerer.", "A disappointing birthday party.",
    "Puppies!", "A robust Mongoloid.", "A brain tumor.", "Her Majesty, Queen Elizabeth II.",
    "Emotional baggage.", "A stray pube.", "Daniel Radcliffe's delicious asshole.",
    "Picking up girls at the abortion clinic.", "When you fart and a little bit comes out.",
    "An icepick lobotomy.", "Gladiatorial combat.", "Road kill.", "The Easter Bunny.",
    "Full frontal nudity.", "Land mines.", "A defective condom.", "Actually funny female comedians.",
    "A gentle caress of the inner thigh.", "Bingeing and purging.", "Vigorous jazz hands.",
    "Two midgets shitting into a bucket.", "The token minority.", "Opposable thumbs.",
    "A good sniff.", "Drinking alone.", "Hot cheese.", "World peace.",
    "Exactly $1.50.", "Your weird uncle.", "Anxiety.", "Horse meat.",
    "A bag of magic beans.", "Lactation.", "A really cool hat.", "My relationship status.",
    "Dying.", "Nicolas Cage.", "Hope.", "Emotions.", "Scientology.",
    "An uncomfortable amount of hair in the drain.", "My inner demons.",
    "Getting catfished.", "A PowerPoint presentation.",
  ],
  fr: [
    "Être en feu.", "Le racisme.", "L'odeur des vieilles personnes.", "Un micropénis.",
    "Les femmes dans les pubs de yaourts.", "Des sous-entendus classistes.", "S'en foutre du tiers-monde.",
    "Les avortements au cintre.", "Le compromis des trois cinquièmes.", "Du GHB.",
    "Une surprise salée.", "Un moulin à vent plein de cadavres.", "Des Lunchables.",
    "La pauvreté.", "S'asseoir sur un visage.", "Une tortue hargneuse qui te mord le bout du pénis.",
    "Le spectacle de talents du collège.", "Un trou du cul blanchi.", "Des morceaux de l'auto-stoppeur mort.",
    "Un sandwich beurre de cacahuète confiture.", "Des Post-it passifs-agressifs.", "De la pâtée de luxe.", "Des serpents sexuels volants.",
    "MechaHitler.", "Être un putain de sorcier.", "Une fête d'anniversaire décevante.",
    "Des chiots !", "Un mongoloïde robuste.", "Une tumeur au cerveau.", "Sa Majesté, la Reine Elizabeth II.",
    "Un bagage émotionnel.", "Un poil pubien égaré.", "Le délicieux trou du cul de Daniel Radcliffe.",
    "Draguer des filles à la clinique d'avortement.", "Quand tu pètes et qu'il y a un petit truc qui sort.",
    "Une lobotomie au pic à glace.", "Un combat de gladiateurs.", "Un animal écrasé.", "Le lapin de Pâques.",
    "Une nudité frontale totale.", "Des mines terrestres.", "Un préservatif défectueux.", "Des humoristes femmes vraiment drôles.",
    "Une douce caresse à l'intérieur de la cuisse.", "Des crises de boulimie.", "Faire vigoureusement les mains de jazz.",
    "Deux nains qui chient dans un seau.", "La minorité de service.", "Des pouces opposables.",
    "Une bonne inspiration.", "Boire seul.", "Du fromage fondu.", "La paix dans le monde.",
    "Exactement 1,50 €.", "Ton oncle bizarre.", "L'anxiété.", "De la viande de cheval.",
    "Un sac de haricots magiques.", "La lactation.", "Un chapeau vraiment cool.", "Ma situation amoureuse.",
    "Mourir.", "Nicolas Cage.", "L'espoir.", "Des émotions.", "La Scientologie.",
    "Une quantité inconfortable de cheveux dans le siphon.", "Mes démons intérieurs.",
    "Se faire arnaquer sur internet.", "Une présentation PowerPoint."
  ]
};

let nextCardId = 0;

class CahGame {
  constructor(lobbyId) {
    this.lobbyId = lobbyId;
    this.status = 'WAITING';
    this.players = [];
    this.hands = {};
    this.scores = {};
    this.czarIndex = 0;
    this.currentBlack = null;
    this.submissions = {};  // playerId -> [cardId, ...]
    this.revealedSubmissions = []; // { playerId, cards: [...] }
    this.phase = 'SUBMIT'; // SUBMIT, JUDGE, REVEAL
    this.roundWinner = null;
    this.deck = [];
    this.blackDeck = [];
    this.round = 0;
    this.maxRounds = 10;
    this.logs = [];
    
    // Configurable Settings
    this.language = 'en'; // 'en' or 'fr'
    this.turnTimer = 'Infinite'; // '30', '60', '90', 'Infinite'
    this.timeLeft = null;
    this.history = []; // Track winning rounds
  }

  addPlayer(playerId) {
    if (this.status !== 'WAITING' || this.players.length >= 8) return false;
    if (this.players.includes(playerId)) return false;
    this.players.push(playerId);
    this.scores[playerId] = 0;
    return true;
  }

  removePlayer(playerId) {
    if (this.status !== 'WAITING') return false;
    this.players = this.players.filter(p => p !== playerId);
    delete this.scores[playerId];
    return true;
  }

  start() {
    if (this.players.length < 3) return false;
    this.status = 'PLAYING';
    this.round = 0;
    this.czarIndex = 0;
    this.scores = {};
    this.players.forEach(p => this.scores[p] = 0);
    this.history = [];

    // Build decks
    const whiteCardsPool = WHITE_CARDS[this.language] || WHITE_CARDS.en;
    const blackCardsPool = BLACK_CARDS[this.language] || BLACK_CARDS.en;
    
    this.deck = whiteCardsPool.map(text => ({ id: nextCardId++, text }));
    this.deck.sort(() => Math.random() - 0.5);
    this.blackDeck = blackCardsPool.map(text => ({ id: nextCardId++, text, pick: text.split('_____').length - 1 || 1 }));
    this.blackDeck.sort(() => Math.random() - 0.5);

    // Deal 7 cards to each player
    this.hands = {};
    this.players.forEach(p => {
      this.hands[p] = this.deck.splice(0, 7);
    });

    this._startRound();
    return true;
  }

  _startRound() {
    this.round++;
    if (this.round > this.maxRounds || this.blackDeck.length === 0) {
      this._endGame();
      return;
    }

    this.currentBlack = this.blackDeck.pop();
    this.submissions = {};
    this.revealedSubmissions = [];
    this.roundWinner = null;
    this.phase = 'SUBMIT';
    
    if (this.turnTimer !== 'Infinite') {
      this.timeLeft = parseInt(this.turnTimer);
    } else {
      this.timeLeft = null;
    }

    const czar = this.players[this.czarIndex];
    const czarName = czar.startsWith('BOT_') ? `Bot ${czar.slice(-4)}` : czar.slice(-4);
    this.logs.push({ id: Date.now(), text: `Round ${this.round}. Card Czar: ${czarName}` });
  }

  submitCards(playerId, cardIds) {
    if (this.status !== 'PLAYING' || this.phase !== 'SUBMIT') return false;
    if (this.players[this.czarIndex] === playerId) return false; // Czar doesn't submit
    if (this.submissions[playerId]) return false; // Already submitted

    const hand = this.hands[playerId];
    if (!hand) return false;

    const pick = this.currentBlack.pick || 1;
    if (cardIds.length !== pick) return false;

    const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);
    if (cards.length !== pick) return false;

    this.submissions[playerId] = cards;
    // Remove from hand and replenish
    this.hands[playerId] = hand.filter(c => !cardIds.includes(c.id));
    const needed = pick;
    const drawn = this.deck.splice(0, needed);
    this.hands[playerId].push(...drawn);

    // Check if all non-czar players have submitted
    const expectedSubmitters = this.players.filter((p, i) => i !== this.czarIndex);
    if (expectedSubmitters.every(p => this.submissions[p])) {
      this._startJudging();
    }
    return true;
  }

  _startJudging() {
    this.phase = 'JUDGE';
    // Shuffle submissions so czar can't tell who submitted what
    const entries = Object.entries(this.submissions).map(([pid, cards]) => ({ playerId: pid, cards }));
    entries.sort(() => Math.random() - 0.5);
    this.revealedSubmissions = entries;
    
    if (this.turnTimer !== 'Infinite') {
      this.timeLeft = parseInt(this.turnTimer);
    } else {
      this.timeLeft = null;
    }
    
    this.logs.push({ id: Date.now(), text: `All submissions in. Card Czar is judging...` });
  }

  pickWinner(czarId, winnerPlayerId) {
    if (this.status !== 'PLAYING' || this.phase !== 'JUDGE') return false;
    if (this.players[this.czarIndex] !== czarId) return false;
    if (!this.submissions[winnerPlayerId]) return false;

    this.scores[winnerPlayerId]++;
    this.roundWinner = winnerPlayerId;
    this.phase = 'REVEAL';
    this.timeLeft = null;

    const winnerName = winnerPlayerId.startsWith('BOT_') ? `Bot ${winnerPlayerId.slice(-4)}` : winnerPlayerId.slice(-4);
    
    // Record history
    const winningCards = this.submissions[winnerPlayerId].map(c => c.text);
    this.history.push({
      round: this.round,
      blackCard: this.currentBlack.text,
      whiteCards: winningCards,
      winner: winnerName
    });

    this.logs.push({ id: Date.now(), text: `🏆 ${winnerName} wins the round!` });
    return true;
  }

  nextRound(playerId) {
    if (this.phase !== 'REVEAL') return false;
    if (this.players[0] !== playerId) return false; // Host only

    this.czarIndex = (this.czarIndex + 1) % this.players.length;
    this._startRound();
    return true;
  }

  _endGame() {
    this.status = 'FINISHED';
    const sorted = Object.entries(this.scores).sort((a, b) => b[1] - a[1]);
    const winnerName = sorted[0][0].startsWith('BOT_') ? `Bot ${sorted[0][0].slice(-4)}` : sorted[0][0].slice(-4);
    this.logs.push({ id: Date.now(), text: `🎉 Game over! ${winnerName} wins with ${sorted[0][1]} points!` });
  }

  resetToLobby() {
    this.status = 'WAITING';
    this.hands = {};
    this.submissions = {};
    this.revealedSubmissions = [];
    this.currentBlack = null;
    this.logs = [];
    return true;
  }

  submitCustomCards(playerId, customCardTexts) {
    if (this.status !== 'PLAYING' || this.phase !== 'SUBMIT') return false;
    if (this.players[this.czarIndex] === playerId) return false;
    if (this.submissions[playerId]) return false;

    const pick = this.currentBlack.pick || 1;
    if (customCardTexts.length !== pick) return false;

    const cards = customCardTexts.map(text => ({ id: 'custom_' + Date.now() + Math.random(), text }));
    this.submissions[playerId] = cards;

    const expectedSubmitters = this.players.filter((p, i) => i !== this.czarIndex);
    if (expectedSubmitters.every(p => this.submissions[p])) {
      this._startJudging();
    }
    return true;
  }

  tick() {
    if (this.status !== 'PLAYING' || this.timeLeft === null) return false;
    this.timeLeft--;
    if (this.timeLeft <= 0) {
      this.forceAction();
      return true;
    }
    return false;
  }

  forceAction() {
    if (this.phase === 'SUBMIT') {
      const expectedSubmitters = this.players.filter((p, i) => i !== this.czarIndex);
      expectedSubmitters.forEach(p => {
        if (!this.submissions[p]) {
          const hand = this.hands[p] || [];
          const pick = this.currentBlack.pick || 1;
          const idsToSubmit = hand.slice(0, pick).map(c => c.id);
          this.submitCards(p, idsToSubmit);
        }
      });
    } else if (this.phase === 'JUDGE') {
      if (this.revealedSubmissions.length > 0) {
        const randomWinner = this.revealedSubmissions[Math.floor(Math.random() * this.revealedSubmissions.length)].playerId;
        this.pickWinner(this.players[this.czarIndex], randomWinner);
      }
    }
  }

  getStateForPlayer(playerId) {
    return {
      lobbyId: this.lobbyId,
      status: this.status,
      language: this.language,
      turnTimer: this.turnTimer,
      timeLeft: this.timeLeft,
      players: this.players,
      scores: this.scores,
      czar: this.players[this.czarIndex],
      currentBlack: this.currentBlack,
      hand: this.hands[playerId] || [],
      phase: this.phase,
      submittedPlayers: Object.keys(this.submissions),
      revealedSubmissions: this.phase === 'JUDGE' || this.phase === 'REVEAL' ? this.revealedSubmissions : [],
      roundWinner: this.roundWinner,
      round: this.round,
      maxRounds: this.maxRounds,
      history: this.history,
      logs: this.logs.slice(-15),
    };
  }
}

module.exports = CahGame;
