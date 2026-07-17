// Single source of truth for docs.retakes.fr (rendered by app/docs).
// RULE: any new/changed API route or socket event updates this file in the same commit.

export type ApiParam = {
  name: string;
  in: "path" | "query" | "body" | "header";
  type: string;
  required?: boolean;
  description: string;
};

export type ApiEndpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  auth: string;
  params?: ApiParam[];
  requestExample?: string;
  responseExample?: string;
  notes?: string[];
};

export type SocketEvent = {
  direction: "client→server" | "server→client";
  name: string;
  payload: string;
  description: string;
};

export type DocSection = {
  slug: string;
  title: string;
  intro: string;
  endpoints?: ApiEndpoint[];
  socketEvents?: SocketEvent[];
};

export const AUTH_KINDS = {
  none: "Public — no auth",
  session: "Steam session cookie (log in via /api/auth/steam/login)",
  admin: "Admin — session with GardenAdmins level, or ?key=<INVSIM_API_KEY>",
  apikey: "Shared secret — INVSIM_API_KEY (server↔server, plugin↔website)",
  bearerSteamId: "Authorization: Bearer <steamId64> (client-asserted — INTERNAL, will be hardened)",
  dev: "Development only (blocked in production)",
} as const;

export const DOC_SECTIONS: DocSection[] = [
  {
    slug: "auth",
    title: "Authentication",
    intro:
      "The website uses Steam OpenID. A successful login sets a signed HttpOnly session cookie (garden_session) that server routes read via getSession(). There are no user-issued API tokens; browser calls ride on the cookie.",
    endpoints: [
      {
        method: "GET",
        path: "/api/auth/steam/login",
        summary: "Redirects to Steam OpenID. On success Steam redirects to the callback.",
        auth: AUTH_KINDS.none,
      },
      {
        method: "GET",
        path: "/api/auth/steam/callback",
        summary: "Steam OpenID return URL. Validates the assertion, sets the session cookie, redirects to the site.",
        auth: AUTH_KINDS.none,
      },
      {
        method: "GET",
        path: "/api/auth/session",
        summary: "Current session info for the browser.",
        auth: AUTH_KINDS.none,
        responseExample: `{
  "authenticated": true,
  "steamId": "76561198012345678",
  "name": "Jean-Claude",
  "avatar": "https://avatars.steamstatic.com/…",
  "adminLevel": 2
}`,
        notes: ["Returns { authenticated: false } when no valid cookie is present."],
      },
      {
        method: "POST",
        path: "/api/auth/logout",
        summary: "Clears the session cookie (GET also supported).",
        auth: AUTH_KINDS.session,
      },
      {
        method: "GET",
        path: "/api/auth/mock",
        summary: "Dev-only fake login: sets a session for an arbitrary SteamID.",
        auth: AUTH_KINDS.dev,
        params: [
          { name: "steamId", in: "query", type: "string", description: "SteamID64 to impersonate (default 76561198012345678)" },
          { name: "name", in: "query", type: "string", description: "Display name (default DevPlayer)" },
        ],
      },
    ],
  },
  {
    slug: "players",
    title: "Players & Profiles",
    intro:
      "Display names resolve through lib/names.ts: website override (GardenNameOverrides) → last in-game name (PlayerProfiles) → raw SteamID64. Web profiles (avatar/bio/country/pop) live in GardenWebProfiles.",
    endpoints: [
      {
        method: "POST",
        path: "/api/players/resolve",
        summary: "Batch display-name + avatar lookup (used by the Games Hub).",
        auth: AUTH_KINDS.none,
        params: [
          { name: "ids", in: "body", type: "string[]", required: true, description: "SteamID64s (max 64, non-numeric ids ignored)" },
        ],
        requestExample: `{ "ids": ["76561198012345678"] }`,
        responseExample: `{
  "players": {
    "76561198012345678": { "name": "Jean-Claude", "avatar": "https://…" }
  }
}`,
      },
      {
        method: "GET",
        path: "/api/profile",
        summary: "The logged-in user's own profile (name override, avatar, bio, country, pop config).",
        auth: AUTH_KINDS.session,
      },
      {
        method: "POST",
        path: "/api/profile",
        summary: "Update own profile. Writes GardenNameOverrides + GardenWebProfiles; empty name reverts to the Steam name.",
        auth: AUTH_KINDS.session,
        params: [
          { name: "name", in: "body", type: "string", description: "Display-name override (also used in game)" },
          { name: "avatarUrl", in: "body", type: "string|null", description: "https image URL" },
          { name: "bio", in: "body", type: "string", description: "Short bio" },
          { name: "country", in: "body", type: "string", description: "ISO country code" },
        ],
      },
    ],
  },
  {
    slug: "inventory",
    title: "Inventory & Catalog",
    intro:
      "The inventory simulator. Catalog endpoints are public and served from @ianlucas/cs2-lib; the inventory store is per-Steam-account.",
    endpoints: [
      {
        method: "GET",
        path: "/api/weapons",
        summary: "Weapon catalog (ids, names, categories) for the workspace.",
        auth: AUTH_KINDS.none,
      },
      {
        method: "GET",
        path: "/api/skins",
        summary: "Skins for a weapon.",
        auth: AUTH_KINDS.none,
        params: [{ name: "weapon", in: "query", type: "string", required: true, description: "Weapon def name/id" }],
      },
      {
        method: "GET",
        path: "/api/stickers",
        summary: "Sticker catalog search.",
        auth: AUTH_KINDS.none,
        params: [{ name: "q", in: "query", type: "string", description: "Name filter" }],
      },
      {
        method: "GET",
        path: "/api/inventory",
        summary: "The logged-in user's full inventory store (loadouts, items, preferences).",
        auth: AUTH_KINDS.session,
      },
      {
        method: "POST",
        path: "/api/inventory",
        summary: "Replace the logged-in user's inventory store (normalised server-side).",
        auth: AUTH_KINDS.session,
      },
      {
        method: "GET",
        path: "/api/inventory/{steamId}",
        summary: "Read-only inventory view of any player (feeds the public profile showcase).",
        auth: AUTH_KINDS.none,
        params: [{ name: "steamId", in: "path", type: "string", required: true, description: "SteamID64" }],
      },
    ],
  },
  {
    slug: "loadouts",
    title: "Loadouts (plugin contract)",
    intro:
      "The website↔game-server contract used by the Garden-inventory plugin. EquippedV4 is what the plugin fetches to dress a player; select-loadout and borrow are called BY the plugin with the shared key.",
    endpoints: [
      {
        method: "GET",
        path: "/api/equipped/v4/{steamid}.json",
        summary: "EquippedV4Response — every equipped item for both sides (weapons/knives/gloves/agents/music/pin + stickers/wear/seed).",
        auth: AUTH_KINDS.none,
        params: [
          { name: "steamid", in: "path", type: "string", required: true, description: "SteamID64" },
          { name: "loadout", in: "query", type: "string", description: "Loadout name or share-key override (borrow preview)" },
        ],
      },
      {
        method: "GET",
        path: "/api/loadouts/{steamid}.json",
        summary: "Loadout names + which one is active (feeds !loadouts in game).",
        auth: AUTH_KINDS.none,
        params: [{ name: "steamid", in: "path", type: "string", required: true, description: "SteamID64" }],
        responseExample: `{ "loadouts": [ { "name": "green", "active": true }, { "name": "tournament", "active": false } ] }`,
      },
      {
        method: "POST",
        path: "/api/select-loadout",
        summary: "Switch a player's active loadout (called by css_loadout in game).",
        auth: AUTH_KINDS.apikey,
        params: [
          { name: "apiKey", in: "body", type: "string", required: true, description: "INVSIM_API_KEY" },
          { name: "steamId", in: "body", type: "string", required: true, description: "SteamID64" },
          { name: "loadout", in: "body", type: "string", required: true, description: "Loadout name (case-insensitive)" },
        ],
      },
      {
        method: "POST",
        path: "/api/loadout/share",
        summary: "Create/refresh a share-key for one of your loadouts (the /borrow flow).",
        auth: AUTH_KINDS.session,
      },
      {
        method: "POST",
        path: "/api/loadout/borrow",
        summary: "Apply a shared loadout to a player so the next equipped fetch serves it (called by !borrow in game).",
        auth: AUTH_KINDS.apikey,
      },
      {
        method: "GET",
        path: "/api/loadout/borrow/{key}",
        summary: "Preview a shared loadout by its share-key.",
        auth: AUTH_KINDS.none,
        params: [{ name: "key", in: "path", type: "string", required: true, description: "Share-key" }],
      },
      {
        method: "GET",
        path: "/api/loadout/featured",
        summary: "Featured preset loadouts (curated share-keys).",
        auth: AUTH_KINDS.none,
      },
      {
        method: "DELETE",
        path: "/api/loadout/featured/{key}",
        summary: "Remove a featured preset.",
        auth: AUTH_KINDS.admin,
        params: [{ name: "key", in: "path", type: "string", required: true, description: "Share-key" }],
      },
    ],
  },
  {
    slug: "live",
    title: "Live & Stats",
    intro: "Live server state for the spectator dashboard and aggregated stats data.",
    endpoints: [
      {
        method: "GET",
        path: "/api/live",
        summary: "Live match state: map, players, scores, round events (admin context unlocks admin controls).",
        auth: AUTH_KINDS.none,
      },
      {
        method: "GET",
        path: "/api/stats/heatmaps",
        summary: "Kill/death heatmap points for a player or the whole server on a map.",
        auth: AUTH_KINDS.none,
        params: [
          { name: "steamId", in: "query", type: "string", description: "SteamID64 (omit for global)" },
          { name: "map", in: "query", type: "string", description: "Map name (default de_mirage)" },
        ],
      },
    ],
  },
  {
    slug: "admin",
    title: "Admin",
    intro:
      "All admin routes accept either a logged-in session whose SteamID has a GardenAdmins level, or ?key=<INVSIM_API_KEY> for tooling. Every action is written to the GardenAdminLog audit trail.",
    endpoints: [
      {
        method: "GET",
        path: "/api/admin/players",
        summary: "Searchable player list (PlayerProfiles) with roles/bans.",
        auth: AUTH_KINDS.admin,
        params: [
          { name: "q", in: "query", type: "string", description: "Name/SteamID filter" },
          { name: "key", in: "query", type: "string", description: "Alternative to the session (INVSIM_API_KEY)" },
        ],
      },
      {
        method: "POST",
        path: "/api/admin/action",
        summary: "Perform an admin action: rename / kick / slay / ban / unban / map change / role set. DB-authoritative + live effect via css_g* over RCON.",
        auth: AUTH_KINDS.admin,
      },
      {
        method: "POST",
        path: "/api/admin/rcon",
        summary: "Raw RCON command to the game server (Owner-level; audit-logged).",
        auth: AUTH_KINDS.admin,
        requestExample: `{ "command": "status" }`,
      },
    ],
  },
  {
    slug: "social",
    title: "Friends & Social",
    intro:
      "Friend relationships for the Games Hub (WebFriendship). ⚠ These routes currently authenticate with a client-asserted Bearer SteamID header — treat them as INTERNAL until they are moved onto the session cookie.",
    endpoints: [
      {
        method: "GET",
        path: "/api/friends",
        summary: "List friendships (accepted + pending) with resolved names/avatars.",
        auth: AUTH_KINDS.bearerSteamId,
      },
      {
        method: "POST",
        path: "/api/friends",
        summary: "Send a friend request.",
        auth: AUTH_KINDS.bearerSteamId,
        params: [{ name: "targetSteamId", in: "body", type: "string", required: true, description: "SteamID64 to befriend" }],
      },
      {
        method: "PATCH",
        path: "/api/friends/{id}",
        summary: "Accept or reject a pending request.",
        auth: AUTH_KINDS.bearerSteamId,
        params: [
          { name: "id", in: "path", type: "number", required: true, description: "Friendship row id" },
          { name: "action", in: "body", type: "\"ACCEPT\" | \"REJECT\"", required: true, description: "Decision" },
        ],
      },
      {
        method: "POST",
        path: "/api/friends/invite",
        summary: "Invite a friend to a lobby (relayed as a socket notification).",
        auth: AUTH_KINDS.bearerSteamId,
        params: [
          { name: "targetSteamId", in: "body", type: "string", required: true, description: "Friend to invite" },
          { name: "lobbyId", in: "body", type: "string", required: true, description: "Lobby id" },
          { name: "password", in: "body", type: "string", description: "Private-lobby password to include" },
        ],
      },
    ],
  },
  {
    slug: "socket",
    title: "Games Socket Protocol",
    intro:
      "The Games Hub runs on a standalone Socket.IO server (port 3001 in dev; NEXT_PUBLIC_SOCKET_URL in prod). Flow: connect → emit authenticate → wait for authenticated → lobby events. Per-game events (uno_*, monopoly_*, codenames_*, cah_*, meme_*, skribbl_*) follow the same pattern: client emits an action, server broadcasts the personalised game state.",
    socketEvents: [
      { direction: "client→server", name: "authenticate", payload: "{ steamId }", description: "Identify this connection. Must be first." },
      { direction: "server→client", name: "authenticated", payload: "{ steamId }", description: "Ack — steamId-dependent events are now safe." },
      { direction: "client→server", name: "lobby_create", payload: "{ name, isPrivate, password, currentGame }", description: "Create a universal lobby (currentGame e.g. \"uno_en\" or \"none\")." },
      { direction: "client→server", name: "lobby_join", payload: "{ lobbyId, password }", description: "Join or reconnect. Reconnects skip the password check." },
      { direction: "client→server", name: "lobby_leave", payload: "—", description: "Leave immediately." },
      { direction: "client→server", name: "lobby_ready", payload: "—", description: "Toggle ready. Host does not ready; host starts." },
      { direction: "client→server", name: "lobby_change_game", payload: "{ game }", description: "Host only. \"<base>_<en|fr>\"." },
      { direction: "client→server", name: "lobby_start_game", payload: "{ modifiers?, settings? }", description: "Host only; requires every other connected human ready." },
      { direction: "client→server", name: "lobby_add_bot", payload: "—", description: "Host only. Bots get garden names." },
      { direction: "client→server", name: "lobby_kick", payload: "steamId", description: "Host only; any player or bot." },
      { direction: "client→server", name: "lobby_return", payload: "—", description: "Host only: end the game, back to WAITING." },
      { direction: "client→server", name: "get_public_lobbies", payload: "—", description: "Request the public lobby list." },
      { direction: "client→server", name: "send_message", payload: "{ type: 'lobby'|'direct', to?, content }", description: "Lobby chat or DM." },
      { direction: "server→client", name: "lobby_state", payload: "LobbyState", description: "Full lobby snapshot: id, host, name, isPrivate, currentGame, status, maxPlayers, players[{steamId, ready, isBot, connected, botName?}], playerCount." },
      { direction: "server→client", name: "public_lobbies_sync", payload: "LobbyState[]", description: "All public lobbies (broadcast on every change)." },
      { direction: "server→client", name: "chat_history", payload: "Message[]", description: "Last 50 lobby messages, sent on join." },
      { direction: "server→client", name: "new_message", payload: "{ from, content, type, subject?, ts }", description: "Chat. SYSTEM messages carry {player} + subject steamId for client-side name resolution." },
      { direction: "server→client", name: "lobby_error", payload: "{ message }", description: "Join-blocking errors (not found / invalid password / full / in progress)." },
      { direction: "server→client", name: "lobby_toast", payload: "{ message }", description: "Soft action failures (e.g. not everyone ready)." },
      { direction: "server→client", name: "lobby_kicked", payload: "{ lobbyId }", description: "You were kicked — leave the page." },
      { direction: "server→client", name: "user_online / user_offline / online_friends_sync", payload: "{ steamId } / string[]", description: "Presence for the friends sidebar." },
      { direction: "server→client", name: "notification", payload: "Notification", description: "Friend requests, lobby invites (relayed)." },
      { direction: "server→client", name: "uno_state / monopoly_state / codenames_state / cah_state / meme_state / skribbl_state", payload: "GameState", description: "Personalised game snapshots (own hand visible, others counted)." },
    ],
  },
];

export function getDocSection(slug: string): DocSection | undefined {
  return DOC_SECTIONS.find((s) => s.slug === slug);
}
