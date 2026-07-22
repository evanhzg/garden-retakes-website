using System;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace PkmnClient
{
    /// <summary>
    /// Persistent singleton responsible for authenticating against the Garden PKMN API and
    /// caching/refreshing the bearer token across app sessions. Wraps an <see cref="IPkmnClient"/>
    /// instance and keeps its <c>AccessToken</c> header in sync.
    /// </summary>
    public sealed class NetworkManager
    {
        private static readonly Lazy<NetworkManager> _instance =
            new Lazy<NetworkManager>(() => new NetworkManager(), LazyThreadSafetyMode.ExecutionAndPublication);

        /// <summary>
        /// The global singleton instance.
        /// </summary>
        public static NetworkManager Instance => _instance.Value;

        private readonly SemaphoreSlim _authLock = new SemaphoreSlim(1, 1);
        private readonly string _tokenCachePath;
        private CachedToken? _cachedToken;

        /// <summary>
        /// The underlying API client. Its <c>AccessToken</c> is kept in sync by this manager.
        /// </summary>
        public IPkmnClient Client { get; }

        /// <summary>
        /// True if a token is cached and not expired.
        /// </summary>
        public bool IsAuthenticated => _cachedToken != null && _cachedToken.ExpiresAt > DateTimeOffset.UtcNow;

        /// <summary>
        /// Raised after a successful login, refresh, or cache load that updates the active token.
        /// </summary>
        public event Action? TokenUpdated;

        /// <summary>
        /// Raised after logout or when the cached token is cleared.
        /// </summary>
        public event Action? LoggedOut;

        private NetworkManager()
        {
            var baseUrl = Environment.GetEnvironmentVariable("PKMN_API_BASE_URL");
            Client = new PkmnClient(string.IsNullOrWhiteSpace(baseUrl) ? "https://pkmn.retakes.fr" : baseUrl!, new HttpClient());

            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var dir = Path.Combine(appData, "PkmnClient");
            Directory.CreateDirectory(dir);
            _tokenCachePath = Path.Combine(dir, "token.json");

            LoadCachedToken();
        }

        #region Token Cache

        private class CachedToken
        {
            [JsonPropertyName("token")]
            public string Token { get; set; } = string.Empty;

            [JsonPropertyName("expiresAt")]
            public DateTimeOffset ExpiresAt { get; set; }

            [JsonPropertyName("deviceName")]
            public string? DeviceName { get; set; }
        }

        private void LoadCachedToken()
        {
            try
            {
                if (!File.Exists(_tokenCachePath))
                    return;

                var json = File.ReadAllText(_tokenCachePath);
                var cached = JsonSerializer.Deserialize<CachedToken>(json);
                if (cached == null || string.IsNullOrEmpty(cached.Token))
                    return;

                _cachedToken = cached;
                Client.AccessToken = cached.Token;
                TokenUpdated?.Invoke();
            }
            catch
            {
                // Corrupt or unreadable cache; treat as logged out.
                _cachedToken = null;
            }
        }

        private void PersistToken(string token, DateTimeOffset expiresAt, string? deviceName)
        {
            _cachedToken = new CachedToken { Token = token, ExpiresAt = expiresAt, DeviceName = deviceName };
            Client.AccessToken = token;

            try
            {
                var json = JsonSerializer.Serialize(_cachedToken);
                File.WriteAllText(_tokenCachePath, json);
            }
            catch
            {
                // Best-effort persistence; in-memory token still works for this session.
            }

            TokenUpdated?.Invoke();
        }

        private void ClearCachedToken()
        {
            _cachedToken = null;
            Client.AccessToken = null;

            try
            {
                if (File.Exists(_tokenCachePath))
                    File.Delete(_tokenCachePath);
            }
            catch
            {
                // Ignore cleanup failures.
            }

            LoggedOut?.Invoke();
        }

        #endregion

        #region Login / Device Pairing Flow

        /// <summary>
        /// Starts the device pairing flow. Show <see cref="DeviceStartResponse.VerifyUrl"/> and
        /// <see cref="DeviceStartResponse.Code"/> to the user, then call <see cref="WaitForDevicePairingAsync"/>
        /// with the returned poll token.
        /// </summary>
        public Task<DeviceStartResponse> BeginLoginAsync(string? deviceName = null, CancellationToken cancellationToken = default)
        {
            return Client.StartDevicePairingAsync(deviceName, cancellationToken);
        }

        /// <summary>
        /// Polls the pairing endpoint until the user confirms, the code expires, or the token is unknown.
        /// On success, caches and applies the resulting bearer token.
        /// </summary>
        /// <param name="pollToken">The poll token from <see cref="BeginLoginAsync"/>.</param>
        /// <param name="pollInterval">Delay between poll attempts.</param>
        /// <param name="timeout">Maximum time to keep polling before giving up.</param>
        /// <param name="deviceName">Device name to persist alongside the cached token.</param>
        public async Task<DevicePollResponse> WaitForDevicePairingAsync(
            string pollToken,
            TimeSpan? pollInterval = null,
            TimeSpan? timeout = null,
            string? deviceName = null,
            CancellationToken cancellationToken = default)
        {
            var interval = pollInterval ?? TimeSpan.FromSeconds(2);
            var deadline = DateTimeOffset.UtcNow + (timeout ?? TimeSpan.FromMinutes(5));

            await _authLock.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                while (true)
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    var result = await Client.PollDevicePairingAsync(pollToken, cancellationToken).ConfigureAwait(false);

                    switch (result.Status)
                    {
                        case "confirmed":
                        case "linked":
                            if (!string.IsNullOrEmpty(result.Token))
                            {
                                var expiresAt = result.ExpiresAt.HasValue
                                    ? DateTimeOffset.FromUnixTimeSeconds(result.ExpiresAt.Value)
                                    : DateTimeOffset.UtcNow.AddHours(1);
                                PersistToken(result.Token!, expiresAt, deviceName);
                            }
                            return result;

                        case "expired":
                        case "not_found":
                            return result;

                        default:
                            // "pending" or any other in-progress status: keep polling.
                            break;
                    }

                    if (DateTimeOffset.UtcNow >= deadline)
                        return new DevicePollResponse { Status = "timeout" };

                    await Task.Delay(interval, cancellationToken).ConfigureAwait(false);
                }
            }
            finally
            {
                _authLock.Release();
            }
        }

        /// <summary>
        /// Convenience wrapper that runs the full start + poll device pairing flow in one call.
        /// </summary>
        public async Task<DevicePollResponse> LoginWithDevicePairingAsync(
            string? deviceName = null,
            Action<DeviceStartResponse>? onCodeReady = null,
            TimeSpan? pollInterval = null,
            TimeSpan? timeout = null,
            CancellationToken cancellationToken = default)
        {
            var start = await BeginLoginAsync(deviceName, cancellationToken).ConfigureAwait(false);
            onCodeReady?.Invoke(start);
            return await WaitForDevicePairingAsync(start.PollToken, pollInterval, timeout, deviceName, cancellationToken).ConfigureAwait(false);
        }

        #endregion

        #region Token Maintenance

        /// <summary>
        /// Ensures the client has a valid, non-expired token, refreshing it if it's within
        /// <paramref name="refreshWindow"/> of expiring. Returns false if there is no session to refresh.
        /// </summary>
        public async Task<bool> EnsureAuthenticatedAsync(TimeSpan? refreshWindow = null, CancellationToken cancellationToken = default)
        {
            if (_cachedToken == null)
                return false;

            var window = refreshWindow ?? TimeSpan.FromMinutes(5);
            if (_cachedToken.ExpiresAt - DateTimeOffset.UtcNow > window)
                return true;

            return await RefreshTokenAsync(cancellationToken).ConfigureAwait(false);
        }

        /// <summary>
        /// Rotates the current bearer token and re-caches the result. Returns false and logs out
        /// locally if the server rejects the refresh (e.g. the token was revoked).
        /// </summary>
        public async Task<bool> RefreshTokenAsync(CancellationToken cancellationToken = default)
        {
            await _authLock.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                if (_cachedToken == null)
                    return false;

                try
                {
                    var refreshed = await Client.RefreshTokenAsync(cancellationToken).ConfigureAwait(false);
                    var expiresAt = DateTimeOffset.FromUnixTimeSeconds(refreshed.ExpiresAt);
                    PersistToken(refreshed.Token, expiresAt, _cachedToken.DeviceName);
                    return true;
                }
                catch (PkmnException)
                {
                    ClearCachedToken();
                    return false;
                }
            }
            finally
            {
                _authLock.Release();
            }
        }

        /// <summary>
        /// Logs out on the server (best-effort) and clears the local token cache.
        /// </summary>
        public async Task LogoutAsync(CancellationToken cancellationToken = default)
        {
            await _authLock.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                if (_cachedToken != null)
                {
                    try
                    {
                        await Client.LogoutAsync(cancellationToken).ConfigureAwait(false);
                    }
                    catch (PkmnException)
                    {
                        // Ignore server-side failures; still clear the local session.
                    }
                }

                ClearCachedToken();
            }
            finally
            {
                _authLock.Release();
            }
        }

        #endregion
    }
}
