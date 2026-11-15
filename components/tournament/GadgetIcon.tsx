import type { SVGProps } from "react";

// The Blitz role upgrades' marks.
//
// Drawn to sit with lucide — 24px grid, stroke 2, round caps, currentColor — so a
// gadget next to its role's lucide icon reads as one set. The same paths are the
// in-game icons: the blitz_kit addon renders them to white PNGs from
// R5e-games' blitz_kit/icons/gadgets.json, which is where to change a drawing
// (then copy the path here). Ids are the wire ids of lib/tournament/roles.ts
// GADGETS.

const PATHS: Record<string, JSX.Element> = {
  oil: (
    <>
      <ellipse cx="9" cy="5" rx="5" ry="2" />
      <path d="M4 5v13c0 1.1 2.24 2 5 2s5-.9 5-2V5" />
      <path d="M4 11.5c0 1.1 2.24 2 5 2s5-.9 5-2" />
      <path d="M19.5 10.5c-1.3 1.7-2.2 3-2.2 4.1a2.2 2.2 0 0 0 4.4 0c0-1.1-.9-2.4-2.2-4.1z" />
    </>
  ),
  trap: (
    <>
      <rect x="2.5" y="10" width="11" height="9" rx="1.5" />
      <path d="M6 10V8.5A1.5 1.5 0 0 1 7.5 7h1A1.5 1.5 0 0 1 10 8.5V10" />
      <circle cx="8" cy="14.5" r="1.5" />
      <path d="M13.5 14.5H16l1.5-3 1.5 6 1.5-3h1" />
    </>
  ),
  breach: (
    <>
      <path d="M21 3v18" />
      <rect x="10" y="8" width="9" height="8" rx="1.5" />
      <circle cx="14.5" cy="12" r="1" />
      <path d="M7 12H3" />
      <path d="m7.5 8.5-3-2.5" />
      <path d="m7.5 15.5-3 2.5" />
    </>
  ),
  co2: (
    <>
      <rect x="7" y="9" width="8" height="12" rx="2" />
      <path d="M11 9V6" />
      <path d="M8.5 6h5l3.5-2.5" />
      <path d="M9 3.5h3" />
      <circle cx="19.5" cy="6.5" r="1" />
      <circle cx="21" cy="10" r="1" />
      <circle cx="18.5" cy="11.5" r="1" />
    </>
  ),
  sensor: (
    <>
      <rect x="8" y="14" width="8" height="7" rx="1.5" />
      <path d="M12 14v-2" />
      <path d="M8.5 8.5a5 5 0 0 1 7 0" />
      <path d="M5.5 5.5a9.2 9.2 0 0 1 13 0" />
      <circle cx="12" cy="17.5" r="1" />
    </>
  ),
};

export const hasGadgetIcon = (id: string | null | undefined): boolean => !!id && id in PATHS;

export default function GadgetIcon({
  id,
  size = 16,
  title,
  ...rest
}: { id: string; size?: number; title?: string } & Omit<SVGProps<SVGSVGElement>, "id">) {
  const paths = PATHS[id];
  if (!paths) return null;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title && <title>{title}</title>}
      {paths}
    </svg>
  );
}
