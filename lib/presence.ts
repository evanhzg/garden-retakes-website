/**
 * What one player looks like to another.
 *
 * Import-free, because it is decidable from three inputs and because getting
 * it wrong is invisible: nobody reports "my friend showed as online while
 * invisible", they just quietly stop trusting the dots.
 *
 * There are three sources and they disagree on purpose:
 *
 *   the socket   — has a tab open. Observed.
 *   /api/live    — is in a game right now. Observed.
 *   Presence     — what they CHOSE. Set on purpose.
 *
 * A chosen status outranks an observed one, with exactly one exception: being
 * in a game outranks "away", because away means "not at the keyboard" and the
 * server has just proved otherwise. It does NOT outrank dnd or invisible —
 * those are requests, and a request that stops applying the moment you start
 * playing is not worth making.
 */

/** What a player picked. Null is the default and means online. */
export type ChosenStatus = "online" | "away" | "dnd" | "invisible" | null;

/** What anybody else sees. */
export type ShownPresence = "ingame" | "spectating" | "online" | "away" | "dnd" | "offline";

export const CHOSEN_STATUSES: readonly Exclude<ChosenStatus, null>[] = [
  "online",
  "away",
  "dnd",
  "invisible",
];

export const isChosenStatus = (v: unknown): v is Exclude<ChosenStatus, null> =>
  typeof v === "string" && (CHOSEN_STATUSES as readonly string[]).includes(v);

export type PresenceInput = {
  /** Has a tab open, per the socket. */
  connected: boolean;
  /** In a server: "playing", "spectating", or null for neither. */
  inGame: "playing" | "spectating" | null;
  /** What they chose, or null. */
  chosen: ChosenStatus;
};

export function shownPresence(p: PresenceInput): ShownPresence {
  // Invisible is total. Not "offline-ish": the whole value of the setting is
  // that it is indistinguishable from being away, so it has to win over the
  // game feed too — which is the case somebody choosing it is thinking of.
  if (p.chosen === "invisible") return "offline";

  // Nothing to show for somebody who is not here at all. Checked after
  // invisible so the two produce the same answer, which is the point.
  if (!p.connected && !p.inGame) return "offline";

  // A request, and it keeps applying while they play. A do-not-disturb that
  // lapses the moment you start a match is a do-not-disturb for the times you
  // were not going to be disturbed anyway.
  if (p.chosen === "dnd") return "dnd";

  // Observed activity, which beats "away" and nothing else.
  if (p.inGame === "playing") return "ingame";
  if (p.inGame === "spectating") return "spectating";

  if (p.chosen === "away") return "away";

  return "online";
}

/** Whether this player is accepting messages, for anything that wants to ask. */
export const acceptsMessages = (chosen: ChosenStatus): boolean => chosen !== "dnd";

/**
 * The order a friends list goes in.
 *
 * Sorts on `shown`, not on `presence`: one is what anybody sees and the other
 * is what the player chose, and a single field name meaning both is how an
 * invisible friend ends up sorted among the online ones.
 *
 * Online first, then by how recently they were seen — most recent at the top —
 * which is the list somebody actually wants: the people they might play with
 * now, then the people they played with last.
 *
 * Offline sorts among itself the same way, so a friend who logged off an hour
 * ago is above one last seen in March. Ties break on name so the list does not
 * reshuffle between renders.
 */
export function friendOrder<T extends { shown: ShownPresence; lastSeen: number | null; name: string }>(
  friends: T[],
): T[] {
  const rank = (p: ShownPresence): number => {
    switch (p) {
      case "ingame":
        return 0;
      case "spectating":
        return 1;
      case "online":
        return 2;
      case "away":
        return 3;
      case "dnd":
        return 4;
      default:
        return 5;
    }
  };

  return [...friends].sort((a, b) => {
    const byState = rank(a.shown) - rank(b.shown);
    if (byState !== 0) return byState;

    // Most recently seen first. Nulls last: an unknown last-seen is not a
    // claim that it was long ago, but it cannot be ordered against one.
    const at = a.lastSeen ?? -1;
    const bt = b.lastSeen ?? -1;
    if (at !== bt) return bt - at;

    return a.name.localeCompare(b.name);
  });
}
