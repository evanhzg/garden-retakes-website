using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace PkmnClient
{
    #region Common Models

    public class PkmnStats
    {
        [JsonPropertyName("hp")]
        public int Hp { get; set; }

        [JsonPropertyName("atk")]
        public int Atk { get; set; }

        [JsonPropertyName("def")]
        public int Def { get; set; }

        [JsonPropertyName("spa")]
        public int Spa { get; set; }

        [JsonPropertyName("spd")]
        public int Spd { get; set; }

        [JsonPropertyName("spe")]
        public int Spe { get; set; }
    }

    public class PartyMon
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("species")]
        public string Species { get; set; } = string.Empty;

        [JsonPropertyName("nickname")]
        public string? Nickname { get; set; }

        [JsonPropertyName("level")]
        public int Level { get; set; }

        [JsonPropertyName("exp")]
        public int Exp { get; set; }

        [JsonPropertyName("hp")]
        public int Hp { get; set; }

        [JsonPropertyName("maxHp")]
        public int MaxHp { get; set; }

        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("ability")]
        public string Ability { get; set; } = string.Empty;

        [JsonPropertyName("nature")]
        public string Nature { get; set; } = string.Empty;

        [JsonPropertyName("moves")]
        public List<string> Moves { get; set; } = new List<string>();

        [JsonPropertyName("ivs")]
        public PkmnStats Ivs { get; set; } = new PkmnStats();

        [JsonPropertyName("evs")]
        public PkmnStats Evs { get; set; } = new PkmnStats();
    }

    public class BoxMon
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("species")]
        public string Species { get; set; } = string.Empty;

        [JsonPropertyName("nickname")]
        public string? Nickname { get; set; }

        [JsonPropertyName("level")]
        public int Level { get; set; }

        [JsonPropertyName("hp")]
        public int Hp { get; set; }

        [JsonPropertyName("maxHp")]
        public int MaxHp { get; set; }
    }

    public class PkmnBox
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("pokemon")]
        public List<BoxMon> Pokemon { get; set; } = new List<BoxMon>();
    }

    public class BagItem
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("count")]
        public int Count { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("kind")]
        public string Kind { get; set; } = string.Empty;

        [JsonPropertyName("desc")]
        public string Desc { get; set; } = string.Empty;
    }

    #endregion

    #region Authentication Payloads

    public class DeviceStartRequest
    {
        [JsonPropertyName("deviceName")]
        public string? DeviceName { get; set; }
    }

    public class DeviceStartResponse
    {
        [JsonPropertyName("code")]
        public string Code { get; set; } = string.Empty;

        [JsonPropertyName("pollToken")]
        public string PollToken { get; set; } = string.Empty;

        [JsonPropertyName("verifyUrl")]
        public string VerifyUrl { get; set; } = string.Empty;

        [JsonPropertyName("expiresIn")]
        public int ExpiresIn { get; set; }

        [JsonPropertyName("interval")]
        public int Interval { get; set; }
    }

    public class DevicePollRequest
    {
        [JsonPropertyName("pollToken")]
        public string PollToken { get; set; } = string.Empty;
    }

    public class DevicePollResponse
    {
        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("token")]
        public string? Token { get; set; }

        [JsonPropertyName("steamId")]
        public string? SteamId { get; set; }

        [JsonPropertyName("expiresAt")]
        public long? ExpiresAt { get; set; }
    }

    public class DeviceConfirmRequest
    {
        [JsonPropertyName("code")]
        public string Code { get; set; } = string.Empty;
    }

    public class DeviceConfirmResponse
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("deviceName")]
        public string? DeviceName { get; set; }
    }

    public class TokenRefreshResponse
    {
        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;

        [JsonPropertyName("expiresAt")]
        public long ExpiresAt { get; set; }
    }

    public class SessionInfo
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("deviceName")]
        public string? DeviceName { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("lastUsedAt")]
        public DateTime LastUsedAt { get; set; }

        [JsonPropertyName("expiresAt")]
        public DateTime ExpiresAt { get; set; }

        [JsonPropertyName("isCurrent")]
        public bool IsCurrent { get; set; }
    }

    public class SessionListResponse
    {
        [JsonPropertyName("sessions")]
        public List<SessionInfo> Sessions { get; set; } = new List<SessionInfo>();
    }

    #endregion

    #region Trainer Payloads

    public class TrainerSave
    {
        [JsonPropertyName("steamId")]
        public string SteamId { get; set; } = string.Empty;

        [JsonPropertyName("money")]
        public int Money { get; set; }

        [JsonPropertyName("currentMap")]
        public string CurrentMap { get; set; } = string.Empty;

        [JsonPropertyName("posX")]
        public int PosX { get; set; }

        [JsonPropertyName("posY")]
        public int PosY { get; set; }

        [JsonPropertyName("facing")]
        public string Facing { get; set; } = string.Empty;

        [JsonPropertyName("badges")]
        public List<string> Badges { get; set; } = new List<string>();

        [JsonPropertyName("bag")]
        public List<BagItem> Bag { get; set; } = new List<BagItem>();

        [JsonPropertyName("party")]
        public List<PartyMon> Party { get; set; } = new List<PartyMon>();
    }

    public class TrainerUpdatePayload
    {
        [JsonPropertyName("currentMap")]
        public string? CurrentMap { get; set; }

        [JsonPropertyName("posX")]
        public int? PosX { get; set; }

        [JsonPropertyName("posY")]
        public int? PosY { get; set; }

        [JsonPropertyName("facing")]
        public string? Facing { get; set; }

        [JsonPropertyName("money")]
        public int? Money { get; set; }
    }

    public class TrainerStats
    {
        [JsonPropertyName("badges")]
        public int Badges { get; set; }

        [JsonPropertyName("pokemonOwned")]
        public int PokemonOwned { get; set; }

        [JsonPropertyName("partySize")]
        public int PartySize { get; set; }

        [JsonPropertyName("speciesCaught")]
        public int SpeciesCaught { get; set; }

        [JsonPropertyName("money")]
        public int Money { get; set; }
    }

    #endregion

    #region Inventory & Badges Payloads

    public class BadgeListResponse
    {
        [JsonPropertyName("badges")]
        public List<string> Badges { get; set; } = new List<string>();
    }

    public class BadgePatchPayload
    {
        [JsonPropertyName("badge")]
        public string Badge { get; set; } = string.Empty;
    }

    public class InventoryPatchPayload
    {
        [JsonPropertyName("deltas")]
        public Dictionary<string, int> Deltas { get; set; } = new Dictionary<string, int>();
    }

    public class InventoryPatchResponse
    {
        [JsonPropertyName("bag")]
        public List<BagItem> Bag { get; set; } = new List<BagItem>();
    }

    public class InventoryGetResponse
    {
        [JsonPropertyName("bag")]
        public List<BagItem> Bag { get; set; } = new List<BagItem>();
    }

    #endregion

    #region PC Storage Payloads

    public class BoxListResponse
    {
        [JsonPropertyName("boxes")]
        public List<PkmnBox> Boxes { get; set; } = new List<PkmnBox>();
    }

    public class CreateBoxRequest
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }
    }

    #endregion

    #region Pokémon Mutation Payloads

    public class PatchPokemonRequest
    {
        [JsonPropertyName("nickname")]
        public string? Nickname { get; set; }

        [JsonPropertyName("moves")]
        public List<string>? Moves { get; set; }

        [JsonPropertyName("status")]
        public string? Status { get; set; }
    }

    public class MovePokemonRequest
    {
        [JsonPropertyName("boxId")]
        public string? BoxId { get; set; }
    }

    public class MovePokemonResponse
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("boxId")]
        public string? BoxId { get; set; }
    }

    public class PartyGetResponse
    {
        [JsonPropertyName("party")]
        public List<PartyMon> Party { get; set; } = new List<PartyMon>();
    }

    #endregion

    #region Leaderboard & Realtime & Identity Payloads

    public class LeaderboardEntry
    {
        [JsonPropertyName("rank")]
        public int Rank { get; set; }

        [JsonPropertyName("steamId")]
        public string SteamId { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("badges")]
        public int? Badges { get; set; }

        [JsonPropertyName("speciesCaught")]
        public int? SpeciesCaught { get; set; }
    }

    public class LeaderboardResponse
    {
        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [JsonPropertyName("leaderboard")]
        public List<LeaderboardEntry> Leaderboard { get; set; } = new List<LeaderboardEntry>();
    }

    public class MeResponse
    {
        [JsonPropertyName("steamId")]
        public string SteamId { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("avatarUrl")]
        public string? AvatarUrl { get; set; }

        [JsonPropertyName("hasTrainer")]
        public bool HasTrainer { get; set; }

        [JsonPropertyName("hasStarter")]
        public bool HasStarter { get; set; }
    }

    public class RealtimeConnectInfo
    {
        [JsonPropertyName("socketUrl")]
        public string SocketUrl { get; set; } = string.Empty;

        [JsonPropertyName("ticket")]
        public string Ticket { get; set; } = string.Empty;

        [JsonPropertyName("expiresAt")]
        public long ExpiresAt { get; set; }
    }

    #endregion

    #region Utility Error Response

    public class ErrorResponse
    {
        [JsonPropertyName("error")]
        public string Error { get; set; } = string.Empty;
    }

    public class GenericOkResponse
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }
    }

    #endregion
}
