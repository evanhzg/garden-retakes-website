/**
 * Game modes the plugin exposes through css_gamemode.
 *
 * Its own module, with no imports, because both sides need it: the admin panel
 * is a client component and lib/adminActions pulls in lib/rcon → lib/db →
 * lib/auth, which is `server-only`. Importing the list from there put the whole
 * server chain into the browser bundle and failed the build.
 */
export const GAME_MODES = [
  { id: "retakes", label: "Retakes", hint: "Ranked retake rounds" },
  { id: "executes", label: "Executes", hint: "Scripted T-side executes" },
  { id: "practice", label: "Practice", hint: "Nades, prefire and free movement" },
  { id: "duels", label: "Duels", hint: "1v1 / 2v2 arena" },
  { id: "competitive", label: "Competitive", hint: "Standard 5v5" },
] as const;

export type GameModeId = (typeof GAME_MODES)[number]["id"];

export const isGameMode = (value: string): value is GameModeId =>
  GAME_MODES.some((m) => m.id === value);
