import type { LucideIcon } from "lucide-react";
import {
  Camera,
  LayoutDashboard,
  ListVideo,
  Map as MapIcon,
  MapPinned,
  MonitorCog,
  ScrollText,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Wand2,
} from "lucide-react";
import { AdminLevel } from "@/lib/adminImmunity";
import { MANAGE_ALL_LEVEL } from "@/lib/tournamentRoles";

/**
 * What the admin area contains, and which of its two panels each part is in.
 *
 * There used to be one panel, gated entirely on the GardenAdmins ladder. That
 * made "tournament organizer" unrepresentable: an organizer has no admin level
 * at all, so letting them into any of this would have meant letting them into
 * all of it — RCON, plugin config, bans. Splitting the navigation in two is
 * what makes the narrower grant expressible. Blitz is the only panel an
 * organizer can open, and nothing in it acts on a game server's configuration,
 * the plugin, or a player's standing.
 *
 * The two ladders stay the ones that already exist. `level` is the GardenAdmins
 * level from lib/adminImmunity; `organizerOk` is the organizer registry that
 * lib/tournamentRoles already decides `canCreateTournament` from. Nothing here
 * invents a third notion of permission — the panel only decides what to draw,
 * and every route behind it re-checks with the same functions.
 *
 * Icons are components rather than glyphs. The nav used to mix box-drawing
 * characters with emoji: two different sets, rendered by whichever font the
 * platform happened to substitute, and read aloud by a screen reader as
 * "camera with flash".
 */

export type AdminPanelId = "site" | "blitz";

export type AdminNavItem = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Minimum GardenAdmins level. */
  level: number;
  /**
   * Whether a tournament organizer with no admin level sees this.
   *
   * Set only inside the Blitz panel. It is the whole of the organizer grant, so
   * putting it on anything that reaches a game server or a player's record
   * would quietly hand every organizer a moderator's powers.
   */
  organizerOk?: boolean;
  /** A route out of the panel rather than one of its own tabs. */
  href?: string;
};

export type AdminNavGroup = { group: string; items: AdminNavItem[] };

/** The three facts either panel needs to decide what a viewer may see. */
export type AdminViewer = {
  /** GardenAdmins level: 0 none, 1 moderator, 2 admin, 3 owner. */
  level: number;
  /** In the GardenOrganizers registry — may create tournaments of their own. */
  isOrganizer: boolean;
  /**
   * Named on at least one tournament without being in the registry.
   *
   * A co-organizer added to somebody else's event is exactly this, and dropping
   * them would lock them out of the only tournament they run.
   */
  managesSome?: boolean;
};

/**
 * The server, the plugin and the people who play on it.
 *
 * Console is not a separate entry: it folded into Server control. They were
 * never two jobs — every question the buttons raise is answered by the console,
 * and the split meant running a command in one tab and going to the other to
 * see what it did.
 */
export const SITE_SECTIONS: AdminNavGroup[] = [
  {
    group: "Overview",
    items: [
      { id: "overview", label: "Dashboard", hint: "What needs attention", icon: LayoutDashboard, level: AdminLevel.Moderator },
    ],
  },
  {
    group: "Community",
    items: [
      { id: "players", label: "Players", hint: "Roles, names, bans", icon: Users, level: AdminLevel.None },
      { id: "skins", label: "Custom skins", hint: "VPKs served to clients", icon: Sparkles, level: AdminLevel.None },
      { id: "demos", label: "Queue", hint: "Demos and clip marks waiting", icon: ListVideo, level: AdminLevel.Admin },
      { id: "captures", label: "Captures", hint: "Lineup fixes players suggested", icon: Camera, level: AdminLevel.Moderator },
      { id: "safequeue", label: "Safe queue", hint: "Review queue requests", icon: ShieldCheck, level: AdminLevel.Moderator },
    ],
  },
  {
    group: "Server",
    items: [
      { id: "server", label: "Server control", hint: "The fleet: consoles, maps, modes, matches", icon: MonitorCog, level: AdminLevel.Moderator },
      { id: "maps", label: "Maps", hint: "Workshop maps by mode", icon: MapIcon, level: AdminLevel.Moderator },
      { id: "config", label: "Plugin config", hint: "Rankings, allocator, game rules", icon: SlidersHorizontal, level: AdminLevel.Admin },
      { id: "gamemaker", label: "Game maker", hint: "Spawns, strats and mode pitches", icon: Wand2, level: AdminLevel.Admin },
      { id: "season", label: "Season", hint: "Season management, elo reset", icon: Trophy, level: AdminLevel.Owner },
    ],
  },
  {
    group: "System",
    items: [
      { id: "log", label: "Audit log", hint: "Who did what", icon: ScrollText, level: AdminLevel.None },
    ],
  },
];

/**
 * Blitz: running events.
 *
 * Every item is either open to organizers or gated at Admin. There is
 * deliberately no server control, no plugin config, no ban list and no audit
 * log here — an organizer runs a bracket, and none of those is part of running
 * a bracket. The server registry an event needs is inside Tournaments and stays
 * Owner-gated there, because those rows carry RCON passwords.
 */
export const BLITZ_SECTIONS: AdminNavGroup[] = [
  {
    group: "Overview",
    items: [
      {
        id: "overview",
        label: "Dashboard",
        hint: "Events, matches and free servers",
        icon: LayoutDashboard,
        level: MANAGE_ALL_LEVEL,
        organizerOk: true,
      },
    ],
  },
  {
    group: "Events",
    items: [
      // A route, not a tab. The setup surface is already a page of its own at
      // /admin/tournaments, and it is a workspace you stay in — re-hosting it
      // inside a tab would be a second copy to keep in step for no gain.
      {
        id: "tournaments",
        label: "Tournaments",
        hint: "Create, seed, generate brackets",
        icon: Swords,
        level: MANAGE_ALL_LEVEL,
        organizerOk: true,
        href: "/admin/tournaments",
      },
    ],
  },
  {
    group: "Authoring",
    items: [
      // Its own page rather than a tab: it drives a live server by standing in
      // the map, so it is a tool you go to rather than a panel you glance at.
      // Admin-gated to match the page it opens, so the entry never promises
      // access the route then refuses.
      {
        id: "maker",
        label: "Spawn maker",
        hint: "Tournament spawns, per map",
        icon: MapPinned,
        level: AdminLevel.Admin,
        href: "/admin/maker",
      },
    ],
  },
];

export type AdminPanelLink = {
  id: AdminPanelId;
  label: string;
  hint: string;
  icon: LucideIcon;
  href: string;
};

const PANELS: AdminPanelLink[] = [
  { id: "site", label: "Server & community", hint: "The server, the plugin, the players", icon: Server, href: "/admin" },
  { id: "blitz", label: "Blitz", hint: "Tournaments and the machines that run them", icon: Swords, href: "/admin/blitz" },
];

/** Whether this viewer may see one navigation entry. */
export function canSee(item: AdminNavItem, viewer: AdminViewer): boolean {
  if (viewer.level >= item.level) return true;
  return Boolean(item.organizerOk && (viewer.isOrganizer || viewer.managesSome));
}

/**
 * The groups this viewer should be shown, empty ones dropped.
 *
 * Entries above a viewer's standing are hidden rather than disabled: a greyed
 * row invites a request for access the panel cannot grant.
 */
export function visibleSections(sections: AdminNavGroup[], viewer: AdminViewer): AdminNavGroup[] {
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => canSee(item, viewer)) }))
    .filter((section) => section.items.length > 0);
}

/** Moderator and up. The panel's own page refuses below this. */
export const canOpenSitePanel = (viewer: AdminViewer): boolean =>
  viewer.level >= AdminLevel.Moderator;

/**
 * Admin and up, or anyone who runs an event.
 *
 * Deliberately NOT satisfied by Moderator alone — lib/tournamentRoles is
 * explicit that moderating the community and running events are different jobs,
 * and a moderator who should do both is added to the organizer registry like
 * anybody else.
 */
export const canOpenBlitzPanel = (viewer: AdminViewer): boolean =>
  viewer.level >= MANAGE_ALL_LEVEL || viewer.isOrganizer || Boolean(viewer.managesSome);

/** The panels to offer in the switcher — only the ones the viewer can open. */
export function panelsFor(viewer: AdminViewer): AdminPanelLink[] {
  return PANELS.filter((panel) =>
    panel.id === "site" ? canOpenSitePanel(viewer) : canOpenBlitzPanel(viewer),
  );
}

/** Every tab id in a panel, for validating a `?tab=` out of the URL. */
export const tabIds = (sections: AdminNavGroup[]): string[] =>
  sections.flatMap((section) => section.items.filter((item) => !item.href).map((item) => item.id));

/** One entry by id, for the content pane's header. */
export function findItem(sections: AdminNavGroup[], id: string): AdminNavItem | undefined {
  for (const section of sections) {
    const hit = section.items.find((item) => item.id === id);
    if (hit) return hit;
  }
  return undefined;
}
