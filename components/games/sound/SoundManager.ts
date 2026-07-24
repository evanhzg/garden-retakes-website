// Tiny Web-Audio SFX engine for the games. Every sound is synthesized on the
// fly (oscillators + filtered noise) so there are no asset files to ship and no
// network/CSP concerns. Volume + mute persist to localStorage.
//
// Browsers require a user gesture before audio can start: the AudioContext is
// created lazily on the first play() and resumed if suspended.

export type SoundName =
  | "click" | "dice" | "diceBounce" | "diceLand" | "hop" | "land" | "buy" | "build" | "rent" | "tax"
  | "mortgage" | "unmortgage" | "sell" | "special" | "worldCup" | "jackpot" | "auction"
  | "passGo" | "jail" | "card" | "win" | "bankrupt"
  // OUNO
  | "cardPlay" | "cardDraw" | "cardDeal" | "shuffle" | "unoCall" | "penalty" | "caught"
  | "error" | "skipTurn" | "reverse" | "wild" | "stack" | "swap" | "turnAlert" | "tick"
  // Skribbl
  | "correct" | "close" | "chat" | "roundStart" | "roundEnd" | "hint" | "timeUp"
  // Make It Meme
  | "submit" | "voteCast" | "reveal" | "drumroll" | "fanfare" | "whoosh";

type Persisted = { volume: number; muted: boolean };
const LS_KEY = "mono_sound";

function loadPersisted(): Persisted {
  if (typeof window === "undefined") return { volume: 0.6, muted: false };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        volume: typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : 0.6,
        muted: !!p.muted,
      };
    }
  } catch {}
  return { volume: 0.6, muted: false };
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private state: Persisted = loadPersisted();
  private listeners = new Set<(s: Persisted) => void>();

  private ensure(): boolean {
    if (typeof window === "undefined") return false;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.state.muted ? 0 : this.state.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return true;
  }

  getState(): Persisted { return { ...this.state }; }

  subscribe(fn: (s: Persisted) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persistAndNotify() {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(this.state)); } catch {}
    const snap = this.getState();
    this.listeners.forEach((l) => l(snap));
  }

  setVolume(v: number) {
    this.state.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx && !this.state.muted) {
      this.master.gain.setTargetAtTime(this.state.volume, this.ctx.currentTime, 0.01);
    }
    this.persistAndNotify();
  }

  setMuted(m: boolean) {
    this.state.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.state.volume, this.ctx.currentTime, 0.01);
    }
    this.persistAndNotify();
  }

  toggleMute() { this.setMuted(!this.state.muted); }

  // --- low-level synth helpers -------------------------------------------
  private tone(
    freq: number, dur: number, type: OscillatorType, gain: number, when: number,
    slideTo?: number
  ) {
    const ctx = this.ctx!, master = this.master!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private noise(dur: number, filterHz: number, gain: number, when: number, q = 1) {
    const ctx = this.ctx!, master = this.master!;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = filterHz;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filt).connect(g).connect(master);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  play(name: SoundName) {
    if (!this.ensure() || this.state.muted || this.state.volume <= 0) return;
    const t = this.ctx!.currentTime;
    switch (name) {
      case "click":
        this.tone(520, 0.06, "triangle", 0.16, t, 380);
        break;
      case "dice":
        // a short rattle: several filtered noise ticks (the shake before it lands)
        for (let i = 0; i < 5; i++) this.noise(0.05, 2600 + Math.random() * 1200, 0.16, t + i * 0.055, 2);
        break;
      case "diceBounce":
        // a light knock each time a die bounces on the board
        this.tone(240, 0.045, "sine", 0.12, t, 150);
        this.noise(0.02, 1500, 0.06, t, 3);
        break;
      case "diceLand":
        // the dice settling on the board — a small wooden thunk + tick
        this.tone(150, 0.14, "sine", 0.22, t, 80);
        this.noise(0.06, 700, 0.14, t, 1.4);
        this.noise(0.03, 3200, 0.08, t + 0.05, 3);
        break;
      case "hop":
        // a soft footstep as a pawn steps to the next tile (kept quiet — several
        // fire in a row during a move).
        this.tone(300, 0.05, "triangle", 0.09, t, 180);
        this.noise(0.028, 900, 0.05, t, 2);
        break;
      case "land":
        this.tone(150, 0.16, "sine", 0.24, t, 90);
        this.noise(0.08, 500, 0.1, t);
        break;
      case "buy":
        this.tone(523.25, 0.1, "triangle", 0.2, t);
        this.tone(783.99, 0.16, "triangle", 0.2, t + 0.09);
        break;
      case "build":
        this.noise(0.06, 1800, 0.18, t, 3);
        this.tone(320, 0.08, "square", 0.14, t + 0.02, 200);
        break;
      case "rent":
      case "tax":
        this.tone(660, 0.09, "triangle", 0.18, t);
        this.tone(440, 0.14, "triangle", 0.16, t + 0.08, 300);
        break;
      case "mortgage":
        // money out, but reversible — a low descending "chunk".
        this.tone(300, 0.13, "sawtooth", 0.14, t, 150);
        this.noise(0.05, 500, 0.08, t);
        break;
      case "unmortgage":
        // reclaiming a property — a bright rising pair.
        this.tone(392, 0.1, "triangle", 0.16, t);
        this.tone(587.33, 0.14, "triangle", 0.16, t + 0.08);
        break;
      case "sell":
        this.tone(523.25, 0.08, "triangle", 0.16, t);
        this.tone(349.23, 0.13, "triangle", 0.14, t + 0.07, 220);
        break;
      case "special": {
        // a light magical sparkle for POI events.
        [880, 1174.66, 1567.98].forEach((f, i) => this.tone(f, 0.18, "sine", 0.13, t + i * 0.05));
        break;
      }
      case "worldCup": {
        // a short triumphant trophy flourish.
        [659.25, 830.61, 987.77, 1318.51].forEach((f, i) => this.tone(f, 0.2, "triangle", 0.2, t + i * 0.08));
        this.noise(0.05, 5000, 0.06, t, 3);
        break;
      }
      case "jackpot": {
        // a cascade of coins.
        for (let i = 0; i < 8; i++) this.tone(1200 - i * 70 + Math.random() * 60, 0.06, "triangle", 0.12, t + i * 0.04);
        this.tone(1046.5, 0.2, "sine", 0.12, t + 0.34);
        break;
      }
      case "auction": {
        // two gavel knocks.
        for (const off of [0, 0.16]) {
          this.noise(0.05, 420, 0.22, t + off, 1.2);
          this.tone(160, 0.08, "sine", 0.16, t + off, 90);
        }
        break;
      }
      case "passGo": {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => this.tone(f, 0.16, "triangle", 0.2, t + i * 0.09));
        break;
      }
      case "jail":
        this.tone(120, 0.22, "square", 0.2, t, 70);
        this.noise(0.12, 900, 0.14, t, 1.5);
        break;
      case "card":
        this.noise(0.22, 1400, 0.14, t, 0.8);
        this.tone(700, 0.1, "sine", 0.08, t + 0.02, 1200);
        break;
      case "win": {
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        notes.forEach((f, i) => this.tone(f, 0.24, "triangle", 0.22, t + i * 0.12));
        break;
      }
      case "bankrupt": {
        const notes = [523.25, 415.3, 349.23, 261.63];
        notes.forEach((f, i) => this.tone(f, 0.2, "sawtooth", 0.16, t + i * 0.13));
        break;
      }

      // --- OUNO -----------------------------------------------------------
      case "cardPlay":
        // card slapping down on the pile: a paper slide into a soft thud
        this.noise(0.09, 2200 + Math.random() * 600, 0.13, t, 0.7);
        this.tone(190 + Math.random() * 40, 0.07, "sine", 0.16, t + 0.045, 120);
        break;
      case "cardDraw":
        // one card sliding off the top of the deck
        this.noise(0.11, 1500 + Math.random() * 500, 0.1, t, 0.9);
        this.tone(620, 0.05, "sine", 0.05, t + 0.03, 900);
        break;
      case "cardDeal":
        for (let i = 0; i < 5; i++) {
          this.noise(0.07, 1600 + Math.random() * 700, 0.09, t + i * 0.07, 0.9);
        }
        break;
      case "shuffle":
        // a riffle: a dense run of very short paper ticks
        for (let i = 0; i < 14; i++) {
          this.noise(0.03, 2000 + Math.random() * 1600, 0.07, t + i * 0.022, 1.6);
        }
        break;
      case "unoCall": {
        // a bright, shouted two-note "oh-no!"
        this.tone(587.33, 0.12, "triangle", 0.22, t, 880);
        this.tone(880, 0.22, "triangle", 0.2, t + 0.11);
        this.tone(1174.66, 0.18, "sine", 0.1, t + 0.14);
        break;
      }
      case "penalty":
        // cards being dumped on you
        for (let i = 0; i < 3; i++) this.noise(0.08, 1400, 0.12, t + i * 0.08, 0.9);
        this.tone(300, 0.26, "sawtooth", 0.14, t, 120);
        break;
      case "caught":
        // a hard buzzer — you forgot to call it
        this.tone(160, 0.3, "square", 0.2, t, 100);
        this.tone(110, 0.3, "sawtooth", 0.14, t + 0.02, 70);
        this.noise(0.12, 600, 0.12, t, 1.2);
        break;
      case "error":
        this.tone(220, 0.13, "square", 0.14, t, 150);
        break;
      case "skipTurn":
        this.tone(880, 0.07, "square", 0.14, t, 440);
        this.tone(440, 0.1, "square", 0.12, t + 0.06, 220);
        break;
      case "reverse": {
        // a swoop that turns around on itself
        this.tone(300, 0.14, "triangle", 0.16, t, 900);
        this.tone(900, 0.14, "triangle", 0.16, t + 0.13, 300);
        break;
      }
      case "wild": {
        // shimmering colour change
        [659.25, 830.61, 1046.5, 1318.51].forEach((f, i) =>
          this.tone(f, 0.22, "sine", 0.12, t + i * 0.045));
        break;
      }
      case "stack":
        // tension rising as the draw pile grows
        this.tone(330, 0.1, "sawtooth", 0.14, t, 520);
        this.tone(520, 0.14, "sawtooth", 0.12, t + 0.09, 700);
        break;
      case "swap": {
        // two lines crossing over each other
        this.tone(400, 0.2, "triangle", 0.14, t, 900);
        this.tone(900, 0.2, "triangle", 0.14, t, 400);
        break;
      }
      case "turnAlert":
        this.tone(783.99, 0.12, "triangle", 0.18, t);
        this.tone(1046.5, 0.2, "triangle", 0.16, t + 0.1);
        break;
      case "tick":
        this.tone(1400, 0.03, "square", 0.07, t);
        break;

      // --- Skribbl --------------------------------------------------------
      case "correct": {
        [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 0.16, "triangle", 0.2, t + i * 0.07));
        break;
      }
      case "close":
        this.tone(466.16, 0.1, "triangle", 0.14, t);
        this.tone(415.3, 0.14, "triangle", 0.12, t + 0.09);
        break;
      case "chat":
        this.tone(660, 0.05, "sine", 0.09, t, 880);
        break;
      case "roundStart": {
        [392, 523.25, 659.25].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.18, t + i * 0.08));
        break;
      }
      case "roundEnd": {
        [659.25, 523.25, 392].forEach((f, i) => this.tone(f, 0.2, "triangle", 0.16, t + i * 0.09));
        break;
      }
      case "hint":
        this.tone(1174.66, 0.1, "sine", 0.12, t);
        this.tone(1567.98, 0.12, "sine", 0.09, t + 0.07);
        break;
      case "timeUp":
        for (const off of [0, 0.18]) this.tone(440, 0.14, "square", 0.16, t + off, 330);
        break;

      // --- Make It Meme ---------------------------------------------------
      case "submit":
        // a satisfying "locked in" stamp
        this.tone(392, 0.07, "triangle", 0.18, t);
        this.tone(587.33, 0.12, "triangle", 0.18, t + 0.06);
        this.noise(0.04, 1800, 0.08, t + 0.06, 2);
        break;
      case "voteCast":
        this.tone(659.25, 0.08, "sine", 0.16, t, 880);
        this.tone(987.77, 0.12, "sine", 0.12, t + 0.06);
        break;
      case "whoosh":
        this.noise(0.18, 1200, 0.12, t, 0.7);
        this.tone(300, 0.16, "sine", 0.05, t, 900);
        break;
      case "reveal":
        // a rising sparkle as a caption is unveiled
        [523.25, 698.46, 880, 1174.66].forEach((f, i) => this.tone(f, 0.16, "sine", 0.12, t + i * 0.05));
        break;
      case "drumroll":
        for (let i = 0; i < 18; i++) this.noise(0.03, 260 + Math.random() * 120, 0.09, t + i * 0.05, 1.4);
        break;
      case "fanfare": {
        const a = [523.25, 659.25, 783.99];
        a.forEach((f, i) => this.tone(f, 0.14, "triangle", 0.2, t + i * 0.08));
        this.tone(1046.5, 0.4, "triangle", 0.24, t + 0.24);
        this.tone(1318.51, 0.4, "triangle", 0.18, t + 0.24);
        this.noise(0.05, 5200, 0.06, t + 0.24, 3);
        break;
      }
    }
  }
}

// Module-level singleton shared across the app.
export const sound = new SoundManager();
