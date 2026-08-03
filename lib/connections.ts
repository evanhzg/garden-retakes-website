// Profile connections: who a player is elsewhere.
//
// Isomorphic — the editor renders the same list the public bar does, so a
// provider cannot exist in one and not the other.
//
// Steam, Discord and FACEIT are already known to us; the rest are typed in.
// Both kinds live in one list because from the reader's side they are the same
// thing, and splitting them would put "show my FACEIT" in a different place
// from "here is my YouTube".

export type ProviderId = "steam" | "faceit" | "discord" | "x" | "youtube" | "instagram";

export type Provider = {
  id: ProviderId;
  label: string;
  /** Brand colour, used for the chip's tint. */
  colour: string;
  /** We already know this one; the player only chooses whether to show it. */
  derived: boolean;
  /** Turns a handle into a URL. Derived providers build theirs elsewhere. */
  url?: (handle: string) => string;
  placeholder?: string;
};

export const PROVIDERS: Provider[] = [
  { id: "steam", label: "Steam", colour: "#66c0f4", derived: true },
  { id: "faceit", label: "FACEIT", colour: "#ff5500", derived: true },
  { id: "discord", label: "Discord", colour: "#5865f2", derived: true },
  {
    id: "x",
    label: "X",
    colour: "#d9d9d9",
    derived: false,
    url: (h) => `https://x.com/${h.replace(/^@/, "")}`,
    placeholder: "@handle",
  },
  {
    id: "youtube",
    label: "YouTube",
    colour: "#ff0033",
    derived: false,
    url: (h) => (/^https?:/i.test(h) ? h : `https://youtube.com/@${h.replace(/^@/, "")}`),
    placeholder: "@channel or full link",
  },
  {
    id: "instagram",
    label: "Instagram",
    colour: "#e1306c",
    derived: false,
    url: (h) => `https://instagram.com/${h.replace(/^@/, "")}`,
    placeholder: "@handle",
  },
];

export const providerById = (id: string): Provider | undefined => PROVIDERS.find((p) => p.id === id);

export const isProvider = (id: string): id is ProviderId => PROVIDERS.some((p) => p.id === id);

export type Connection = {
  provider: ProviderId;
  handle: string;
  public: boolean;
  /** Resolved link, when there is one to open. */
  href?: string | null;
};

/**
 * Brand marks as inline paths, on a 24x24 grid.
 *
 * Inline rather than an icon font or remote SVGs: these render inside a strict
 * CSP with no external requests, and six paths is less weight than any library.
 * They are drawn in the brand colour at low opacity behind the label, so the
 * bar reads as one set of chips rather than six competing logos.
 */
export const PROVIDER_PATHS: Record<ProviderId, string> = {
  // Valve's own outline: two rings and the tail, which stays legible at 14px
  // and on either ground. The filled blob it replaced closed up at this size.
  steam:
    "M11.98 2C6.7 2 2.36 6.03 1.86 11.18l5.4 2.23a3.04 3.04 0 0 1 1.72-.53l2.4-3.48v-.05a4.06 4.06 0 1 1 4.06 4.06h-.1l-3.42 2.44v.13a3.05 3.05 0 0 1-6.09.13L1.9 14.5A10.1 10.1 0 1 0 11.98 2Zm-5.1 15.2.86.35a2.3 2.3 0 0 0 3-1.24 2.3 2.3 0 0 0-1.24-3l-.9-.37a2.3 2.3 0 0 1 1.55 4.32 2.3 2.3 0 0 1-3.27-.06Zm11.83-8.09a2.7 2.7 0 1 1-5.41 0 2.7 2.7 0 0 1 5.41 0Zm-4.74 0a2.04 2.04 0 1 0 4.08 0 2.04 2.04 0 0 0-4.08 0Z",
  faceit: "M21.6 2.4 12.9 11.6h8.7v2.2H2.4v-.2l9.1-11.2h3.2l-6.9 8.5h4.4L19.4 1l2.2 1.4ZM2.4 19.6h19.2v2.2H2.4v-2.2Z",
  discord:
    "M19.3 5.4A16 16 0 0 0 15.4 4l-.3.5a12 12 0 0 1 3.4 1.7 12.6 12.6 0 0 0-10.9 0A12 12 0 0 1 11 4.5L8.6 4a16 16 0 0 0-3.9 1.4C2.2 9.1 1.5 12.7 1.9 16.3a16 16 0 0 0 4.8 2.4l1-1.6a10 10 0 0 1-1.6-.8l.4-.3a11.4 11.4 0 0 0 9.8 0l.4.3a10 10 0 0 1-1.6.8l1 1.6a16 16 0 0 0 4.8-2.4c.5-4.2-.6-7.8-2.6-10.9ZM8.6 14.2c-1 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.8.9 1.7 1.9c0 1-.8 1.9-1.7 1.9Zm6.3 0c-1 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.8.9 1.7 1.9c0 1-.8 1.9-1.7 1.9Z",
  x: "M17.5 3h3.1l-6.8 7.8L21.8 21h-6.2l-4.9-6.4L5.1 21H2l7.2-8.3L2.5 3h6.3l4.4 5.9L17.5 3Zm-1.1 16.1h1.7L7.7 4.8H5.9l10.5 14.3Z",
  youtube:
    "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8A26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z",
  instagram:
    "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4 1 .4.4.7.8 1 1.4.1.4.3 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-1 1.4-.4.4-.8.7-1.4 1-.4.1-1 .3-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-1a3.9 3.9 0 0 1-1-1.4c-.1-.4-.3-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 1-1.4.4-.4.8-.7 1.4-1 .4-.1 1-.3 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 5.8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 6.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Zm5.1-6.7a.9.9 0 1 1-1.9 0 .9.9 0 0 1 1.9 0Z",
};
