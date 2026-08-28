/**
 * Every command the servers answer to.
 *
 * This replaces `content/commands.md` and its hand-rolled table parser. The
 * reason is not tidiness: the page needs each command's *mode*, its *level* and
 * its *aliases* as separate facts so it can offer a tab per mode and a search
 * that matches an alias. A markdown table has one column of prose and a parser
 * guessing at the rest, and every guess it got wrong was invisible until
 * somebody read the page looking for a command that was filed under the wrong
 * heading.
 *
 * As data it is also type-checked. A typo in a mode id fails the build now,
 * where before it silently produced a tab nobody could reach.
 *
 * KEEP THIS UPDATED whenever plugin commands change. It is generated from the
 * `AddCommand` calls in the plugin repos — R5e-games for the live modes,
 * R5eGames.Tournament for the tournament plugin — and the levels come from each
 * module's own permission check.
 */

/** Where a command does something. `global` means every mode. */
export type CommandModeId =
  | "global"
  | "retakes"
  | "tournament"
  | "executes"
  | "faststrat"
  | "duels"
  | "wingman"
  | "practice"
  | "defender"
  | "hideandseek"
  | "spelltakers"
  | "edit";

export type CommandLevel = "everyone" | "mod" | "admin" | "owner";

export type CommandEntry = {
  /** Primary name, no prefix. Chat is `!name` or `.name`, console is `css_name`. */
  name: string;
  /** Other names for the same command. Searched like the primary. */
  aliases?: string[];
  /** Argument shape, shown after the name. */
  args?: string;
  description: string;
  /** Defaults to "everyone". */
  level?: CommandLevel;
  /** No chat form — RCON and the server console only. */
  consoleOnly?: boolean;
};

export type CommandGroup = {
  id: string;
  title: string;
  /** Which tabs this group appears under. */
  modes: CommandModeId[];
  blurb?: string;
  commands: CommandEntry[];
};

export const COMMAND_MODES: { id: CommandModeId; label: string; hint: string }[] = [
  { id: "global", label: "Everywhere", hint: "Works in every mode" },
  { id: "retakes", label: "Retakes", hint: "Casual, ranked and Blitz" },
  { id: "tournament", label: "Tournament", hint: "The standalone 3v3 tournament plugin" },
  { id: "executes", label: "Executes", hint: "Scripted T-side executes" },
  { id: "faststrat", label: "Fast Strat", hint: "Called strats on a timer" },
  { id: "duels", label: "Duels", hint: "1v1 / 2v2 arena" },
  { id: "wingman", label: "Wingman", hint: "2v2 on the wingman maps" },
  { id: "practice", label: "Practice", hint: "Nades, prefire and free movement" },
  { id: "defender", label: "Defender", hint: "Hold a site against a scripted execute" },
  { id: "hideandseek", label: "Hide & Seek", hint: "One hunter, everyone else hides" },
  { id: "spelltakers", label: "Spell Takers", hint: "MOBA-style abilities" },
  { id: "edit", label: "Edit", hint: "No bomb, no timer, noclip and markers" },
];

export const COMMAND_GROUPS: CommandGroup[] = [
  // ------------------------------------------------------------------ global
  {
    id: "account",
    title: "Your account",
    modes: ["global"],
    blurb: "Everything tied to you rather than to the round being played.",
    commands: [
      { name: "elo", description: "Your CS Rating and ladder placement" },
      { name: "stats", args: "[ranked]", description: "Your season stats — K/D, ADR, KAST, rating, clutches" },
      { name: "top", description: "The season's top rated players" },
      { name: "time", aliases: ["playtime"], description: "How long you have spent on the server" },
      { name: "crtop", description: "The season's top Blitz duos and trios" },
      { name: "damage", aliases: ["dmg"], description: "Toggle the end-of-round damage report" },
      { name: "deathreplay", aliases: ["dr", "killcam"], description: "Turn your own death replay on or off" },
      { name: "clip", description: "Save the last few seconds as a clip on the website" },
      { name: "voices", description: "Toggle the bombsite voice announcements" },
    ],
  },
  {
    id: "inventory",
    title: "Skins and loadouts",
    modes: ["global"],
    blurb: "The website's inventory simulator, reaching into the game.",
    commands: [
      { name: "ws", description: "Re-fetch your skins from the website" },
      { name: "wslogin", description: "Sign in to the inventory simulator from in game" },
      { name: "loadout", args: "[name|random]", description: "Switch your active loadout, or open the centre menu with no argument" },
      { name: "loadouts", description: "List your loadouts, with the active one marked" },
      { name: "borrow", args: "<key>", description: "Import a shared loadout by its short key and equip it" },
      { name: "spray", description: "Apply your equipped graffiti" },
      { name: "invsim_refresh", args: "<steamid>", description: "Re-fetch one player's inventory", level: "admin", consoleOnly: true },
    ],
  },
  {
    id: "server",
    title: "Mode, maps and config",
    modes: ["global"],
    commands: [
      { name: "mode", aliases: ["modes"], description: "Open the mode picker" },
      { name: "gamemode", aliases: ["gmode"], args: "[mode]", description: "Show or change the mode", level: "admin" },
      { name: "maps", description: "The maps in rotation for the current mode" },
      { name: "rtv", description: "Rock the vote to change map" },
      { name: "map", aliases: ["gmap"], args: "<map>", description: "Change map now", level: "mod" },
      { name: "settings", aliases: ["config", "gmenu", "gsettings"], description: "Open the server-config menu", level: "admin" },
      { name: "gconfig", description: "Browse and edit the Garden configs in game — this is the one that saves", level: "admin" },
      { name: "restart", aliases: ["grestart"], description: "Apply a config written from the website, now", level: "admin" },
      { name: "gconfigapply", description: "Apply a config pushed by the website", level: "admin", consoleOnly: true },
      { name: "gstatus", description: "Map, mode and player count, as JSON", level: "admin", consoleOnly: true },
      { name: "smallserver", args: "<on|off|auto>", description: "The small-server overlay, or show its state", level: "admin" },
      { name: "replay", args: "<match>", description: "Play back a recorded match", level: "admin" },
      { name: "seasons", description: "List every season", level: "admin" },
      { name: "season_new", args: "[name]", description: "Start a new season", level: "owner", consoleOnly: true },
      { name: "rankings_reload_config", description: "Reload the rankings config from disk", level: "owner", consoleOnly: true },
      { name: "reload_allocator_config", description: "Reload the allocator config from disk", level: "owner", consoleOnly: true },
      { name: "print_config", args: "[name]", description: "Print the allocator config", level: "admin", consoleOnly: true },
      { name: "debugqueues", description: "Print the state of the queues", level: "admin", consoleOnly: true },
    ],
  },
  {
    id: "moderation",
    title: "Moderation",
    modes: ["global"],
    blurb: "Levels are the Garden admin registry. `@css/root` counts as Owner.",
    commands: [
      { name: "gadmin", aliases: ["admin"], args: "add|remove|list", description: "Manage admins — persisted to the database and the JSON", level: "owner" },
      { name: "gkick", aliases: ["kick"], args: "<name>", description: "Kick a player", level: "mod" },
      { name: "gslay", aliases: ["slay"], args: "<name>", description: "Slay a player", level: "admin" },
      { name: "gban", aliases: ["ban"], args: "<name|steamid> [minutes] [reason]", description: "Ban a player", level: "admin" },
      { name: "gunban", aliases: ["unban"], args: "<steamid>", description: "Lift a ban", level: "admin" },
      { name: "gstop", aliases: ["stop"], description: "End the game and return to warmup", level: "admin" },
      { name: "grestore", aliases: ["restore"], description: "Restore the game to the last round before a crash", level: "admin" },
      { name: "grcon", aliases: ["rcon"], args: "<command...>", description: "Run any server command", level: "owner" },
      { name: "reveal", args: "[player] [seconds]", description: "Glow a player through walls for everyone", level: "admin" },
      { name: "nojump", args: "[player]", description: "Stop a player jumping for this round", level: "admin" },
      { name: "freecam", aliases: ["ghost"], description: "Enter admin freecam as a spectator", level: "admin" },
    ],
  },
  {
    id: "spotlight",
    title: "Spotlight",
    modes: ["global"],
    blurb: "Follow one player, for a stream or a bit of theatre.",
    commands: [
      { name: "spotlight", aliases: ["dcp"], description: "Show the spotlight status" },
      { name: "pushzone", args: "add|height|del|list|clear", description: "Edit the push zones", level: "admin" },
    ],
  },

  // ----------------------------------------------------------------- retakes
  {
    id: "weapons",
    title: "Weapons",
    modes: ["retakes"],
    blurb: "Preferences, not a buy menu. What you set here is what you are handed.",
    commands: [
      { name: "guns", aliases: ["buy", "weapons"], description: "Open the weapon-preference menu" },
      { name: "gunmenu", aliases: ["gunsmenu"], description: "The centre weapon menu — W/S to move, D to select, A back, TAB out" },
      { name: "gun", args: "<name> [T|CT]", description: "Set a preference; partial names work" },
      { name: "removegun", args: "<name> [T|CT]", description: "Remove a preference" },
      { name: "ak", aliases: ["ak47"], description: "AK-47 as your full-buy primary on both teams" },
      { name: "m4a4", description: "M4A4 as your full-buy primary on both teams" },
      { name: "m4a1", aliases: ["m4a1s"], description: "M4A1-S as your full-buy primary on both teams" },
      { name: "awp", description: "Join or leave the AWP rotation" },
      { name: "zeus", description: "Toggle a free Zeus every round" },
      { name: "nextround", description: "Vote for the next round type" },
      { name: "setnextround", args: "<P|H|F>", description: "Set the next round type outright", level: "admin" },
    ],
  },
  {
    id: "ranked",
    title: "Ranked and Blitz",
    modes: ["retakes"],
    commands: [
      { name: "rr", aliases: ["ranked"], description: "Start or stop Ranked Retakes — informational while auto mode is on" },
      { name: "rankedstatus", description: "Is ranked active?" },
      { name: "ry", description: "Accept the ongoing vote" },
      { name: "rn", description: "Decline the ongoing vote" },
      { name: "cr", description: "Start a Blitz match vote (2v2/3v3, locked sides, MR12). Repeat to cancel a live one" },
      { name: "pause", aliases: ["p"], description: "Tactical pause — counts against your team's budget" },
      { name: "tech", aliases: ["technical"], description: "Technical pause, no time limit", level: "admin" },
      { name: "up", aliases: ["unpause"], description: "Resume the match" },
      { name: "cr_status", description: "The pending or live CR match, on one line", level: "admin", consoleOnly: true },
      { name: "cr_go", args: "[matchId]", description: "Start the pending CR match", level: "admin", consoleOnly: true },
      { name: "cr_reset", description: "Clear any pending CR match", level: "admin", consoleOnly: true },
      { name: "cr_diag", description: "Every CR precondition and its current answer", level: "admin", consoleOnly: true },
      { name: "rr_force", description: "Force-activate Ranked Retakes", level: "owner", consoleOnly: true },
      { name: "rr_stop", description: "Force-stop Ranked Retakes", level: "owner", consoleOnly: true },
      { name: "rr_state", description: "Print the ranked session state", level: "owner", consoleOnly: true },
      { name: "rr_setelo", args: "<elo>", description: "Set your own ELO", level: "owner", consoleOnly: true },
    ],
  },
  {
    id: "retakes-admin",
    title: "Running a retakes round",
    modes: ["retakes"],
    commands: [
      { name: "forcebombsite", args: "<a|b>", description: "Retake one site only", level: "admin" },
      { name: "forcebombsitestop", description: "Back to the normal rotation", level: "admin" },
      { name: "scramble", aliases: ["scrambleteams"], description: "Scramble the teams next round", level: "admin" },
      { name: "gscr", description: "Toggle scrambling every round", level: "admin" },
      { name: "mapconfig", aliases: ["loadmapconfig", "setmapconfig"], args: "<file>", description: "Force a map config to load", level: "admin" },
      { name: "mapconfigs", aliases: ["listmapconfigs", "viewmapconfigs"], description: "List the available map configs", level: "admin" },
    ],
  },
  {
    id: "spawn-editor",
    title: "Spawn editor",
    modes: ["retakes"],
    blurb:
      "The retakes spawns — the ones the live server uses. Tournament spawns are authored separately, with the Maker.",
    commands: [
      { name: "gspawn", aliases: ["spawn"], args: "add|del|move|flag|info|test|round", description: "The spawn editor", level: "admin" },
      { name: "gspawns", args: "a|b|all|flag <name>|off", description: "Render the spawns in the world", level: "admin" },
      { name: "add", aliases: ["addspawn", "new", "newspawn"], description: "Add a spawn for the bombsite being shown", level: "admin" },
      { name: "delete", aliases: ["deletespawn", "remove", "removespawn"], description: "Delete the nearest spawn", level: "admin" },
      { name: "nearest", aliases: ["nearestspawn"], description: "Go to the nearest spawn", level: "admin" },
      { name: "spawns", aliases: ["showspawns"], args: "<a|b>", description: "Show a bombsite's spawns", level: "admin" },
      { name: "done", aliases: ["exitedit", "hidespawns"], description: "Leave spawn-editing mode", level: "admin" },
    ],
  },

  // -------------------------------------------------------------- tournament
  {
    id: "tournament-players",
    title: "Playing a tournament match",
    modes: ["tournament"],
    blurb: "Both prefixes work — `.ready` and `!ready` are the same command.",
    commands: [
      { name: "ready", aliases: ["r"], description: "Say you are ready. Warmup ends when everyone has" },
      { name: "unready", description: "Take it back" },
      { name: "stay", description: "After winning the knife round, keep your side" },
      { name: "switch", description: "After winning the knife round, take the other side" },
      { name: "pause", aliases: ["tac"], description: "Tactical pause — two minutes a team, for the whole match" },
      { name: "up", aliases: ["unpause"], description: "Resume. Anyone on the team that paused can call it" },
      { name: "score", description: "The current score" },
      { name: "roles", description: "Who is playing what" },
      { name: "admin", aliases: ["calladmin"], description: "Call an admin. Pauses at the next freezetime and raises an alert on the website" },
      { name: "help", description: "This list, in chat" },
    ],
  },
  {
    id: "tournament-admin",
    title: "Running a tournament match",
    modes: ["tournament"],
    blurb:
      "Every one of these also exists on the website's per-match panel, because the person who needs it is as likely to be watching a stream as standing in the server.",
    commands: [
      { name: "forceready", description: "Start without waiting for everyone", level: "admin" },
      { name: "score", args: "<a> <b>", description: "Set the score", level: "admin" },
      { name: "swap", description: "Swap which side each team is on", level: "admin" },
      { name: "forceside", args: "<a|b> <t|ct>", description: "Put a team on a side", level: "admin" },
      { name: "setrole", args: "<steamid> <t|ct> <role>", description: "Set somebody's role for one side", level: "admin" },
      { name: "economy", args: "<a|b> <n>", description: "Set a team's budget", level: "admin" },
      { name: "forcesite", args: "<a|b|off>", description: "Force the bombsite, or return to the rotation", level: "admin" },
      { name: "backups", description: "List the rounds that can be restored", level: "admin" },
      { name: "restore", args: "<n>", description: "Restore a round from its backup", level: "admin" },
      { name: "endmatch", args: "<a|b|draw>", description: "End the match", level: "admin" },
      { name: "restartmatch", description: "Send the match back to warmup", level: "admin" },
      { name: "tspec", args: "<name>", description: "Move somebody to spectator", level: "admin" },
      { name: "tech", description: "Technical pause — no budget, no limit", level: "admin" },
    ],
  },
  {
    id: "tournament-protocol",
    title: "Starting a match over RCON",
    modes: ["tournament"],
    blurb:
      "How the website puts a match on a server. Console only, in this order — `reset`, the rosters, then `go`.",
    commands: [
      { name: "t_reset", description: "Clear the pending match", level: "admin", consoleOnly: true },
      { name: "t_team", args: "<a|b> <name> <steamid...>", description: "Declare a roster", level: "admin", consoleOnly: true },
      { name: "t_side", args: "<a|b> <t|ct>", description: "Fix the starting sides", level: "admin", consoleOnly: true },
      { name: "t_knife", description: "Decide sides with a knife round instead", level: "admin", consoleOnly: true },
      { name: "t_role", args: "<steamid> <t|ct> <role>", description: "Set a role before the match starts", level: "admin", consoleOnly: true },
      { name: "t_spectator", args: "<steamid>", description: "Allow a caster onto the server", level: "admin", consoleOnly: true },
      { name: "t_go", description: "Validate the pending match and start it", level: "admin", consoleOnly: true },
      { name: "t_status", description: "Pending and live state, one line", level: "admin", consoleOnly: true },
      { name: "t_cancel", description: "Stop a live match", level: "admin", consoleOnly: true },
    ],
  },
  {
    id: "tournament-maker",
    title: "Spawn Maker",
    modes: ["tournament"],
    blurb:
      "Authoring tournament spawns. Driven from the website — SELECT IN-GAME sends `t_maker`, then E drops a variant where you stand and shooting one removes it.",
    commands: [
      { name: "t_maker", args: "<spawnId>", description: "Start authoring a spawn", level: "admin", consoleOnly: true },
      { name: "t_maker_list", description: "Print the variants placed so far", level: "admin", consoleOnly: true },
      { name: "t_maker_generate", description: "Write the authored variants to the map", level: "admin", consoleOnly: true },
      { name: "t_maker_end", description: "Close the session without writing", level: "admin", consoleOnly: true },
    ],
  },
  {
    id: "tournament-test",
    title: "Testing it alone",
    modes: ["tournament"],
    blurb:
      "A guided walkthrough of every feature, for one person. Six of its fifteen steps check themselves.",
    commands: [
      { name: "test", description: "Start the walkthrough — `!test stop` ends it", level: "admin" },
      { name: "next", description: "Next step", level: "admin" },
      { name: "back", description: "Repeat the step before", level: "admin" },
    ],
  },

  // ------------------------------------------------------------ other modes
  {
    id: "executes",
    title: "Executes",
    modes: ["executes"],
    commands: [
      { name: "gexec", aliases: ["exec"], args: "new|edit|tstart|ctsetup|nade|list|info|del|play|random", description: "Author and play executes", level: "admin" },
      { name: "nobomb", description: "Opt out of carrying the C4" },
    ],
  },
  {
    id: "faststrat",
    title: "Fast Strat",
    modes: ["faststrat"],
    commands: [
      { name: "strat", args: "<name|list>", description: "Vote the T strategy" },
      { name: "setup", args: "<name|list>", description: "Vote the CT setup" },
      { name: "nobomb", description: "Opt out of carrying the C4" },
    ],
  },
  {
    id: "duels",
    title: "Duels",
    modes: ["duels"],
    commands: [
      { name: "duel", args: "<player> [firstTo] | accept | decline | stop", description: "Challenge somebody" },
      { name: "duelscore", description: "The duel scoreboard" },
      { name: "garena", aliases: ["arena"], args: "new|seta|setb|list|del", description: "The arena editor", level: "admin" },
    ],
  },
  {
    id: "wingman",
    title: "Wingman",
    modes: ["wingman"],
    commands: [
      { name: "start", description: "Start the match", level: "admin" },
      { name: "rm", description: "Restart back to warmup", level: "admin" },
    ],
  },
  {
    id: "practice",
    title: "Practice",
    modes: ["practice"],
    commands: [
      { name: "prac", description: "The practice menu" },
      { name: "bot", args: "[name]", description: "Spawn a bot" },
      { name: "noclip", description: "Toggle noclip" },
      { name: "god", description: "Toggle god mode" },
      { name: "buddha", description: "Toggle buddha — damage but no death" },
      { name: "clear", description: "Clear your own utility" },
      { name: "clearall", description: "Clear everybody's utility" },
      { name: "lineup", args: "<name>", description: "Save a grenade lineup" },
      { name: "gnade_test", args: "<steamid> <lineup>", description: "Put a player on a lineup", level: "admin", consoleOnly: true },
    ],
  },
  {
    id: "defender",
    title: "Defender",
    modes: ["defender"],
    commands: [
      {
        name: "gdef",
        aliases: ["def"],
        args: "new|edit|spawn|bot|way|nade|list|info|del|play|random|retry",
        description: "Author and play defender scenarios",
        level: "admin",
      },
    ],
  },
  {
    id: "hideandseek",
    title: "Hide & Seek",
    modes: ["hideandseek"],
    commands: [
      { name: "hide", description: "Lock in your hiding spot" },
      { name: "taunt", description: "Taunt the hunters" },
      { name: "hns", args: "hunter <player> | start", description: "Run the round", level: "admin" },
    ],
  },
  {
    id: "spelltakers",
    title: "Spell Takers",
    modes: ["spelltakers"],
    commands: [{ name: "draft", description: "Draft your class" }],
  },
  {
    id: "edit",
    title: "Edit mode",
    modes: ["edit"],
    blurb: "No bomb, no timer, noclip and markers — the mode the other modes are authored in.",
    commands: [
      { name: "gedit", aliases: ["edit"], description: "Open or close the editor menu", level: "admin" },
      { name: "name", args: "<text>", description: "Answer a pending name prompt", level: "admin" },
      { name: "maker", description: "Game Maker — author spawns and strats in game", level: "admin" },
    ],
  },
];

/** Flattened, with the group each command came from, for search. */
export type FlatCommand = CommandEntry & { groupId: string; groupTitle: string; modes: CommandModeId[] };

export const ALL_COMMANDS: FlatCommand[] = COMMAND_GROUPS.flatMap((group) =>
  group.commands.map((command) => ({
    ...command,
    groupId: group.id,
    groupTitle: group.title,
    modes: group.modes,
  })),
);

/** Every name a command answers to, lowercased — what search matches against. */
export const namesOf = (command: CommandEntry): string[] => [command.name, ...(command.aliases ?? [])];
