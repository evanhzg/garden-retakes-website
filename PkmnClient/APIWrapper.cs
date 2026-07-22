using System;
using System.Collections.Generic;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine.Networking;

namespace PkmnClient
{
    public class APIWrapper : IPkmnClient
    {
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
        /// Instantiates the Unity 6 PKMN API Client.
        /// </summary>
        /// <param name="baseUrl">The base API host URL (defaults to "https://pkmn.retakes.fr").</param>
        public APIWrapper(string baseUrl = "https://pkmn.retakes.fr")
        {
            _baseUrl = baseUrl.TrimEnd('/');
        }

        #region Helper Request Methods

        private string BuildUrl(string path)
        {
            var cleanPath = path.StartsWith("/") ? path : "/" + path;
            return $"{_baseUrl}{cleanPath}";
        }

        private async Task<T> SendAsync<T>(string method, string path, object? payload = null, CancellationToken cancellationToken = default)
        {
            string url = BuildUrl(path);
            using var webRequest = new UnityWebRequest(url, method);

            if (!string.IsNullOrEmpty(AccessToken))
            {
                webRequest.SetRequestHeader("Authorization", $"Bearer {AccessToken}");
            }

            if (payload != null)
            {
                string json = JsonSerializer.Serialize(payload, payload.GetType(), _jsonOptions);
                byte[] bodyRaw = Encoding.UTF8.GetBytes(json);
                webRequest.uploadHandler = new UploadHandlerRaw(bodyRaw);
                webRequest.SetRequestHeader("Content-Type", "application/json");
            }

            webRequest.downloadHandler = new DownloadHandlerBuffer();

            try
            {
                await SendWebRequestAsync(webRequest, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new PkmnException($"Network request failed: {ex.Message}", HttpStatusCode.ServiceUnavailable, null, null);
            }

            if (webRequest.result == UnityWebRequest.Result.ConnectionError || webRequest.result == UnityWebRequest.Result.ProtocolError)
            {
                HttpStatusCode statusCode = (HttpStatusCode)webRequest.responseCode;
                string responseBody = webRequest.downloadHandler.text;
                string? apiError = null;

                try
                {
                    if (!string.IsNullOrEmpty(responseBody))
                    {
                        var err = JsonSerializer.Deserialize<ErrorResponse>(responseBody, _jsonOptions);
                        apiError = err?.Error;
                    }
                }
                catch
                {
                    // Fallback
                }

                var message = !string.IsNullOrEmpty(apiError)
                    ? apiError!
                    : $"Request failed: {webRequest.error} (HTTP {(int)statusCode})";

                throw new PkmnException(message, statusCode, responseBody, apiError);
            }

            string responseJson = webRequest.downloadHandler.text;
            try
            {
                var result = JsonSerializer.Deserialize<T>(responseJson, _jsonOptions);
                if (result == null)
                {
                    throw new PkmnException("Response parsed as null.", (HttpStatusCode)webRequest.responseCode, responseJson, null);
                }
                return result;
            }
            catch (JsonException ex)
            {
                throw new PkmnException($"Failed to deserialize response: {ex.Message}", (HttpStatusCode)webRequest.responseCode, responseJson, null);
            }
        }

        private Task<UnityWebRequest> SendWebRequestAsync(UnityWebRequest request, CancellationToken cancellationToken)
        {
            var tcs = new TaskCompletionSource<UnityWebRequest>();
            var op = request.SendWebRequest();

            if (op.isDone)
            {
                tcs.SetResult(request);
            }
            else
            {
                op.completed += _ => tcs.TrySetResult(request);
                cancellationToken.Register(() =>
                {
                    request.Abort();
                    tcs.TrySetCanceled(cancellationToken);
                });
            }

            return tcs.Task;
        }

        #endregion

        #region Auth Operations

        public async Task<DeviceStartResponse> StartDevicePairingAsync(string? deviceName = null, CancellationToken cancellationToken = default)
        {
            var payload = new DeviceStartRequest { DeviceName = deviceName };
            return await SendAsync<DeviceStartResponse>("POST", "/api/pkmn/auth/device/start", payload, cancellationToken).ConfigureAwait(false);
        }

        public async Task<DevicePollResponse> PollDevicePairingAsync(string pollToken, CancellationToken cancellationToken = default)
        {
            try
            {
                var payload = new DevicePollRequest { PollToken = pollToken };
                return await SendAsync<DevicePollResponse>("POST", "/api/pkmn/auth/device/poll", payload, cancellationToken).ConfigureAwait(false);
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
            return await SendAsync<DeviceConfirmResponse>("POST", "/api/pkmn/auth/device/confirm", payload, cancellationToken).ConfigureAwait(false);
        }

        public async Task<bool> LogoutAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<GenericOkResponse>("POST", "/api/pkmn/auth/logout", null, cancellationToken).ConfigureAwait(false);
            return result.Ok;
        }

        public async Task<TokenRefreshResponse> RefreshTokenAsync(CancellationToken cancellationToken = default)
        {
            return await SendAsync<TokenRefreshResponse>("POST", "/api/pkmn/auth/refresh", null, cancellationToken).ConfigureAwait(false);
        }

        public async Task<List<SessionInfo>> GetSessionsAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<SessionListResponse>("GET", "/api/pkmn/auth/sessions", null, cancellationToken).ConfigureAwait(false);
            return result.Sessions;
        }

        public async Task<bool> RevokeSessionAsync(string sessionId, CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<GenericOkResponse>("DELETE", $"/api/pkmn/auth/sessions/{sessionId}", null, cancellationToken).ConfigureAwait(false);
            return result.Ok;
        }

        #endregion

        #region Trainer & Identity Operations

        public async Task<TrainerSave> GetTrainerSaveAsync(CancellationToken cancellationToken = default)
        {
            return await SendAsync<TrainerSave>("GET", "/api/pkmn/v1/trainer", null, cancellationToken).ConfigureAwait(false);
        }

        public async Task<bool> UpdateTrainerSaveAsync(TrainerUpdatePayload payload, CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<GenericOkResponse>("PUT", "/api/pkmn/v1/trainer", payload, cancellationToken).ConfigureAwait(false);
            return result.Ok;
        }

        public async Task<MeResponse> GetMeAsync(CancellationToken cancellationToken = default)
        {
            return await SendAsync<MeResponse>("GET", "/api/pkmn/v1/me", null, cancellationToken).ConfigureAwait(false);
        }

        public async Task<TrainerStats> GetTrainerStatsAsync(CancellationToken cancellationToken = default)
        {
            return await SendAsync<TrainerStats>("GET", "/api/pkmn/v1/stats", null, cancellationToken).ConfigureAwait(false);
        }

        #endregion

        #region Badges Operations

        public async Task<List<string>> GetBadgesAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<BadgeListResponse>("GET", "/api/pkmn/v1/badges", null, cancellationToken).ConfigureAwait(false);
            return result.Badges;
        }

        public async Task<List<string>> AwardBadgeAsync(string badgeName, CancellationToken cancellationToken = default)
        {
            var payload = new BadgePatchPayload { Badge = badgeName };
            var result = await SendAsync<BadgeListResponse>("PATCH", "/api/pkmn/v1/badges", payload, cancellationToken).ConfigureAwait(false);
            return result.Badges;
        }

        #endregion

        #region Inventory Operations

        public async Task<List<BagItem>> GetInventoryAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<InventoryGetResponse>("GET", "/api/pkmn/v1/inventory", null, cancellationToken).ConfigureAwait(false);
            return result.Bag;
        }

        public async Task<List<BagItem>> UpdateInventoryAsync(Dictionary<string, int> deltas, CancellationToken cancellationToken = default)
        {
            var payload = new InventoryPatchPayload { Deltas = deltas };
            var result = await SendAsync<InventoryPatchResponse>("PATCH", "/api/pkmn/v1/inventory", payload, cancellationToken).ConfigureAwait(false);
            return result.Bag;
        }

        #endregion

        #region PC Box Storage Operations

        public async Task<List<PkmnBox>> GetBoxesAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<BoxListResponse>("GET", "/api/pkmn/v1/boxes", null, cancellationToken).ConfigureAwait(false);
            return result.Boxes;
        }

        public async Task<PkmnBox> CreateBoxAsync(string? boxName = null, CancellationToken cancellationToken = default)
        {
            var payload = new CreateBoxRequest { Name = boxName };
            return await SendAsync<PkmnBox>("POST", "/api/pkmn/v1/boxes", payload, cancellationToken).ConfigureAwait(false);
        }

        #endregion

        #region Pokémon Operations

        public async Task<bool> UpdatePokemonAsync(string pokemonId, PatchPokemonRequest request, CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<GenericOkResponse>("PATCH", $"/api/pkmn/v1/mon/{pokemonId}", request, cancellationToken).ConfigureAwait(false);
            return result.Ok;
        }

        public async Task<bool> ReleasePokemonAsync(string pokemonId, CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<GenericOkResponse>("DELETE", $"/api/pkmn/v1/mon/{pokemonId}", null, cancellationToken).ConfigureAwait(false);
            return result.Ok;
        }

        public async Task<MovePokemonResponse> MovePokemonAsync(string pokemonId, string? targetBoxId, CancellationToken cancellationToken = default)
        {
            var payload = new MovePokemonRequest { BoxId = targetBoxId };
            return await SendAsync<MovePokemonResponse>("POST", $"/api/pkmn/v1/mon/{pokemonId}/move", payload, cancellationToken).ConfigureAwait(false);
        }

        public async Task<List<PartyMon>> GetPartyAsync(CancellationToken cancellationToken = default)
        {
            var result = await SendAsync<PartyGetResponse>("GET", "/api/pkmn/v1/party", null, cancellationToken).ConfigureAwait(false);
            return result.Party;
        }

        #endregion

        #region Realtime & Leaderboard Operations

        public async Task<RealtimeConnectInfo> GetRealtimeConnectInfoAsync(CancellationToken cancellationToken = default)
        {
            return await SendAsync<RealtimeConnectInfo>("GET", "/api/pkmn/v1/realtime/connect-info", null, cancellationToken).ConfigureAwait(false);
        }

        public async Task<LeaderboardResponse> GetLeaderboardAsync(string leaderboardType = "species", CancellationToken cancellationToken = default)
        {
            var cleanType = leaderboardType == "badges" ? "badges" : "species";
            return await SendAsync<LeaderboardResponse>("GET", $"/api/pkmn/v1/leaderboard?type={cleanType}", null, cancellationToken).ConfigureAwait(false);
        }

        #endregion
    }
}
