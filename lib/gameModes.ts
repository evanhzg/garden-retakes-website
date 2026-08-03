/**
 * Game modes the plugin exposes through css_gamemode.
 *
 * Its own module, with no imports, because both sides need it: the admin panel
 * is a client component and lib/adminActions pulls in lib/rcon → lib/db →
 * lib/auth, which is `server-only`. Importing the list from there put the whole
 * server chain into the browser bundle and failed the build.
 *
 * This mirrors GameModeKind in R5eGames.Core — the panel only offered five of
 * the ten, so half the plugin was unreachable from the website.
 */
export const GAME_MODES = [
  { id: "retakes", label: "Retakes", hint: "Ranked retake rounds" },
  { id: "executes", label: "Executes", hint: "Scripted T-side executes" },
  { id: "practice", label: "Practice", hint: "Nades, prefire and free movement" },
  { id: "duels", label: "Duels", hint: "1v1 / 2v2 arena" },
  { id: "faststrat", label: "Fast Strat", hint: "Called strats on a timer" },
  { id: "wingman", label: "Wingman", hint: "2v2 on the wingman maps" },
  { id: "defender", label: "Defender", hint: "Hold a site against a scripted execute" },
  { id: "hideandseek", label: "Hide & Seek", hint: "One hunter, everyone else hides" },
  { id: "spelltakers", label: "Spell Takers", hint: "MOBA-style abilities (ARAM)" },
  { id: "edit", label: "Edit", hint: "No bomb, no timer, noclip and markers" },
] as const;

export type GameModeId = (typeof GAME_MODES)[number]["id"];

export const isGameMode = (value: string): value is GameModeId =>
  GAME_MODES.some((m) => m.id === value);

/**
 * Retakes has three flavours that are one mode to the plugin but three
 * different nights to the people playing: casual, ranked (points count), and
 * competitive (a real match). They share a control because picking between them
 * is one decision, not three.
 *
 * Ranked and competitive need bodies on the server — the plugin will not start
 * either below its minimum — so the panel disables them rather than letting a
 * click fail somewhere the admin cannot see.
 */
export const RETAKE_FLAVOURS = [
  { id: "retakes", label: "Classic", hint: "Retakes, points off", minPlayers: 0 },
  { id: "ranked", label: "Ranked", hint: "Points and CS Rating count", minPlayers: 4 },
  { id: "competitive", label: "Competitive", hint: "Full 5v5 match", minPlayers: 10 },
] as const;
