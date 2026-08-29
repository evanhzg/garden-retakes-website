/**
 * Standing teams: the rules, and nothing that touches a database.
 *
 * A "team" used to mean one row scoped to one tournament, so five players
 * entering three events were three unrelated rows with no thread between them —
 * which is why the results page groups team rankings by NAME, the only thing
 * those rows had in common. A standing team is the thread.
 *
 * Import-free and tested because the two rules that matter are both invisible
 * until a real event and both expensive then:
 *
 *   - who may do what. A manager runs the team; only the captain can hand it
 *     away or delete it. Getting that backwards means somebody removes the
 *     person who owns the team.
 *   - one team per player per tournament. A player may belong to as many
 *     standing teams as they like — that is the point of them — but entering an
 *     event twice puts their stats on two rosters and produces a bracket where
 *     one person played for both semi-finalists.
 */

export type TeamRole = "captain" | "manager" | "player";

/** Highest first: index in this array is authority. */
export const TEAM_ROLES: TeamRole[] = ["captain", "manager", "player"];

export const isTeamRole = (v: string): v is TeamRole =>
  (TEAM_ROLES as string[]).includes(v);

const rank = (role: TeamRole) => TEAM_ROLES.indexOf(role);

/** What somebody is allowed to do to a team. */
export type TeamPermission =
  | "edit"          // name, tag, avatar
  | "invite"        // add a member
  | "remove"        // remove a member who is not the captain
  | "promote"       // make somebody a manager, or demote one
  | "enter"         // enter the team into a tournament
  | "transfer"      // hand the captaincy to somebody else
  | "delete";       // delete the team

/**
 * Whether this role may do this thing.
 *
 * A manager can run the team day to day. The two they cannot do are the two
 * that end it: giving it away and deleting it. That split is the whole reason
 * the role exists — a captain who is not around should not be a team that
 * cannot function, and a manager who falls out with the captain should not be
 * able to take it.
 */
export function teamCan(role: TeamRole | null, action: TeamPermission): boolean {
  if (role === null) return false;
  if (role === "captain") return true;

  if (role === "manager") {
    return action !== "transfer" && action !== "delete";
  }

  // A player is a member, not an officer.
  return false;
}

/** Whether `actor` may change `target`'s role or remove them. */
export function canActOn(actor: TeamRole | null, target: TeamRole): boolean {
  if (actor === null) return false;

  // Nobody may act on the captain, including a manager and including the
  // captain themselves — handing the team over is `transfer`, which is its own
  // action with its own confirmation, not a side effect of a demotion.
  if (target === "captain") return false;

  // Otherwise: strictly senior. Two managers cannot demote each other, which
  // would be a coin flip decided by whoever clicked first.
  return rank(actor) < rank(target);
}

export type Membership = {
  /** The standing team. */
  teamId: number;
  teamName: string;
};

export type EntryCheck = { ok: true } | { ok: false; error: string };

/**
 * Whether this team may enter this tournament with this roster.
 *
 * `alreadyEntered` is every OTHER standing team of this player's that is
 * already in this tournament. It spans teams rather than looking at one,
 * because the rule is about the player and the event, not about the team doing
 * the asking.
 */
export function checkTeamEntry(input: {
  teamSize: number;
  /** SteamIDs chosen from the standing roster. */
  chosen: string[];
  /** SteamID -> the other teams of theirs already in this tournament. */
  alreadyEntered: Record<string, Membership[]>;
  /** Names, for a message somebody can act on. */
  nameOf?: Record<string, string>;
}): EntryCheck {
  const { teamSize, chosen } = input;

  if (chosen.length !== teamSize) {
    return {
      ok: false,
      error: `Pick ${teamSize} player${teamSize === 1 ? "" : "s"}; you have picked ${chosen.length}.`,
    };
  }

  const seen = new Set<string>();
  for (const id of chosen) {
    const key = id.trim();
    if (seen.has(key)) {
      return { ok: false, error: "The same player is picked twice." };
    }
    seen.add(key);
  }

  for (const id of chosen) {
    const clashes = input.alreadyEntered[id.trim()] ?? [];
    if (clashes.length === 0) continue;

    const who = input.nameOf?.[id.trim()] ?? id.trim();
    return {
      ok: false,
      error: `${who} is already in this tournament with ${clashes[0].teamName}.`,
    };
  }

  return { ok: true };
}

/**
 * A team's URL name.
 *
 * Teams are reached by slug rather than id so a link reads as the team. Kept
 * here rather than beside the database because the rule — what survives, and
 * what a collision looks like — is the same wherever it is applied.
 */
export function teamSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    // Strip accents rather than dropping the letters: "Équipe" becomes
    // "equipe", not "quipe".
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/**
 * A tag, as it will appear in front of a name.
 *
 * Upper case and short. Not validated beyond that: a tag is decoration, and a
 * team that wants lower case letters in theirs is not doing anything wrong.
 */
export const cleanTag = (tag: string): string => tag.trim().toUpperCase().slice(0, 8);

/**
 * Whether a name can be used at all.
 *
 * The floor is two visible characters, because a team called " " is a team
 * nobody can refer to. The ceiling is the column.
 */
export function checkTeamName(name: string): EntryCheck {
  const clean = name.trim();
  if (clean.length < 2) return { ok: false, error: "A team name needs at least two characters." };
  if (clean.length > 64) return { ok: false, error: "That name is too long (64 characters)." };
  if (!teamSlug(clean)) {
    return { ok: false, error: "That name has no letters or numbers in it." };
  }
  return { ok: true };
}
