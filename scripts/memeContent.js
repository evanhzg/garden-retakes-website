// Content banks for Make It Meme. Templates carry percent-positioned caption
// "slots" so the client can render text on the image where it belongs. GIF mode
// swaps typed captions for a chosen reaction GIF answering a text prompt.

// slot: { x, y, w } as % of the image; w is the caption box width. Optional
// dark:true renders dark text (for light areas of the template).
const TEMPLATES = [
  // --- classic ---
  { id: "drake", name: "Drake", pack: "classic", url: "https://i.imgflip.com/30b1gx.jpg",
    slots: [{ x: 74, y: 25, w: 46, dark: true }, { x: 74, y: 75, w: 46, dark: true }] },
  { id: "two-buttons", name: "Two Buttons", pack: "classic", url: "https://i.imgflip.com/1g8my4.jpg",
    slots: [{ x: 33, y: 15, w: 30, dark: true }, { x: 62, y: 9, w: 32, dark: true }] },
  { id: "distracted", name: "Distracted Boyfriend", pack: "classic", url: "https://i.imgflip.com/1ur9b0.jpg",
    slots: [{ x: 80, y: 62, w: 26 }, { x: 52, y: 80, w: 26 }, { x: 19, y: 55, w: 26 }] },
  { id: "change-my-mind", name: "Change My Mind", pack: "classic", url: "https://i.imgflip.com/24y43o.jpg",
    slots: [{ x: 62, y: 68, w: 40, dark: true }] },
  { id: "expanding-brain", name: "Expanding Brain", pack: "classic", url: "https://i.imgflip.com/1jwhww.jpg",
    slots: [{ x: 74, y: 12, w: 46, dark: true }, { x: 74, y: 37, w: 46, dark: true }, { x: 74, y: 62, w: 46, dark: true }, { x: 74, y: 87, w: 46 }] },
  { id: "pigeon", name: "Is This A Pigeon?", pack: "classic", url: "https://i.imgflip.com/1o00in.jpg",
    slots: [{ x: 30, y: 20, w: 34 }, { x: 78, y: 42, w: 30 }, { x: 50, y: 90, w: 90 }] },
  { id: "one-does-not", name: "One Does Not Simply", pack: "classic", url: "https://i.imgflip.com/1bij.jpg",
    slots: [{ x: 50, y: 8, w: 92 }, { x: 50, y: 88, w: 92 }] },
  { id: "gru-plan", name: "Gru's Plan", pack: "classic", url: "https://i.imgflip.com/26jxvz.jpg",
    slots: [{ x: 26, y: 12, w: 40, dark: true }, { x: 74, y: 12, w: 40, dark: true }, { x: 26, y: 62, w: 40, dark: true }, { x: 74, y: 62, w: 40, dark: true }] },

  // --- reaction (single caption) ---
  { id: "pikachu", name: "Surprised Pikachu", pack: "classic", url: "https://i.imgflip.com/2kbn1e.jpg",
    slots: [{ x: 50, y: 12, w: 92 }] },
  { id: "stonks", name: "Stonks", pack: "classic", url: "https://i.imgflip.com/3pnmg2.jpg",
    slots: [{ x: 50, y: 12, w: 92 }] },
  { id: "this-is-fine", name: "This Is Fine", pack: "chaos", url: "https://i.imgflip.com/wxica.jpg",
    slots: [{ x: 50, y: 10, w: 92 }] },
  { id: "disaster-girl", name: "Disaster Girl", pack: "chaos", url: "https://i.imgflip.com/23ls.jpg",
    slots: [{ x: 50, y: 10, w: 92 }, { x: 50, y: 90, w: 92 }] },
  { id: "hide-the-pain", name: "Hide the Pain Harold", pack: "wholesome", url: "https://i.imgflip.com/gk5el.jpg",
    slots: [{ x: 50, y: 10, w: 92 }, { x: 50, y: 90, w: 92 }] },
  { id: "success-kid", name: "Success Kid", pack: "wholesome", url: "https://i.imgflip.com/1bhk.jpg",
    slots: [{ x: 50, y: 10, w: 92 }, { x: 50, y: 90, w: 92 }] },

  // --- CS2-flavoured (classic templates, themed by captions) ---
  { id: "cs-rock", name: "The Rock Driving", pack: "cs2", url: "https://i.imgflip.com/26am.jpg",
    slots: [{ x: 30, y: 12, w: 40 }, { x: 30, y: 62, w: 40 }] },
  { id: "cs-clown", name: "Clown Makeup", pack: "cs2", url: "https://i.imgflip.com/38el31.jpg",
    slots: [{ x: 72, y: 14, w: 46, dark: true }, { x: 72, y: 38, w: 46, dark: true }, { x: 72, y: 62, w: 46, dark: true }, { x: 72, y: 86, w: 46, dark: true }] },
  { id: "cs-sweating", name: "Sweating Jordan Peele", pack: "cs2", url: "https://i.imgflip.com/265k.jpg",
    slots: [{ x: 50, y: 10, w: 92 }, { x: 50, y: 90, w: 92 }] },

  // --- animated GIF templates (only used when the GIF pack is on) ---
  { id: "gif-fine", name: "Everything's Fine", pack: "gif", animated: true, url: "https://media.giphy.com/media/QMHoU66sBXqqLqYvGO/giphy.gif",
    slots: [{ x: 50, y: 10, w: 92 }, { x: 50, y: 90, w: 92 }] },
  { id: "gif-panik", name: "Panik Kalm", pack: "gif", animated: true, url: "https://media.giphy.com/media/kFgzrTt798d2w/giphy.gif",
    slots: [{ x: 50, y: 12, w: 92 }] },
];

// Prompts for GIF-reaction mode ("answer this with a GIF").
const GIF_PROMPTS = {
  en: [
    "When the round starts and you already died",
    "Your reaction to a teammate's 1v5 clutch",
    "Me opening my inventory expecting a knife",
    "When someone says 'trust me, I've got this'",
    "Monday morning, every week",
    "When the WiFi drops mid-clutch",
    "Trying to act normal after a huge mistake",
    "When the plan actually works",
    "Me watching my rank drop",
    "When someone eats the last slice",
    "That moment the boss walks in",
    "When you finally understand the assignment",
  ],
  fr: [
    "Quand le round commence et t'es déjà mort",
    "Ta réaction au clutch 1v5 d'un coéquipier",
    "Moi qui ouvre mon inventaire en espérant un couteau",
    "Quand quelqu'un dit « fais-moi confiance »",
    "Le lundi matin, chaque semaine",
    "Quand la WiFi coupe en plein clutch",
    "Essayer de rester normal après une grosse erreur",
    "Quand le plan marche vraiment",
    "Moi qui regarde mon rang chuter",
    "Quand quelqu'un prend la dernière part",
    "Le moment où le patron entre",
    "Quand tu comprends enfin la consigne",
  ],
};

// A small curated reaction-GIF library for the answer picker (no external API).
const GIF_LIBRARY = [
  { id: "clap", tags: "applause clap", url: "https://media.giphy.com/media/7rj2ZgttvgomY/giphy.gif" },
  { id: "facepalm", tags: "facepalm no", url: "https://media.giphy.com/media/6yRVg0HWzgS88/giphy.gif" },
  { id: "shrug", tags: "shrug idk", url: "https://media.giphy.com/media/jS8Fvzd88jNS0/giphy.gif" },
  { id: "mindblown", tags: "mind blown", url: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif" },
  { id: "crying", tags: "crying sad", url: "https://media.giphy.com/media/d2lcHJTG5Tscg/giphy.gif" },
  { id: "dance", tags: "dance happy", url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif" },
  { id: "sideye", tags: "side eye suspicious", url: "https://media.giphy.com/media/ZgTR3UQ9Xc6Ba/giphy.gif" },
  { id: "thumbsup", tags: "thumbs up nice", url: "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif" },
  { id: "confused", tags: "confused math", url: "https://media.giphy.com/media/3o7aTskHEUdgCQAXde/giphy.gif" },
  { id: "popcorn", tags: "popcorn watching", url: "https://media.giphy.com/media/3oEjHV0z8S7WM4MwnK/giphy.gif" },
  { id: "nervous", tags: "nervous sweating", url: "https://media.giphy.com/media/Rhhr8D5mccxdK/giphy.gif" },
  { id: "salute", tags: "salute respect", url: "https://media.giphy.com/media/l0HlN5Y28D9MzzcRy/giphy.gif" },
  { id: "cheers", tags: "cheers drink", url: "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif" },
  { id: "run", tags: "run away", url: "https://media.giphy.com/media/l46Cy1rHbQ92uuLXa/giphy.gif" },
  { id: "no", tags: "no nope", url: "https://media.giphy.com/media/jUwpNzg9IcyrK54/giphy.gif" },
  { id: "yes", tags: "yes success", url: "https://media.giphy.com/media/a0h7sAqON67nO/giphy.gif" },
  { id: "shocked", tags: "shocked gasp", url: "https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif" },
  { id: "sleep", tags: "sleep bored tired", url: "https://media.giphy.com/media/QPQ3xlJhqB3Tssdd6G/giphy.gif" },
  { id: "smh", tags: "smh disappointed", url: "https://media.giphy.com/media/vX9WcCiWwUF7G/giphy.gif" },
  { id: "party", tags: "party celebrate", url: "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif" },
  { id: "typing", tags: "typing waiting", url: "https://media.giphy.com/media/13GIgrGdslD9oQ/giphy.gif" },
  { id: "evil", tags: "evil plotting", url: "https://media.giphy.com/media/dpFj90d7X8Ego/giphy.gif" },
  { id: "cool", tags: "cool sunglasses deal with it", url: "https://media.giphy.com/media/3oEjHUS8sVvhqjNsQE/giphy.gif" },
  { id: "wave", tags: "wave hi bye", url: "https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif" },
];

const PACKS = ["classic", "cs2", "wholesome", "chaos", "gif"];

module.exports = { TEMPLATES, GIF_PROMPTS, GIF_LIBRARY, PACKS };
