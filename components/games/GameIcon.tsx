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
