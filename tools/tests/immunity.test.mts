/**
 * The immunity gate.
 *
 * The website checked the actor's level against the COMMAND and never against
 * the PERSON, so a Moderator could kick or slay an Owner. It cannot be caught
 * downstream: commands reach the game server over RCON, which has no identity,
 * so the plugin treats them as console and console outranks everyone.
 *
 * This must keep mirroring the plugin's AdminTargeting.CanTarget.
 */
import { canTargetLevel, AdminLevel } from "@/lib/adminImmunity";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const { None, Moderator, Admin, Owner } = AdminLevel;

// The reported hole.
check("a Moderator cannot touch an Owner", !canTargetLevel(Moderator, Owner));
check("an Admin cannot touch an Owner",    !canTargetLevel(Admin, Owner));
check("a Moderator cannot touch an Admin", !canTargetLevel(Moderator, Admin));
check("a nobody cannot touch a Moderator", !canTargetLevel(None, Moderator));

// Downward always works.
check("an Owner can touch an Admin",       canTargetLevel(Owner, Admin));
check("an Owner can touch a nobody",       canTargetLevel(Owner, None));
check("an Admin can touch a Moderator",    canTargetLevel(Admin, Moderator));
check("a Moderator can touch a nobody",    canTargetLevel(Moderator, None));

// Equal is allowed — SourceMod's convention, and what the plugin does.
for (const [name, lvl] of Object.entries(AdminLevel)) {
  check(`${name} can act on ${name}`, canTargetLevel(lvl as number, lvl as number));
}

// Self always, whatever the ranks.
check("anyone can act on themselves", canTargetLevel(None, Owner, true));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
