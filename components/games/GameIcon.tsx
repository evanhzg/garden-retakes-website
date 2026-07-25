import React from "react";

// Custom, FontAwesome-style solid glyphs for each game (Font Awesome doesn't
// ship free icons for these). Single-colour via `currentColor`; internal detail
// is cut out with fill-rule="evenodd" so it reads on any background.

type Props = { id: string; size?: number; className?: string; title?: string };

// rounded-rect path
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} z`;
// full circle subpath (hole when combined under evenodd)
const ci = (cx: number, cy: number, r: number) =>
  `M${cx - r},${cy} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 z`;

export default function GameIcon({ id, size = 28, className, title }: Props) {
  const common: any = {
    viewBox: "0 0 512 512",
    width: size,
    height: size,
    fill: "currentColor",
    className,
    role: title ? "img" : "presentation",
    "aria-hidden": title ? undefined : true,
    "aria-label": title,
  };

  switch (id) {
    // MONOPOLY — top hat
    case "monopoly":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <ellipse cx="256" cy="356" rx="198" ry="42" />
          <path fillRule="evenodd" d={`${rr(178, 104, 156, 250, 22)} ${rr(178, 268, 156, 34, 6)}`} />
        </svg>
      );

    // OUNO — two overlapping cards, front with an "O"
    case "uno":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <g transform="rotate(-12 256 260)">
            <path d={rr(150, 128, 150, 224, 22)} />
          </g>
          <g transform="rotate(10 256 252)">
            <path fillRule="evenodd" d={`${rr(214, 150, 150, 224, 22)} ${ci(289, 262, 46)} ${ci(289, 262, 20)}`} />
          </g>
        </svg>
      );

    // SKRIBBL — a pencil
    case "skribbl":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <g transform="rotate(45 256 256)">
            {/* eraser cap */}
            <path d={rr(212, 92, 88, 40, 10)} />
            {/* body */}
            <rect x="216" y="136" width="80" height="232" />
            {/* sharpened tip */}
            <polygon points="216,368 296,368 256,452" />
          </g>
        </svg>
      );

    // HASAMEME — framed image with a caption bar
    case "meme":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path
            fillRule="evenodd"
            d={`${rr(72, 96, 368, 320, 34)} ${rr(112, 136, 288, 176, 14)} ${rr(150, 344, 212, 26, 13)}`}
          />
          {/* little picture inside the window */}
          <circle cx="180" cy="196" r="24" />
          <path d="M124 296 L204 216 L260 268 L316 200 L388 296 Z" />
        </svg>
      );

    // CODENAMES — magnifying glass over a grid
    case "codenames":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path
            fillRule="evenodd"
            d={`${ci(214, 214, 150)} ${ci(214, 214, 104)}`}
          />
          {/* 2x2 agent grid inside the lens */}
          <g>
            <circle cx="182" cy="182" r="20" />
            <circle cx="246" cy="182" r="20" />
            <circle cx="182" cy="246" r="20" />
            <circle cx="246" cy="246" r="20" />
          </g>
          {/* handle */}
          <path d={rr(300, 322, 150, 60, 30)} transform="rotate(45 330 352)" />
        </svg>
      );

    // HEADSHOT — a crosshair over a target ring
    case "headshot":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path fillRule="evenodd" d={`${ci(256, 256, 168)} ${ci(256, 256, 122)}`} />
          <circle cx="256" cy="256" r="44" />
          {/* the four ticks */}
          <path d={rr(238, 24, 36, 108, 18)} />
          <path d={rr(238, 380, 36, 108, 18)} />
          <path d={rr(24, 238, 108, 36, 18)} />
          <path d={rr(380, 238, 108, 36, 18)} />
        </svg>
      );

    // BUY MENU — a price tag
    case "buymenu":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path
            fillRule="evenodd"
            d="M256 46 L466 46 L466 256 L266 456 L56 246 Z M396 116 a34 34 0 1 0 0.1 0 z"
          />
        </svg>
      );

    // PENTAKILL — a five-pointed star (the pentakill banner)
    case "pentakill":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path d="M256 40 L317 186 L474 199 L355 303 L391 456 L256 374 L121 456 L157 303 L38 199 L195 186 Z" />
        </svg>
      );

    // BUILD PATH — three stacked item slots joined by a path
    case "buildpath":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path fillRule="evenodd" d={`${rr(56, 56, 130, 130, 24)} ${rr(96, 96, 50, 50, 10)}`} />
          <path fillRule="evenodd" d={`${rr(326, 56, 130, 130, 24)} ${rr(366, 96, 50, 50, 10)}`} />
          <path fillRule="evenodd" d={`${rr(191, 326, 130, 130, 24)} ${rr(231, 366, 50, 50, 10)}`} />
          {/* the two branches feeding the finished item */}
          <path d="M121 200 L121 250 L391 250 L391 200 L361 200 L361 220 L151 220 L151 200 Z" />
          <rect x="241" y="250" width="30" height="66" />
        </svg>
      );

    // DROPSHIP — a descending drop pod with thrusters
    case "dropship":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path d="M256 32 L392 168 L392 300 L120 300 L120 168 Z" />
          <path fillRule="evenodd" d={`${rr(120, 320, 272, 56, 20)} ${ci(256, 348, 18)}`} />
          <path d="M170 396 L200 396 L186 480 Z" />
          <path d="M241 396 L271 396 L256 490 Z" />
          <path d="M312 396 L342 396 L326 480 Z" />
        </svg>
      );

    // LOADOUT — a backpack / kit bag
    case "loadout":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path
            fillRule="evenodd"
            d={`${rr(86, 140, 340, 320, 52)} ${rr(146, 250, 220, 90, 18)}`}
          />
          {/* the carry handle */}
          <path d="M196 140 a60 60 0 0 1 120 0 l-44 0 a16 16 0 0 0 -32 0 z" />
        </svg>
      );

    // CARDS AGAINST — a card with fill-in-the-blank lines
    case "cah":
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path
            fillRule="evenodd"
            d={`${rr(120, 72, 272, 368, 30)} ${rr(160, 150, 192, 22, 11)} ${rr(160, 212, 192, 22, 11)} ${rr(160, 274, 120, 22, 11)}`}
          />
        </svg>
      );

    default:
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path d={rr(96, 96, 320, 320, 40)} />
        </svg>
      );
  }
}
