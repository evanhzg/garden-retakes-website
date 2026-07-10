-- Garden Rankings — blank database schema (MySQL 8+)
-- Creates every table the GardenRankings plugin and the website expect,
-- plus an initial active season so pages render immediately.
--
-- Usage:
--   mysql -h <host> -P <port> -u <user> -p <database> < sql/blank-schema.sql
-- (On Aiven the database is usually called "defaultdb". If you manage your own
--  MySQL, create the database first: CREATE DATABASE gardenrankings CHARACTER SET utf8mb4;)
--
-- The schema matches what the plugin's EF Core layer generates, so the plugin
-- will happily use these tables as-is. Everything is idempotent.

CREATE TABLE IF NOT EXISTS Seasons (
    Id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(64) NOT NULL,
    StartedAtUtc DATETIME(6) NOT NULL,
    EndedAtUtc DATETIME(6) NULL,
    IsActive TINYINT(1) NOT NULL
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS PlayerProfiles (
    SteamId BIGINT NOT NULL PRIMARY KEY,
    LastKnownName VARCHAR(128) NOT NULL,
    FirstSeenAtUtc DATETIME(6) NOT NULL,
    LastSeenAtUtc DATETIME(6) NOT NULL
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS PlayerSeasonStats (
    Id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SeasonId INT NOT NULL,
    SteamId BIGINT NOT NULL,
    Elo INT NOT NULL,
    PeakElo INT NOT NULL,
    RankedRoundsPlayed INT NOT NULL,
    RankedRoundsWon INT NOT NULL,
    UnrankedRoundsPlayed INT NOT NULL,
    LastRankedRoundAtUtc DATETIME(6) NULL,
    UpdatedAtUtc DATETIME(6) NOT NULL,
    UNIQUE KEY IX_PlayerSeasonStats_SeasonId_SteamId (SeasonId, SteamId)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS RoundRecords (
    Id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SeasonId INT NOT NULL,
    Map VARCHAR(128) NOT NULL,
    PlayedAtUtc DATETIME(6) NOT NULL,
    RoundTypeOrdinal INT NOT NULL,
    IsRanked TINYINT(1) NOT NULL,
    TPlayerCount INT NOT NULL,
    CtPlayerCount INT NOT NULL,
    WinnerTeamNum INT NOT NULL,
    BombSite VARCHAR(8) NULL,
    BombPlanted TINYINT(1) NOT NULL,
    BombDefused TINYINT(1) NOT NULL,
    BombExploded TINYINT(1) NOT NULL,
    RoundDurationSeconds DOUBLE NOT NULL,
    KEY IX_RoundRecords_PlayedAtUtc (PlayedAtUtc)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS PlayerRoundRecords (
    Id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    RoundRecordId BIGINT NOT NULL,
    SeasonId INT NOT NULL,
    Map VARCHAR(128) NOT NULL,
    PlayedAtUtc DATETIME(6) NOT NULL,
    IsRanked TINYINT(1) NOT NULL,
    SteamId BIGINT NOT NULL,
    PlayerName VARCHAR(128) NOT NULL,
    TeamNum INT NOT NULL,
    WonRound TINYINT(1) NOT NULL,
    Kills INT NOT NULL,
    Headshots INT NOT NULL,
    Assists INT NOT NULL,
    FlashAssists INT NOT NULL,
    Damage INT NOT NULL,
    UtilityDamage INT NOT NULL,
    EnemiesFlashed INT NOT NULL,
    EnemyBlindDuration DOUBLE NOT NULL,
    Died TINYINT(1) NOT NULL,
    DiedAtSeconds DOUBLE NULL,
    WasTeamKilled TINYINT(1) NOT NULL,
    KilledTeammate TINYINT(1) NOT NULL,
    DiedEarly TINYINT(1) NOT NULL,
    OpeningKill TINYINT(1) NOT NULL,
    OpeningDeath TINYINT(1) NOT NULL,
    TradeKills INT NOT NULL,
    TradedDeath TINYINT(1) NOT NULL,
    Kast TINYINT(1) NOT NULL,
    MultiKillCount INT NOT NULL,
    ClutchVersus INT NOT NULL,
    ClutchWon TINYINT(1) NOT NULL,
    BombPlanted TINYINT(1) NOT NULL,
    BombDefused TINYINT(1) NOT NULL,
    WasAfk TINYINT(1) NOT NULL,
    Rating DOUBLE NOT NULL,
    EloDelta INT NOT NULL,
    EloAfter INT NOT NULL,
    KEY IX_PlayerRoundRecords_SteamId_PlayedAtUtc (SteamId, PlayedAtUtc),
    KEY IX_PlayerRoundRecords_SeasonId_SteamId (SeasonId, SteamId),
    KEY IX_PlayerRoundRecords_RoundRecordId (RoundRecordId),
    CONSTRAINT FK_PlayerRoundRecords_RoundRecords_RoundRecordId
        FOREIGN KEY (RoundRecordId) REFERENCES RoundRecords (Id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS CrTeamStats (
    Id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SeasonId INT NOT NULL,
    TeamKey VARCHAR(96) NOT NULL,
    PlayerNames VARCHAR(256) NOT NULL,
    TeamSize INT NOT NULL,
    Elo INT NOT NULL,
    PeakElo INT NOT NULL,
    MatchesPlayed INT NOT NULL,
    MatchesWon INT NOT NULL,
    MatchesDrawn INT NOT NULL,
    RoundsWon INT NOT NULL,
    RoundsLost INT NOT NULL,
    UpdatedAtUtc DATETIME(6) NOT NULL,
    UNIQUE KEY IX_CrTeamStats_SeasonId_TeamKey (SeasonId, TeamKey)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS CrMatches (
    Id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SeasonId INT NOT NULL,
    Map VARCHAR(128) NOT NULL,
    StartedAtUtc DATETIME(6) NOT NULL,
    EndedAtUtc DATETIME(6) NULL,
    TeamAKey VARCHAR(96) NOT NULL,
    TeamBKey VARCHAR(96) NOT NULL,
    TeamAName VARCHAR(256) NOT NULL,
    TeamBName VARCHAR(256) NOT NULL,
    TeamSize INT NOT NULL,
    ScoreA INT NOT NULL,
    ScoreB INT NOT NULL,
    Result VARCHAR(16) NOT NULL,
    EloDeltaA INT NOT NULL,
    EloDeltaB INT NOT NULL,
    KEY IX_CrMatches_SeasonId (SeasonId)
) CHARACTER SET utf8mb4;

-- Garden (W2): bans, display-name overrides, web profiles.
CREATE TABLE IF NOT EXISTS GardenBans (
    SteamId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    Name VARCHAR(128) NOT NULL,
    Reason VARCHAR(256) NOT NULL,
    BannedBy BIGINT UNSIGNED NOT NULL,
    BannedAtUtc DATETIME(6) NOT NULL,
    ExpiresAtUtc DATETIME(6) NULL
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS GardenNameOverrides (
    SteamId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    Name VARCHAR(64) NOT NULL
) CHARACTER SET utf8mb4;

-- Website-owned: custom avatar/bio shown on player pages, ladder and hero.
CREATE TABLE IF NOT EXISTS GardenWebProfiles (
    SteamId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    AvatarUrl VARCHAR(512) NULL,
    Bio VARCHAR(280) NULL,
    Country VARCHAR(2) NULL,
    UpdatedAt DATETIME(6) NOT NULL
) CHARACTER SET utf8mb4;

-- Garden-retakes merged plugin (Duels mode): one row per completed 1v1.
CREATE TABLE IF NOT EXISTS DuelRecords (
    Id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SeasonId INT NOT NULL,
    Map VARCHAR(128) NOT NULL,
    PlayedAtUtc DATETIME(6) NOT NULL,
    ArenaName VARCHAR(64) NOT NULL,
    WinnerSteamId BIGINT UNSIGNED NOT NULL,
    WinnerName VARCHAR(128) NOT NULL,
    LoserSteamId BIGINT UNSIGNED NOT NULL,
    LoserName VARCHAR(128) NOT NULL,
    IsChallenge TINYINT(1) NOT NULL,
    ChallengeScore VARCHAR(16) NOT NULL,
    KEY IX_DuelRecords_SeasonId (SeasonId)
) CHARACTER SET utf8mb4;

-- Garden-retakes merged plugin (ROADMAP R3): admin storage + audit log.
CREATE TABLE IF NOT EXISTS GardenAdmins (
    SteamId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    Name VARCHAR(128) NOT NULL,
    Level INT NOT NULL,
    AddedBy BIGINT UNSIGNED NOT NULL,
    AddedAtUtc DATETIME(6) NOT NULL
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS GardenAdminLog (
    Id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    AtUtc DATETIME(6) NOT NULL,
    ActorSteamId BIGINT UNSIGNED NOT NULL,
    ActorName VARCHAR(128) NOT NULL,
    Action VARCHAR(32) NOT NULL,
    TargetSteamId BIGINT UNSIGNED NOT NULL,
    TargetName VARCHAR(128) NOT NULL,
    Detail VARCHAR(256) NOT NULL
) CHARACTER SET utf8mb4;

-- Website-owned: saved inventory simulator loadouts (JSON), keyed by SteamID64.
-- Served to the CS2 inventory-simulator plugin via /api/equipped/v4/{steamid}.json.
CREATE TABLE IF NOT EXISTS WebInventories (
    SteamId BIGINT NOT NULL PRIMARY KEY,
    Data LONGTEXT NOT NULL,
    UpdatedAt DATETIME(6) NOT NULL
) CHARACTER SET utf8mb4;

-- Initial active season (skipped if any season already exists).
INSERT INTO Seasons (Name, StartedAtUtc, IsActive)
SELECT 'Season 1', UTC_TIMESTAMP(6), 1
WHERE NOT EXISTS (SELECT 1 FROM Seasons);
