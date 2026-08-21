import React from "react";

/**
 * The inventory's own glyphs — weapon categories and the actions in the bar.
 *
 * Drawn here rather than pulled from an icon set for the same reason
 * `GameIcon` is: nothing ships a MAG-7 or a "charm on a keyring", and a
 * category rail where two of nine entries are a generic box and the rest are
 * real silhouettes reads worse than one with no icons at all. These are
 * deliberately blunt side-on shapes — at 20 px a receiver and a magazine is all
 * that survives, and anything finer turns to mud.
 *
 * Conventions are `GameIcon`'s, so the two sets sit together: one default
 * export, a switch on an id, a 512 viewBox, `currentColor`, and internal detail
 * cut out with `fill-rule="evenodd"` so a glyph reads on any background.
 *
 * The category ids are the `CATEGORY_ORDER` strings from InventorySimulator,
 * lowercased and despaced, so a caller never has to keep a second mapping.
 */

type Props = { id: string; size?: number; className?: string; title?: string };

/** Rounded rectangle. */
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} z`;

/** Full circle as its own subpath — a hole when combined under evenodd. */
const ci = (cx: number, cy: number, r: number) =>
  `M${cx - r},${cy} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 z`;

/** The barrel-and-receiver body every gun glyph is built from. */
const receiver = (x: number, y: number, w: number, h: number) => rr(x, y, w, h, 8);

export default function InventoryIcon({ id, size = 20, className, title }: Props) {
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
    // ---------- weapon categories ----------

    // RIFLES — long receiver, angled magazine, stock.
    case "rifles":
      return (
        <svg {...common}>
          {label}
          <path d={receiver(56, 214, 400, 46)} />
          <path d={rr(150, 260, 54, 96, 10)} transform="rotate(14 177 308)" />
          <path d={rr(56, 258, 66, 34, 8)} />
          <path d={rr(300, 176, 40, 40, 8)} />
        </svg>
      );

    // SNIPERS — same body, long scope above it, bipod below.
    case "snipers":
      return (
        <svg {...common}>
          {label}
          <path d={receiver(40, 226, 432, 40)} />
          <path d={rr(168, 158, 196, 44, 20)} />
          <path d={rr(232, 202, 12, 26, 4)} />
          <path d={rr(120, 266, 42, 30, 8)} />
          <path d="M330,266 l14,0 l40,86 l-18,0 z" />
          <path d="M368,266 l14,0 l-6,86 l-18,0 z" />
        </svg>
      );

    // SMGs — short body, magazine well forward, wire stock behind.
    //
    // The magazine used to hang from the middle of a thin bar, which read as a
    // mallet rather than a gun. Forward of centre with a stock behind it is what
    // makes the silhouette point somewhere.
    case "smgs":
      return (
        <svg {...common}>
          {label}
          <path d={receiver(128, 196, 272, 62)} />
          <path d={rr(150, 258, 52, 118, 10)} transform="rotate(-6 176 317)" />
          <path d={rr(258, 258, 42, 74, 10)} />
          <path d={rr(60, 210, 74, 26, 10)} />
          <path d={rr(60, 210, 26, 74, 10)} />
        </svg>
      );

    // PISTOLS — slide over a grip, trigger guard cut out.
    case "pistols":
      return (
        <svg {...common}>
          {label}
          <path d={rr(96, 172, 320, 62, 10)} />
          <path
            fillRule="evenodd"
            d={`${rr(150, 234, 92, 150, 12)} M182,262 h30 v58 h-30 z`}
            transform="rotate(12 196 308)"
          />
          <path d={rr(96, 234, 46, 26, 6)} />
        </svg>
      );

    // HEAVY — shotgun with a drum, the shape a MAG-7 or Negev reads as.
    case "heavy":
      return (
        <svg {...common}>
          {label}
          <path d={receiver(64, 200, 384, 44)} />
          <path fillRule="evenodd" d={`${ci(196, 300, 74)} ${ci(196, 300, 26)}`} />
          <path d={rr(64, 244, 60, 32, 8)} />
          <path d={rr(340, 244, 44, 60, 8)} />
        </svg>
      );

    // KNIVES — a solid blade, a guard, a handle.
    //
    // Drawn as a filled wedge rather than a swept outline: the outline version
    // thinned to a diagonal stroke at rail size and read as a slash mark. A
    // knife is recognised by its silhouette, so the silhouette is the whole
    // glyph.
    case "knives":
      return (
        <svg {...common}>
          {label}
          <path d="M64,340 L300,104 l52,52 c-64,58 -140,124 -226,206 a26,26 0 0 1 -36,-4 l-24,-24 a6,6 0 0 1 -2,4 z" />
          <path d={rr(292, 92, 30, 96, 8)} transform="rotate(45 307 140)" />
          <path d={rr(340, 120, 120, 40, 16)} transform="rotate(45 400 140)" />
        </svg>
      );

    // GLOVES — four fingers, a thumb held off to one side, a cuff.
    //
    // The thumb has to be a separate shape with daylight around it. Tucked
    // against the mitt it merged into one rounded rectangle, and the glyph read
    // as a blank card.
    case "gloves":
      return (
        <svg {...common}>
          {label}
          <path d={rr(184, 96, 46, 172, 22)} />
          <path d={rr(238, 84, 46, 184, 22)} />
          <path d={rr(292, 104, 46, 164, 22)} />
          <path d="M184,236 h154 v78 a76,76 0 0 1 -76,76 h-2 a76,76 0 0 1 -76,-76 z" />
          <path d="M150,206 a40,40 0 0 0 -40,40 l0,26 a40,40 0 0 0 62,34 l0,-100 z" />
          <path d={rr(176, 386, 170, 46, 14)} />
        </svg>
      );

    // AGENTS — head and shoulders.
    case "agents":
      return (
        <svg {...common}>
          {label}
          <path d={ci(256, 176, 78)} />
          <path d="M108,412 a148,148 0 0 1 296,0 a20,20 0 0 1 -20,20 h-256 a20,20 0 0 1 -20,-20 z" />
        </svg>
      );

    // MUSIC KITS — two beamed notes.
    case "musickits":
      return (
        <svg {...common}>
          {label}
          <path d="M212,110 l188,-44 v56 l-188,44 z" />
          <path d={rr(212, 110, 22, 232, 6)} />
          <path d={rr(378, 66, 22, 232, 6)} />
          <path d={ci(178, 342, 52)} />
          <path d={ci(344, 298, 52)} />
        </svg>
      );

    // Every type at once — the rail's first entry.
    case "alltypes":
      return (
        <svg {...common}>
          {label}
          <path d={rr(74, 74, 158, 158, 18)} />
          <path d={rr(280, 74, 158, 158, 18)} />
          <path d={rr(74, 280, 158, 158, 18)} />
          <path d={rr(280, 280, 158, 158, 18)} />
        </svg>
      );

    // ---------- actions ----------

    // EQUIP IN-GAME — a screen with a tick.
    case "equip":
      return (
        <svg {...common}>
          {label}
          <path fillRule="evenodd" d={`${rr(52, 96, 408, 268, 24)} ${rr(96, 140, 320, 180, 8)}`} />
          <path d="M180,232 l44,44 l108,-108 l34,34 l-142,142 l-78,-78 z" />
          <path d={rr(180, 392, 152, 32, 14)} />
        </svg>
      );

    // SHARE — two nodes joined to a third.
    case "share":
      return (
        <svg {...common}>
          {label}
          <path d={rr(150, 240, 212, 32, 16)} transform="rotate(-30 256 256)" />
          <path d={rr(150, 240, 212, 32, 16)} transform="rotate(30 256 256)" />
          <path d={ci(374, 120, 62)} />
          <path d={ci(374, 392, 62)} />
          <path d={ci(138, 256, 62)} />
        </svg>
      );

    // IMPORT — an arrow coming down into a tray.
    case "import":
      return (
        <svg {...common}>
          {label}
          <path d={rr(238, 72, 36, 176, 12)} />
          <path d="M170,222 l86,90 l86,-90 l-42,-40 l-44,46 l-44,-46 z" />
          <path d="M84,306 h58 v56 h228 v-56 h58 v92 a24,24 0 0 1 -24,24 h-296 a24,24 0 0 1 -24,-24 z" />
        </svg>
      );

    // VAULT / crafts — a chest: domed lid, banded body, clasp cut out.
    case "vault":
      return (
        <svg {...common}>
          {label}
          <path d="M76,208 a180,120 0 0 1 360,0 v20 h-360 z" />
          <path
            fillRule="evenodd"
            d={`${rr(76, 240, 360, 184, 18)} ${rr(226, 286, 60, 76, 14)}`}
          />
          <path d={rr(76, 240, 360, 26, 6)} />
        </svg>
      );

    // RANDOM — the shuffle arrows.
    case "random":
      return (
        <svg {...common}>
          {label}
          <path d="M64,168 h84 c62,0 84,176 146,176 h68 v46 h-68 c-96,0 -110,-176 -146,-176 h-84 z" />
          <path d="M64,298 h84 c26,0 44,-32 60,-70 l38,26 c-20,46 -46,90 -98,90 h-84 z" />
          <path d="M282,150 c26,-30 52,-46 92,-46 h68 v46 h-68 c-22,0 -38,10 -54,28 z" />
          <path d="M406,72 l72,55 l-72,55 z" />
          <path d="M406,312 l72,55 l-72,55 z" />
        </svg>
      );

    // EDIT — a sticker with the corner genuinely cut away, plus a spark.
    //
    // The peel used to be drawn as a translucent overlay, which a single-colour
    // glyph cannot show: it composited to the same solid square and the icon
    // became a blank tile. Cut out instead of shaded.
    case "edit":
      return (
        <svg {...common}>
          {label}
          <path d="M96,132 a30,30 0 0 1 30,-30 h216 a30,30 0 0 1 30,30 v168 l-104,104 h-142 a30,30 0 0 1 -30,-30 z" />
          <path d="M290,404 l82,-82 h-58 a24,24 0 0 0 -24,24 z" />
          <path d="M404,96 l16,44 l44,16 l-44,16 l-16,44 l-16,-44 l-44,-16 l44,-16 z" />
        </svg>
      );

    // FAVOURITE — a star.
    case "star":
      return (
        <svg {...common}>
          {label}
          <path d="M256,64 l58,118 l130,19 l-94,92 l22,130 l-116,-61 l-116,61 l22,-130 l-94,-92 l130,-19 z" />
        </svg>
      );

    // DUPLICATE — two stacked cards.
    case "duplicate":
      return (
        <svg {...common}>
          {label}
          <path d={rr(72, 72, 250, 250, 24)} />
          <path fillRule="evenodd" d={`${rr(190, 190, 250, 250, 24)} ${rr(228, 228, 174, 174, 10)}`} />
        </svg>
      );

    // DELETE — a bin.
    case "delete":
      return (
        <svg {...common}>
          {label}
          <path d={rr(92, 116, 328, 46, 14)} />
          <path d={rr(196, 64, 120, 40, 12)} />
          <path
            fillRule="evenodd"
            d={`${rr(124, 178, 264, 262, 22)} ${rr(178, 218, 36, 182, 8)} ${rr(238, 218, 36, 182, 8)} ${rr(298, 218, 36, 182, 8)}`}
          />
        </svg>
      );

    // RENAME — a pencil.
    case "rename":
      return (
        <svg {...common}>
          {label}
          <path d="M366,58 l88,88 l-52,52 l-88,-88 z" />
          <path d="M118,306 l196,-196 l88,88 l-196,196 z" />
          <path d="M96,330 l86,86 l-114,28 z" />
        </svg>
      );

    // CLOSE — an x.
    case "close":
      return (
        <svg {...common}>
          {label}
          <path d={rr(150, 240, 212, 32, 16)} transform="rotate(45 256 256)" />
          <path d={rr(150, 240, 212, 32, 16)} transform="rotate(-45 256 256)" />
        </svg>
      );

    default:
      return null;
  }
}

/** `CATEGORY_ORDER` string to icon id, so callers keep no second mapping. */
export const categoryIconId = (category: string) =>
  category.toLowerCase().replace(/[^a-z]/g, "");
