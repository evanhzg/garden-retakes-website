using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace PkmnClient
{
    public class PkmnClient : IPkmnClient
    {
        private readonly HttpClient _httpClient;
        private string _baseUrl;

        public string? AccessToken { get; set; }

        public string BaseUrl
        {
            get => _baseUrl;
            set
            {
                if (string.IsNullOrWhiteSpace(value))
                    throw new ArgumentException("Base URL cannot be empty.", nameof(value));
                _baseUrl = value.TrimEnd('/');
            }
        }

        private static readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true
        };

        /// <summary>
        /// Instantiates the client. Reuses a provided HttpClient or instantiates a new one.
        /// </summary>
        /// <param name="baseUrl">The base API host URL (defaults to "https://pkmn.retakes.fr").</param>
        /// <param name="httpClient">An optional shared HttpClient instance.</param>
        public PkmnClient(string baseUrl = "https://pkmn.retakes.fr", HttpClient? httpClient = null)
        {
            _httpClient = httpClient ?? new HttpClient();
            _baseUrl = baseUrl.TrimEnd('/');
        }

        #region Helper Request Methods

        private string BuildUrl(string path)
        {
            var cleanPath = path.StartsWith("/") ? path : "/" + path;
            return $"{_baseUrl}{cleanPath}";
        }

        private async Task<T> SendAsync<T>(HttpMethod method, string path, object? payload = null, CancellationToken cancellationToken = default)
        {
            using var request = new HttpRequestMessage(method, BuildUrl(path));

            if (!string.IsNullOrEmpty(AccessToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", AccessToken);
            }

            if (payload != null)
            {
                string json = JsonSerializer.Serialize(payload, payload.GetType(), _jsonOptions);
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");
            }

            HttpResponseMessage response;
            try
            {
                response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                throw new PkmnException($"Network request failed: {ex.Message}", HttpStatusCode.ServiceUnavailable, null, null);
            }

            using (response)
            {
                if (!response.IsSuccessStatusCode)
                {
                    await HandleErrorResponseAsync(response, cancellationToken).ConfigureAwait(false);
                }

                string responseJson = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                try
                {
                    var result = JsonSerializer.Deserialize<T>(responseJson, _jsonOptions);
                    if (result == null)
                    {
                        throw new PkmnException("Response parsed as null.", response.StatusCode, responseJson, null);
                    }
                    return result;
                }
                catch (JsonException ex)
                {
                    throw new PkmnException($"Failed to deserialize response: {ex.Message}", response.StatusCode, responseJson, null);
                }
            }
        }

        private async Task HandleErrorResponseAsync(HttpResponseMessage response, CancellationToken cancellationToken)
        {
            string? body = null;
            string? apiError = null;
            try
            {
                body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                if (!string.IsNullOrEmpty(body))
                {
                    var err = JsonSerializer.Deserialize<ErrorResponse>(body, _jsonOptions);
                    apiError = err?.Error;
                }
            }
            catch
            {
                // Fallback if parsing error response fails
            }

            var message = !string.IsNullOrEmpty(apiError)
                ? apiError!
                : $"Request failed with status code {response.StatusCode}.";

            throw new PkmnException(message, response.StatusCode, body, apiError);
        }

        #endregion

        #region Auth Operations

        public async Task<DeviceStartResponse> StartDevicePairingAsync(string? deviceName = null, CancellationToken cancellationToken = default)
        {
            var payload = new DeviceStartRequest { DeviceName = deviceName };
            return await SendAsync<DeviceStartResponse>(HttpMethod.Post, "/api/pkmn/auth/device/start", payload, cancellationToken).ConfigureAwait(false);
        }

        public async Task<DevicePollResponse> PollDevicePairingAsync(string pollToken, CancellationToken cancellationToken = default)
        {
            try
            {
                var payload = new DevicePollRequest { PollToken = pollToken };
                return await SendAsync<DevicePollResponse>(HttpMethod.Post, "/api/pkmn/auth/device/poll", payload, cancellationToken).ConfigureAwait(false);
            }
            catch (PkmnException ex) when (ex.StatusCode == HttpStatusCode.Gone) // 410 Expired
            {
                return new DevicePollResponse { Status = "expired" };
            }
            catch (PkmnException ex) when (ex.StatusCode == HttpStatusCode.NotFound) // 404 Unknown/Consumed
            {
                return new DevicePollResponse { Status = "not_found" };
            }
        }

        public async Task<DeviceConfirmResponse> ConfirmDevicePairingAsync(string code, CancellationToken cancellationToken = default)
        {
            var payload = new DeviceConfirmRequest { Code = code };
            return await SendAsync<DeviceConfirmResponse>(HttpMethod.Post, "/api/pkmn/auth/device/confirm", payload, cancellationToken).ConfigureAwait(false);
        }

        public async Task<bool> LogoutAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<GenericOkResponse>(HttpMethod.Post, "/api/pkmn/auth/logout", null, cancellationToken).ConfigureAwait(false);
            return result.Ok;
        }

        public async Task<TokenRefreshResponse> RefreshTokenAsync(CancellationToken cancellationToken = default)
        {
            return await SendAsync<TokenRefreshResponse>(HttpMethod.Post, "/api/pkmn/auth/refresh", null, cancellationToken).ConfigureAwait(false);
        }

        public async Task<List<SessionInfo>> GetSessionsAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<SessionListResponse>(HttpMethod.Get, "/api/pkmn/auth/sessions", null, cancellationToken).ConfigureAwait(false);
            return result.Sessions;
        }

        public async Task<bool> RevokeSessionAsync(string sessionId, CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<GenericOkResponse>(HttpMethod.Delete, $"/api/pkmn/auth/sessions/{sessionId}", null, cancellationToken).ConfigureAwait(false);
            return result.Ok;
        }

        #endregion

        #region Trainer & Identity Operations

        public async Task<TrainerSave> GetTrainerSaveAsync(CancellationToken cancellationToken = default)
        {
            return await SendAsync<TrainerSave>(HttpMethod.Get, "/api/pkmn/v1/trainer", null, cancellationToken).ConfigureAwait(false);
        }

        public async Task<bool> UpdateTrainerSaveAsync(TrainerUpdatePayload payload, CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<GenericOkResponse>(HttpMethod.Put, "/api/pkmn/v1/trainer", payload, cancellationToken).ConfigureAwait(false);
            return result.Ok;
        }

        public async Task<MeResponse> GetMeAsync(CancellationToken cancellationToken = default)
        {
            return await SendAsync<MeResponse>(HttpMethod.Get, "/api/pkmn/v1/me", null, cancellationToken).ConfigureAwait(false);
        }

        public async Task<TrainerStats> GetTrainerStatsAsync(CancellationToken cancellationToken = default)
        {
            return await SendAsync<TrainerStats>(HttpMethod.Get, "/api/pkmn/v1/stats", null, cancellationToken).ConfigureAwait(false);
        }

        #endregion

        #region Badges Operations

        public async Task<List<string>> GetBadgesAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<BadgeListResponse>(HttpMethod.Get, "/api/pkmn/v1/badges", null, cancellationToken).ConfigureAwait(false);
            return result.Badges;
        }

        public async Task<List<string>> AwardBadgeAsync(string badgeName, CancellationToken cancellationToken = default)
        {
            var payload = new BadgePatchPayload { Badge = badgeName };
            var result = await SendAsync<BadgeListResponse>(new HttpMethod("PATCH"), "/api/pkmn/v1/badges", payload, cancellationToken).ConfigureAwait(false);
            return result.Badges;
        }

        #endregion

        #region Inventory Operations

        public async Task<List<BagItem>> GetInventoryAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<InventoryGetResponse>(HttpMethod.Get, "/api/pkmn/v1/inventory", null, cancellationToken).ConfigureAwait(false);
            return result.Bag;
        }

        public async Task<List<BagItem>> UpdateInventoryAsync(Dictionary<string, int> deltas, CancellationToken cancellationToken = default)
        {
            var payload = new InventoryPatchPayload { Deltas = deltas };
            var result = await SendAsync<InventoryPatchResponse>(new HttpMethod("PATCH"), "/api/pkmn/v1/inventory", payload, cancellationToken).ConfigureAwait(false);
            return result.Bag;
        }

        #endregion

        #region PC Box Storage Operations

        public async Task<List<PkmnBox>> GetBoxesAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<BoxListResponse>(HttpMethod.Get, "/api/pkmn/v1/boxes", null, cancellationToken).ConfigureAwait(false);
            return result.Boxes;
        }

        public async Task<PkmnBox> CreateBoxAsync(string? boxName = null, CancellationToken cancellationToken = default)
        {
            var payload = new CreateBoxRequest { Name = boxName };
            return await SendAsync<PkmnBox>(HttpMethod.Post, "/api/pkmn/v1/boxes", payload, cancellationToken).ConfigureAwait(false);
        }

        #endregion

        #region Pokémon Operations

        public async Task<bool> UpdatePokemonAsync(string pokemonId, PatchPokemonRequest request, CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<GenericOkResponse>(new HttpMethod("PATCH"), $"/api/pkmn/v1/mon/{pokemonId}", request, cancellationToken).ConfigureAwait(false);
            return result.Ok;
        }

        public async Task<bool> ReleasePokemonAsync(string pokemonId, CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<GenericOkResponse>(HttpMethod.Delete, $"/api/pkmn/v1/mon/{pokemonId}", null, cancellationToken).ConfigureAwait(false);
            return result.Ok;
        }

        public async Task<MovePokemonResponse> MovePokemonAsync(string pokemonId, string? targetBoxId, CancellationToken cancellationToken = default)
        {
            var payload = new MovePokemonRequest { BoxId = targetBoxId };
            return await SendAsync<MovePokemonResponse>(HttpMethod.Post, $"/api/pkmn/v1/mon/{pokemonId}/move", payload, cancellationToken).ConfigureAwait(false);
        }

        public async Task<List<PartyMon>> GetPartyAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<PartyGetResponse>(HttpMethod.Get, "/api/pkmn/v1/party", null, cancellationToken).ConfigureAwait(false);
            return result.Party;
        }

        #endregion

        #region Realtime & Leaderboard Operations

        public async Task<RealtimeConnectInfo> GetRealtimeConnectInfoAsync(CancellationToken cancellationToken = default)
        {
            return await SendAsync<RealtimeConnectInfo>(HttpMethod.Get, "/api/pkmn/v1/realtime/connect-info", null, cancellationToken).ConfigureAwait(false);
        }

        public async Task<LeaderboardResponse> GetLeaderboardAsync(string leaderboardType = "species", CancellationToken cancellationToken = default)
        {
            var cleanType = leaderboardType == "badges" ? "badges" : "species";
            return await SendAsync<LeaderboardResponse>(HttpMethod.Get, $"/api/pkmn/v1/leaderboard?type={cleanType}", null, cancellationToken).ConfigureAwait(false);
        }

        #endregion
    }
}
