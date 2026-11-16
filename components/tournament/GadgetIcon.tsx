"use client";

import { useId, type SVGProps } from "react";

// The Blitz gadget icons: filled silhouettes in the style of CS2's own weapon icons,
// on a 32 grid. GENERATED from the plugin repo's blitz_kit/icons/gadgets.json by
// blitz_kit/generators/gadget_icon_tsx.py — change a drawing there, not here; the game
// renders the same glyphs to its HUD icons (generators/icons.py).
//
// Each glyph is a mask: `fill` is the silhouette, `cut` the holes in it (rims, straps,
// a lens, the tower's screen), `back` what is drawn again inside a hole. The colour is
// currentColor, so an icon takes its surroundings' text colour like lucide's do.
// Ids are the wire ids of lib/tournament/roles.ts GADGETS, plus "tower".

type Glyph = { fill: string; cut?: string; back?: string };

const GLYPHS: Record<string, Glyph> = {
  oil: {
    fill: "<rect x=\"4\" y=\"4\" width=\"15\" height=\"22\" rx=\"2.6\"/><path d=\"M25.5 9.5c-2.1 3-3.6 5.1-3.6 7.1a3.6 3.6 0 0 0 7.2 0c0-2-1.5-4.1-3.6-7.1z\"/><ellipse cx=\"18.5\" cy=\"28.7\" rx=\"12\" ry=\"1.9\"/>",
    cut: "<rect x=\"2\" y=\"10.2\" width=\"19\" height=\"1.5\"/><rect x=\"2\" y=\"18.6\" width=\"19\" height=\"1.5\"/><circle cx=\"15.2\" cy=\"6.8\" r=\"1.1\"/><rect x=\"6.2\" y=\"12.8\" width=\"1.3\" height=\"4.6\" rx=\".65\"/>",
  },
  trap: {
    fill: "<rect x=\"3\" y=\"12\" width=\"17\" height=\"13\" rx=\"1.8\"/><path d=\"M18.5 12.5c1.5-4 4.5-6.5 8-6.5\" fill=\"none\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M24.6 15.2l-3.1 5.2h2.6l-1.4 5.2 4.8-6.6h-2.7l1.9-3.8z\"/><path d=\"M20 22.5h10\" fill=\"none\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-dasharray=\"2 1.6\"/>",
    cut: "<rect x=\"1\" y=\"15.6\" width=\"21\" height=\"1.3\"/><circle cx=\"7.4\" cy=\"20.8\" r=\"1.7\"/><rect x=\"11\" y=\"19.6\" width=\"6.5\" height=\"2.4\" rx=\".6\"/>",
  },
  breach: {
    fill: "<rect x=\"2.5\" y=\"12\" width=\"24\" height=\"13\" rx=\"2\"/><rect x=\"11.5\" y=\"6.5\" width=\"8\" height=\"6.5\" rx=\"1.2\"/><rect x=\"17.6\" y=\"1.6\" width=\"1.3\" height=\"5.6\" rx=\".65\"/><rect x=\"28.5\" y=\"4\" width=\"2\" height=\"25\" rx=\".5\"/>",
    cut: "<rect x=\"7.2\" y=\"10\" width=\"2\" height=\"17\"/><rect x=\"20.2\" y=\"10\" width=\"2\" height=\"17\"/><circle cx=\"15.5\" cy=\"9.7\" r=\"1.3\"/><rect x=\"11\" y=\"16.6\" width=\"7.6\" height=\"3.8\" rx=\".8\"/>",
  },
  co2: {
    fill: "<path d=\"M9 14.5a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5V27a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z\"/><rect x=\"12.6\" y=\"5.6\" width=\"3.8\" height=\"5\" rx=\".8\"/><rect x=\"9.5\" y=\"3.4\" width=\"11.5\" height=\"2.2\" rx=\"1.1\" transform=\"rotate(-10 15 4.5)\"/><path d=\"M16.4 7.4c4.5 0 8 1.2 8.6 5.6\" fill=\"none\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"26.8\" cy=\"17.2\" r=\"2.4\"/><circle cx=\"29.4\" cy=\"13.6\" r=\"1.6\"/><circle cx=\"29.6\" cy=\"20.4\" r=\"1.4\"/>",
    cut: "<rect x=\"7\" y=\"18\" width=\"15\" height=\"4.2\"/><path d=\"M14.5 19.1v2M13.4 19.6l2.2 1M13.4 21.1l2.2-1\" stroke-width=\".7\" fill=\"none\"/>",
  },
  sensor: {
    fill: "<rect x=\"9.5\" y=\"9.5\" width=\"13\" height=\"9.5\" rx=\"2.6\"/><path d=\"M16 18.5L10 29M16 18.5l6 10.5M16 18.5V29\" fill=\"none\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M25.2 9.2a7.2 7.2 0 0 1 0 10.1M28.4 6a11.6 11.6 0 0 1 0 16.5\" fill=\"none\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M6.8 9.2a7.2 7.2 0 0 0 0 10.1M3.6 6a11.6 11.6 0 0 0 0 16.5\" fill=\"none\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
    cut: "<circle cx=\"16\" cy=\"14.2\" r=\"3.1\"/>",
    back: "<circle cx=\"16\" cy=\"14.2\" r=\"1.4\"/>",
  },
  tower: {
    fill: "<rect x=\"8.5\" y=\"21.5\" width=\"15\" height=\"8\" rx=\"1.6\"/><rect x=\"15\" y=\"6\" width=\"2\" height=\"16\"/><rect x=\"11\" y=\"9\" width=\"10\" height=\"1.5\" rx=\".5\"/><rect x=\"12\" y=\"13.2\" width=\"8\" height=\"1.5\" rx=\".5\"/><circle cx=\"16\" cy=\"4.6\" r=\"2.3\"/><path d=\"M22.3 2.4a6.4 6.4 0 0 1 0 8.8M9.7 2.4a6.4 6.4 0 0 0 0 8.8\" fill=\"none\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
    cut: "<rect x=\"11.5\" y=\"23.6\" width=\"9\" height=\"3.6\" rx=\".6\"/>",
  },
};

export const hasGadgetIcon = (id: string | null | undefined): boolean => !!id && id in GLYPHS;

export default function GadgetIcon({
  id,
  size = 16,
  title,
  ...rest
}: { id: string; size?: number; title?: string } & Omit<SVGProps<SVGSVGElement>, "id">) {
  // One mask per drawn icon: a shared id would break wherever its first copy is hidden.
  const mask = `bkg${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const glyph = GLYPHS[id];
  if (!glyph) return null;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title && <title>{title}</title>}
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
          {/* Static drawings from the generator above, never user input. */}
          <g fill="#fff" stroke="#fff" dangerouslySetInnerHTML={{ __html: glyph.fill }} />
          <g fill="#000" stroke="#000" dangerouslySetInnerHTML={{ __html: glyph.cut ?? "" }} />
          <g fill="#fff" stroke="#fff" dangerouslySetInnerHTML={{ __html: glyph.back ?? "" }} />
        </mask>
      </defs>
      <rect width="32" height="32" fill="currentColor" mask={`url(#${mask})`} />
    </svg>
  );
}
