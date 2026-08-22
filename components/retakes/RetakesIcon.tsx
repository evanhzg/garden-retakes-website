import React from "react";

/**
 * Matchmaking's own glyphs — roles, utility, round types, party actions, veto.
 *
 * Third set in the house, after `GameIcon` and `InventoryIcon`, and drawn to
 * their conventions so the three sit together: one default export, a switch on
 * an id, a 512 viewBox, `currentColor`, and internal detail cut out with
 * `fill-rule="evenodd"` so a glyph reads on any background — including the
 * team-tinted card backgrounds these mostly sit on.
 *
 * Hand-drawn rather than pulled from lucide for the reason the other two are:
 * nothing ships a molotov, a defuse kit, or "the player who holds the site",
 * and a role rail where two of five entries are real and three are a generic
 * circle reads worse than one with no icons at all. lucide stays in use for
 * genuinely generic actions — close, chevron, copy — which is the existing
 * rule of thumb and a good one.
 *
 * Blunt shapes on purpose. These are drawn at 18-20px in a rail and a bubble;
 * anything finer than a silhouette turns to mud at that size.
 */

type Props = { id: string; size?: number; className?: string; title?: string };

/** Rounded rectangle. */
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} z`;

/** Full circle as its own subpath — a hole when combined under evenodd. */
const ci = (cx: number, cy: number, r: number) =>
  `M${cx - r},${cy} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 z`;

/** A head-and-shoulders person, the unit every roster glyph is built from. */
const person = (cx: number, cy: number, s: number) =>
  `${ci(cx, cy - 62 * s, 46 * s)} M${cx - 78 * s},${cy + 96 * s} a${78 * s},${86 * s} 0 0 1 ${156 * s},0 z`;

export default function RetakesIcon({ id, size = 20, className, title }: Props) {
  const common: React.SVGProps<SVGSVGElement> = {
    viewBox: "0 0 512 512",
    width: size,
    height: size,
    fill: "currentColor",
    className,
    role: title ? "img" : "presentation",
    "aria-hidden": title ? undefined : true,
    "aria-label": title,
  };

  const label = title ? <title>{title}</title> : null;

  switch (id) {
    // ---------- the five retake roles ----------

    // SNIPER — a scope reticle. The ring is cut hollow so it never reads as a
    // filled dot at rail size.
    case "sniper":
      return (
        <svg {...common}>
          {label}
          <path fillRule="evenodd" d={`${ci(256, 256, 170)} ${ci(256, 256, 124)}`} />
          <path d={rr(240, 30, 32, 86, 10)} />
          <path d={rr(240, 396, 32, 86, 10)} />
          <path d={rr(30, 240, 86, 32, 10)} />
          <path d={rr(396, 240, 86, 32, 10)} />
          <path d={ci(256, 256, 30)} />
        </svg>
      );

    // LURKER — someone stood off the wall, away from the round.
    case "lurker":
      return (
        <svg {...common}>
          {label}
          <path d={rr(48, 52, 62, 408, 10)} />
          <path d={person(310, 190, 1.15)} />
        </svg>
      );

    // RIFLER — a person carrying, so it is not mistaken for the bare rifle the
    // full-buy round type uses.
    case "rifler":
      return (
        <svg {...common}>
          {label}
          <path d={ci(196, 118, 54)} />
          <path d="M108,300 a88,96 0 0 1 176,0 v150 h-176 z" />
          <path d={rr(200, 236, 268, 36, 10)} transform="rotate(-12 334 254)" />
          <path d={rr(286, 268, 44, 70, 8)} transform="rotate(-12 308 303)" />
        </svg>
      );

    // ANCHOR — holds the site. A shield, not a boat anchor: the word is a job,
    // and the nautical glyph tells a player nothing about it.
    case "anchor":
      return (
        <svg {...common}>
          {label}
          <path d="M256,44 l176,68 v140 c0,116 -78,186 -176,216 c-98,-30 -176,-100 -176,-216 v-140 z" />
        </svg>
      );

    // ROTATOR — the arrow round, with a notch cut for the head to sit in.
    case "rotator":
      return (
        <svg {...common}>
          {label}
          <path
            fillRule="evenodd"
            d={`${ci(256, 256, 168)} ${ci(256, 256, 110)} ${rr(256, 60, 130, 116, 0)}`}
          />
          <path d="M330,52 l112,66 l-112,66 z" />
        </svg>
      );

    // ---------- utility ----------

    // SMOKE — a bank of it, sat on the ground.
    case "smoke":
      return (
        <svg {...common}>
          {label}
          <path d={ci(170, 268, 84)} />
          <path d={ci(262, 224, 104)} />
          <path d={ci(352, 276, 76)} />
          <path d={rr(86, 288, 340, 74, 37)} />
        </svg>
      );

    // FLASH — the pop. A core and eight rays.
    case "flash":
      return (
        <svg {...common}>
          {label}
          <path d={ci(256, 256, 76)} />
          {[0, 45, 90, 135].map((deg) => (
            <React.Fragment key={deg}>
              <path d={rr(240, 26, 32, 92, 16)} transform={`rotate(${deg} 256 256)`} />
              <path d={rr(240, 394, 32, 92, 16)} transform={`rotate(${deg} 256 256)`} />
            </React.Fragment>
          ))}
        </svg>
      );

    // MOLOTOV — bottle, rag, flame. The incendiary is the same slot on CT; one
    // glyph covers both, as the preference does.
    //
    // The first draft was a narrow bottle with the flame sitting straight on
    // top of it, which is a candle. What makes it read as thrown is the rag: a
    // stub off the neck at an angle, with the flame on the end of that.
    case "molotov":
      return (
        <svg {...common}>
          {label}
          <path d={rr(178, 250, 156, 216, 30)} />
          <path d="M188,256 l38,-48 h60 l38,48 z" />
          <path d={rr(228, 158, 56, 56, 8)} />
          <path d={rr(272, 100, 96, 30, 15)} transform="rotate(-40 320 115)" />
          <path d="M394,24 c34,32 34,72 6,92 c-24,18 -60,6 -62,-24 c-2,-24 22,-32 34,-48 c10,-12 16,-12 22,-20 z" />
        </svg>
      );

    // HE — body, lever, pull ring cut out.
    case "he":
      return (
        <svg {...common}>
          {label}
          <path d={rr(146, 178, 200, 258, 90)} />
          <path d={rr(216, 122, 60, 70, 10)} />
          <path d={rr(268, 106, 150, 30, 14)} transform="rotate(-16 343 121)" />
          <path fillRule="evenodd" d={`${ci(412, 92, 50)} ${ci(412, 92, 24)}`} />
        </svg>
      );

    // ---------- gear ----------

    // KEVLAR — the vest. The front seam is cut out rather than drawn, because a
    // solid slab with a notch in the collar reads as a shirt or a box; the seam
    // is what says armour.
    case "kevlar":
      return (
        <svg {...common}>
          {label}
          <path
            fillRule="evenodd"
            d={`M158,64 h68 l30,52 l30,-52 h68 l70,58 v268 a34,34 0 0 1 -34,34 h-268 a34,34 0 0 1 -34,-34 v-268 z ${rr(244, 150, 24, 292, 12)}`}
          />
          <path d={rr(96, 208, 320, 26, 8)} />
        </svg>
      );

    // HELMET — dome and brim.
    case "helmet":
      return (
        <svg {...common}>
          {label}
          <path d="M92,290 a164,164 0 0 1 328,0 z" />
          <path d={rr(64, 292, 384, 58, 20)} />
        </svg>
      );

    // KIT — the defuse kit: a case with a cut wire through it.
    //
    // The snips were drawn as two crossed blades below the case, which at rail
    // size is a case with an X on it — and an X on a thing usually means you
    // cannot have it. The wire, cut out of the case with a visible gap where it
    // has been snipped, says defuse without any crossing lines.
    case "kit":
      return (
        <svg {...common}>
          {label}
          <path d={rr(206, 92, 100, 44, 12)} />
          <path
            fillRule="evenodd"
            d={`${rr(72, 132, 368, 288, 26)} ${rr(112, 244, 122, 26, 13)} ${rr(278, 244, 122, 26, 13)} ${ci(122, 328, 26)} ${ci(390, 328, 26)}`}
          />
        </svg>
      );

    // ---------- round types ----------
    //
    // Weapons, not coins. "Pistol round" and "full buy" are named after what
    // you are handed, and a player recognises the silhouette faster than they
    // read a tier.

    // PISTOL — slide, grip, trigger guard cut out.
    case "pistol":
      return (
        <svg {...common}>
          {label}
          <path d={rr(96, 168, 320, 62, 10)} />
          <path d="M182,230 l104,0 l-46,166 a26,26 0 0 1 -25,18 h-58 a20,20 0 0 1 -19,-26 z" />
          <path d={rr(96, 230, 58, 34, 8)} />
        </svg>
      );

    // FORCE — an SMG: short body, magazine forward, wire stock behind.
    case "force":
      return (
        <svg {...common}>
          {label}
          <path d={rr(112, 208, 288, 54, 10)} />
          <path d={rr(178, 262, 50, 108, 10)} />
          <path d={rr(72, 222, 46, 28, 8)} />
          <path d={rr(292, 262, 42, 56, 8)} />
        </svg>
      );

    // FULL — a rifle: long receiver, angled magazine, sight.
    case "full":
      return (
        <svg {...common}>
          {label}
          <path d={rr(48, 214, 416, 46, 8)} />
          <path d={rr(150, 260, 54, 100, 10)} transform="rotate(14 177 310)" />
          <path d={rr(48, 258, 66, 34, 8)} />
          <path d={rr(300, 172, 40, 42, 8)} />
        </svg>
      );

    // ---------- party and matchmaking ----------

    // PARTY — three of you.
    case "party":
      return (
        <svg {...common}>
          {label}
          <path d={person(256, 190, 1.0)} />
          <path d={person(104, 250, 0.74)} />
          <path d={person(408, 250, 0.74)} />
        </svg>
      );

    // INVITE — a person and a plus.
    case "invite":
      return (
        <svg {...common}>
          {label}
          <path d={person(196, 210, 1.05)} />
          <path d={rr(374, 216, 44, 168, 14)} />
          <path d={rr(312, 278, 168, 44, 14)} />
        </svg>
      );

    // KICK — a person and a cross.
    case "kick":
      return (
        <svg {...common}>
          {label}
          <path d={person(196, 210, 1.05)} />
          <path d={rr(374, 216, 44, 168, 14)} transform="rotate(45 396 300)" />
          <path d={rr(312, 278, 168, 44, 14)} transform="rotate(45 396 300)" />
        </svg>
      );

    // LEAVE — a door with the way out through it.
    case "leave":
      return (
        <svg {...common}>
          {label}
          <path
            fillRule="evenodd"
            d={`${rr(64, 64, 208, 384, 20)} ${rr(108, 108, 120, 296, 8)}`}
          />
          <path d={rr(238, 234, 168, 44, 12)} />
          <path d="M372,178 l96,78 l-96,78 z" />
        </svg>
      );

    // MATCHROOM — the board, split down the middle.
    case "matchroom":
      return (
        <svg {...common}>
          {label}
          <path
            fillRule="evenodd"
            d={`${rr(48, 96, 416, 300, 24)} ${rr(92, 140, 140, 212, 10)} ${rr(280, 140, 140, 212, 10)}`}
          />
          <path d={rr(242, 60, 28, 392, 12)} />
        </svg>
      );

    // CONNECT — a plug going in.
    case "connect":
      return (
        <svg {...common}>
          {label}
          <path d={rr(196, 44, 36, 112, 12)} />
          <path d={rr(280, 44, 36, 112, 12)} />
          <path d="M136,164 h240 v76 a120,120 0 0 1 -240,0 z" />
          <path d={rr(230, 348, 52, 120, 14)} />
        </svg>
      );

    // ---------- veto ----------

    // BAN — struck through.
    case "ban":
      return (
        <svg {...common}>
          {label}
          <path fillRule="evenodd" d={`${ci(256, 256, 196)} ${ci(256, 256, 144)}`} />
          <path d={rr(126, 230, 260, 52, 20)} transform="rotate(-45 256 256)" />
        </svg>
      );

    // PICK — taken.
    case "pick":
      return (
        <svg {...common}>
          {label}
          <path d="M198,394 l-136,-136 l52,-52 l84,84 l188,-188 l52,52 z" />
        </svg>
      );

    // ---------- modes ----------

    // PREMIUM — a crown.
    case "premium":
      return (
        <svg {...common}>
          {label}
          <path d="M48,146 l96,80 l112,-140 l112,140 l96,-80 l-42,242 h-332 z" />
          <path d={rr(80, 406, 352, 52, 14)} />
        </svg>
      );

    // TESTING — a bot, because that is what the mode hands you.
    case "testing":
      return (
        <svg {...common}>
          {label}
          <path d={rr(242, 40, 28, 68, 12)} />
          <path d={ci(256, 34, 34)} />
          <path
            fillRule="evenodd"
            d={`${rr(70, 108, 372, 300, 44)} ${ci(176, 232, 44)} ${ci(336, 232, 44)} ${rr(186, 318, 140, 34, 16)}`}
          />
          <path d={rr(20, 190, 40, 128, 18)} />
          <path d={rr(452, 190, 40, 128, 18)} />
        </svg>
      );

    // ---------- rail tabs ----------

    // PLAY — go.
    case "play":
      return (
        <svg {...common}>
          {label}
          <path d="M148,74 l290,182 l-290,182 z" />
        </svg>
      );

    // LOADOUT — the two guns you are handed, stacked.
    //
    // A backpack was the first draft and it reads as a padlock at rail size:
    // rounded body, handle on top, clasp in the middle. Weapons say loadout on
    // a site about weapons, and they cannot be mistaken for a lock.
    case "loadout":
      return (
        <svg {...common}>
          {label}
          <path d={rr(48, 124, 416, 42, 8)} />
          <path d={rr(146, 166, 48, 88, 10)} transform="rotate(14 170 210)" />
          <path d={rr(48, 166, 60, 30, 8)} />
          <path d={rr(300, 86, 38, 38, 8)} />
          <path d={rr(126, 306, 260, 52, 9)} />
          <path d="M204,358 l92,0 l-40,108 a24,24 0 0 1 -23,16 h-42 a18,18 0 0 1 -17,-24 z" />
          <path d={rr(126, 358, 52, 30, 8)} />
        </svg>
      );

    // MAPS — folded.
    case "maps":
      return (
        <svg {...common}>
          {label}
          <path d="M28,116 l134,-56 v336 l-134,56 z" />
          <path d="M190,60 l132,56 v336 l-132,-56 z" />
          <path d="M350,116 l134,-56 v336 l-134,56 z" />
        </svg>
      );

    // MATCHES — what you have played.
    case "matches":
      return (
        <svg {...common}>
          {label}
          <path d="M156,52 h200 v134 a100,100 0 0 1 -200,0 z" />
          <path
            fillRule="evenodd"
            d={`${rr(76, 66, 76, 132, 30)} ${rr(102, 96, 26, 72, 13)}`}
          />
          <path
            fillRule="evenodd"
            d={`${rr(360, 66, 76, 132, 30)} ${rr(384, 96, 26, 72, 13)}`}
          />
          <path d={rr(232, 286, 48, 90, 8)} />
          <path d={rr(150, 376, 212, 44, 14)} />
          <path d={rr(122, 420, 268, 44, 14)} />
        </svg>
      );

    // LIVE — the recording indicator: a dot inside a ring. Broadcast arcs were
    // the first draft and they close up into a blob below about 24px, which is
    // every size this is actually drawn at.
    case "live":
      return (
        <svg {...common}>
          {label}
          <path d={ci(256, 256, 84)} />
          <path fillRule="evenodd" d={`${ci(256, 256, 186)} ${ci(256, 256, 144)}`} />
        </svg>
      );

    default:
      return null;
  }
}
