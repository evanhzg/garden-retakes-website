using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace PkmnClient
{
    public interface IPkmnClient
    {
        /// <summary>
        /// The active Bearer Access Token used for authenticated requests.
        /// </summary>
        string? AccessToken { get; set; }

        /// <summary>
        /// The base URL of the Garden PKMN website/API host (e.g. "https://pkmn.retakes.fr" or "https://pkmn.dev.retakes.fr").
        /// </summary>
        string BaseUrl { get; set; }

        #region Auth Operations

        /// <summary>
        /// Starts the pairing flow for a standalone game client. Returns a short code for the user to visit on the website and a poll token.
        /// Endpoint: POST /api/pkmn/auth/device/start
        /// </summary>
        Task<DeviceStartResponse> StartDevicePairingAsync(string? deviceName = null, CancellationToken cancellationToken = default);

        /// <summary>
        /// Polls the pairing status using the poll token received from StartDevicePairingAsync.
        /// Endpoint: POST /api/pkmn/auth/device/poll
        /// </summary>
        Task<DevicePollResponse> PollDevicePairingAsync(string pollToken, CancellationToken cancellationToken = default);

        /// <summary>
        /// Confirms a pairing code (typically executed by a web browser already authenticated with Steam).
        /// Endpoint: POST /api/pkmn/auth/device/confirm
        /// </summary>
        Task<DeviceConfirmResponse> ConfirmDevicePairingAsync(string code, CancellationToken cancellationToken = default);

        /// <summary>
        /// Revokes the current client device's token.
        /// Endpoint: POST /api/pkmn/auth/logout
        /// </summary>
        Task<bool> LogoutAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Rotates the current device's bearer token.
        /// Endpoint: POST /api/pkmn/auth/refresh
        /// </summary>
        Task<TokenRefreshResponse> RefreshTokenAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Lists all active (non-revoked, non-expired) linked devices for the authenticated trainer.
        /// Endpoint: GET /api/pkmn/auth/sessions
        /// </summary>
        Task<List<SessionInfo>> GetSessionsAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Revokes a specific device token using its session ID.
        /// Endpoint: DELETE /api/pkmn/auth/sessions/{sessionId}
        /// </summary>
        Task<bool> RevokeSessionAsync(string sessionId, CancellationToken cancellationToken = default);

        #endregion

        #region Trainer & Identity Operations

        /// <summary>
        /// Fetches the full save blob (position, map, money, badges, bag, active party).
        /// Endpoint: GET /api/pkmn/v1/trainer
        /// </summary>
        Task<TrainerSave> GetTrainerSaveAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Updates the trainer's save checkpoint (map, position coordinates, facing, money).
        /// Endpoint: PUT /api/pkmn/v1/trainer
        /// </summary>
        Task<bool> UpdateTrainerSaveAsync(TrainerUpdatePayload payload, CancellationToken cancellationToken = default);

        /// <summary>
        /// Verifies current Steam ID, name, avatar, and if trainer save and starter are initialized.
        /// Endpoint: GET /api/pkmn/v1/me
        /// </summary>
        Task<MeResponse> GetMeAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Fetches trainer metrics: badges, owned count, party size, unique caught species, money.
        /// Endpoint: GET /api/pkmn/v1/stats
        /// </summary>
        Task<TrainerStats> GetTrainerStatsAsync(CancellationToken cancellationToken = default);

        #endregion

        #region Badges Operations

        /// <summary>
        /// Fetches the list of badges earned by the trainer.
        /// Endpoint: GET /api/pkmn/v1/badges
        /// </summary>
        Task<List<string>> GetBadgesAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Awards a new badge to the trainer.
        /// Endpoint: PATCH /api/pkmn/v1/badges
        /// </summary>
        Task<List<string>> AwardBadgeAsync(string badgeName, CancellationToken cancellationToken = default);

        #endregion

        #region Inventory Operations

        /// <summary>
        /// Fetches the trainer's bag contents.
        /// Endpoint: GET /api/pkmn/v1/inventory
        /// </summary>
        Task<List<BagItem>> GetInventoryAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Mutates item counts by relative deltas.
        /// Endpoint: PATCH /api/pkmn/v1/inventory
        /// </summary>
        Task<List<BagItem>> UpdateInventoryAsync(Dictionary<string, int> deltas, CancellationToken cancellationToken = default);

        #endregion

        #region PC Box Storage Operations

        /// <summary>
        /// Fetches all storage boxes and the Pokémon stored in them.
        /// Endpoint: GET /api/pkmn/v1/boxes
        /// </summary>
        Task<List<PkmnBox>> GetBoxesAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Creates a new PC storage box with a custom or default name.
        /// Endpoint: POST /api/pkmn/v1/boxes
        /// </summary>
        Task<PkmnBox> CreateBoxAsync(string? boxName = null, CancellationToken cancellationToken = default);

        #endregion

        #region Pokémon Operations

        /// <summary>
        /// Updates a Pokémon's nickname, moves, or status.
        /// Endpoint: PATCH /api/pkmn/v1/mon/{pokemonId}
        /// </summary>
        Task<bool> UpdatePokemonAsync(string pokemonId, PatchPokemonRequest request, CancellationToken cancellationToken = default);

        /// <summary>
        /// Releases a Pokémon permanently.
        /// Endpoint: DELETE /api/pkmn/v1/mon/{pokemonId}
        /// </summary>
        Task<bool> ReleasePokemonAsync(string pokemonId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Moves a Pokémon between the active party and a storage box.
        /// Endpoint: POST /api/pkmn/v1/mon/{pokemonId}/move
        /// </summary>
        Task<MovePokemonResponse> MovePokemonAsync(string pokemonId, string? targetBoxId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Fetches the trainer's active party Pokémon (max 6).
        /// Endpoint: GET /api/pkmn/v1/party
        /// </summary>
        Task<List<PartyMon>> GetPartyAsync(CancellationToken cancellationToken = default);

        #endregion

        #region Realtime & Leaderboard Operations

        /// <summary>
        /// Fetches the Socket.IO URL and a short-lived handshake ticket to connect to the realtime game server.
        /// Endpoint: GET /api/pkmn/v1/realtime/connect-info
        /// </summary>
        Task<RealtimeConnectInfo> GetRealtimeConnectInfoAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Fetches the top 20 trainers ranked by species caught ("species") or badges earned ("badges").
        /// Endpoint: GET /api/pkmn/v1/leaderboard
        /// </summary>
        Task<LeaderboardResponse> GetLeaderboardAsync(string leaderboardType = "species", CancellationToken cancellationToken = default);

        #endregion
    }
}
