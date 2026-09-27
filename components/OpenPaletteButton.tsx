"use client";

import { Search } from "lucide-react";
import { OPEN_PALETTE } from "./CommandPalette";

/** A button that opens the command palette — for server pages that cannot hold a handler. */
export default function OpenPaletteButton({ label, className = "btn btn-primary" }: { label: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE))}>
      <Search size={16} /> {label}
      <kbd className="sys-kbd">Ctrl K</kbd>
    </button>
  );
}
