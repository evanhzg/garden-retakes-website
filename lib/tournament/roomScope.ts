/**
 * Who may read, and who may write, a match-room line.
 *
 * Import-free and on its own, because it is a permission decided entirely from
 * "which team is this viewer on" and "what scope is this line", and because the
 * case that matters is the one nobody reaches by clicking: the other team's
 * private channel, asked for directly.
 *
 * The rule is short enough to state in a sentence — you see the room, plus your
 * own team — and the reason it is a module is that getting it wrong leaks a
 * team's veto plan to their opponent, which is the one thing a private channel
 * exists to prevent.
 */

/** Which team a viewer is on, or null for a spectator. */
export type Viewer = "a" | "b" | null;

/** Where a line is addressed: everybody, or one team. */
export type Scope = "room" | "a" | "b";

export const SCOPES: readonly Scope[] = ["room", "a", "b"];

export const isScope = (v: unknown): v is Scope =>
  typeof v === "string" && (SCOPES as readonly string[]).includes(v);

/**
 * The scopes a viewer's query may include.
 *
 * Everybody gets the room. A player also gets their own team's channel.
 *
 * Organizers deliberately do NOT get both teams. They can already read the room
 * and the whole game chat, which is what "what happened here" needs; a private
 * channel that staff can read is not private, and a team that believes theirs
 * is would say things in it they would not say otherwise. An organizer who is
 * also playing gets their own team's, like any other player — that is the same
 * ordering roleFor uses when it decides whether to badge somebody ADMIN.
 */
export function readableScopes(viewer: Viewer): Scope[] {
  return viewer === null ? ["room"] : ["room", viewer];
}

/**
 * Whether a viewer may post into a scope.
 *
 * The same rule as reading, with one addition: writing needs an identity at
 * all. A signed-out viewer may read a published match's room and may not say
 * anything in it.
 */
export function mayPostTo(viewer: Viewer, scope: Scope, signedIn: boolean): boolean {
  if (!signedIn) return false;
  if (scope === "room") return true;
  return viewer === scope;
}

/**
 * The scope a request asked for, or "room" when it asked for nothing.
 *
 * Falls back rather than failing: an old client that does not know about team
 * chat posts to the room, which is what it has always done and what it means.
 * An unrecognised value is NOT treated the same way — that is a caller sending
 * something wrong, and silently widening it to the room would turn an intended
 * private line public.
 */
export function parseScope(raw: unknown): { ok: true; scope: Scope } | { ok: false } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, scope: "room" };
  return isScope(raw) ? { ok: true, scope: raw } : { ok: false };
}
