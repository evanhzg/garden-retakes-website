-- The tournament system.
--
-- Idempotent, per the convention in this directory. Apply with
-- `node tools/apply-sql.mjs sql/tournaments.sql`.
--
-- Shapes worth knowing before reading the rest:
--
--   * A tournament has ordered STAGES. A stage is a group phase, a swiss, a
--     single-elim bracket or a double-elim one, and its rules live in a JSON
--     Config rather than in columns — the difference between a swiss and a group
--     phase is settings, not structure, and columns for every format would be
--     mostly null.
--
--   * A MATCH belongs to a stage and knows the match it feeds. That is what
--     makes a bracket a bracket, and it is why NextMatchId/NextSlot exist
--     instead of a separate tree table.
--
--   * MatchKey is the string handed to the plugin's css_t_go, and the join back
--     from everything the game reports. It is the seam between the two halves of
--     the system.

CREATE TABLE IF NOT EXISTS `Tournaments` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `Slug` VARCHAR(64) NOT NULL,
  `Name` VARCHAR(128) NOT NULL,
  `Description` TEXT NULL,
  -- draft | registration | live | finished | cancelled
  `State` VARCHAR(16) NOT NULL DEFAULT 'draft',
  `TeamSize` TINYINT NOT NULL DEFAULT 3,
  `MaxTeams` INT NOT NULL DEFAULT 16,
  `OwnerSteamId` BIGINT UNSIGNED NULL,
  `StartsAt` DATETIME(6) NULL,
  `Config` TEXT NULL,
  `CreatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `UpdatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_Tournaments_Slug` (`Slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `TournamentStages` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `TournamentId` INT NOT NULL,
  `Name` VARCHAR(64) NOT NULL,
  -- group | swiss | single | double
  `Kind` VARCHAR(16) NOT NULL DEFAULT 'single',
  `Ordinal` INT NOT NULL DEFAULT 0,
  `BestOf` TINYINT NOT NULL DEFAULT 1,
  -- The final of a stage often differs from the rest of it: BO1 groups, BO3
  -- playoffs, BO5 final is the shape asked for, and a column is cheaper than a
  -- rule somebody has to remember.
  `FinalBestOf` TINYINT NULL,
  `Config` TEXT NULL,
  `State` VARCHAR(16) NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`Id`),
  KEY `IX_TournamentStages_Tournament` (`TournamentId`,`Ordinal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `TournamentTeams` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `TournamentId` INT NOT NULL,
  `Name` VARCHAR(64) NOT NULL,
  `Tag` VARCHAR(8) NULL,
  `CaptainSteamId` BIGINT UNSIGNED NOT NULL,
  `Seed` INT NULL,
  -- pending | accepted | withdrawn | disqualified
  `Status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `CreatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  -- Two teams of one name in one tournament would be indistinguishable on a
  -- bracket, which is the one place it matters most.
  UNIQUE KEY `UX_TournamentTeams_Name` (`TournamentId`,`Name`),
  KEY `IX_TournamentTeams_Tournament` (`TournamentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `TournamentTeamMembers` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `TeamId` INT NOT NULL,
  `SteamId` BIGINT UNSIGNED NOT NULL,
  `IsCaptain` TINYINT(1) NOT NULL DEFAULT 0,
  -- invited | accepted | declined | removed
  `Status` VARCHAR(16) NOT NULL DEFAULT 'invited',
  `InvitedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `RespondedAt` DATETIME(6) NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_TournamentTeamMembers` (`TeamId`,`SteamId`),
  KEY `IX_TournamentTeamMembers_SteamId` (`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `TournamentMatches` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `TournamentId` INT NOT NULL,
  `StageId` INT NOT NULL,
  `MatchKey` VARCHAR(64) NOT NULL,
  `Round` INT NOT NULL DEFAULT 1,
  `Slot` INT NOT NULL DEFAULT 0,
  `BestOf` TINYINT NOT NULL DEFAULT 1,
  `TeamAId` INT NULL,
  `TeamBId` INT NULL,
  `ScoreA` INT NOT NULL DEFAULT 0,
  `ScoreB` INT NOT NULL DEFAULT 0,
  -- pending | veto | ready | live | finished | forfeit
  `State` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `WinnerTeamId` INT NULL,
  `ServerId` INT NULL,
  -- Where the winner goes, and into which of the two slots. This is the bracket:
  -- a tree expressed as forward pointers rather than a second table.
  `NextMatchId` INT NULL,
  `NextSlot` TINYINT NULL,
  -- And where the loser goes, which is the whole of a double-elimination bracket.
  `LoserNextMatchId` INT NULL,
  `LoserNextSlot` TINYINT NULL,
  `ScheduledAt` DATETIME(6) NULL,
  `StartedAt` DATETIME(6) NULL,
  `EndedAt` DATETIME(6) NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_TournamentMatches_Key` (`MatchKey`),
  KEY `IX_TournamentMatches_Stage` (`StageId`,`Round`,`Slot`),
  KEY `IX_TournamentMatches_Tournament` (`TournamentId`,`State`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `TournamentMatchMaps` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `MatchId` INT NOT NULL,
  `Ordinal` INT NOT NULL DEFAULT 0,
  `Map` VARCHAR(64) NOT NULL,
  `PickedByTeamId` INT NULL,
  `SideChosenByTeamId` INT NULL,
  -- 'T' or 'CT' for the side team A starts on, or NULL when a knife round
  -- decides it. That null is what the plugin reads to choose between css_t_side
  -- and css_t_knife, so it is the difference between a decider and a picked map.
  `StartSideTeamA` VARCHAR(2) NULL,
  `IsDecider` TINYINT(1) NOT NULL DEFAULT 0,
  `ScoreA` INT NOT NULL DEFAULT 0,
  `ScoreB` INT NOT NULL DEFAULT 0,
  `WinnerTeamId` INT NULL,
  `DemoFile` VARCHAR(160) NULL,
  `State` VARCHAR(16) NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_TournamentMatchMaps` (`MatchId`,`Ordinal`),
  KEY `IX_TournamentMatchMaps_Match` (`MatchId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Who banned or picked what, in order. Kept because a veto is the part of a
-- tournament people argue about afterwards, and "the site says so" only settles
-- it if the site remembers.
CREATE TABLE IF NOT EXISTS `TournamentVetoActions` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `MatchId` INT NOT NULL,
  `Ordinal` INT NOT NULL,
  `TeamId` INT NULL,
  -- ban | pick | side
  `Kind` VARCHAR(8) NOT NULL,
  `Map` VARCHAR(64) NULL,
  `Side` VARCHAR(2) NULL,
  -- Whether a turn ran out and the system chose. An auto-pick that looks like a
  -- deliberate one is a support conversation nobody can resolve.
  `WasAuto` TINYINT(1) NOT NULL DEFAULT 0,
  `ActedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_TournamentVetoActions` (`MatchId`,`Ordinal`),
  KEY `IX_TournamentVetoActions_Match` (`MatchId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `TournamentMaps` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `TournamentId` INT NOT NULL,
  `Map` VARCHAR(64) NOT NULL,
  `Ordinal` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_TournamentMaps` (`TournamentId`,`Map`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `TournamentPlayerStats` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `MatchId` INT NOT NULL,
  `MapId` INT NULL,
  `SteamId` BIGINT UNSIGNED NOT NULL,
  `TeamId` INT NULL,
  `Kills` INT NOT NULL DEFAULT 0,
  `Deaths` INT NOT NULL DEFAULT 0,
  `Assists` INT NOT NULL DEFAULT 0,
  `Headshots` INT NOT NULL DEFAULT 0,
  `Damage` INT NOT NULL DEFAULT 0,
  `UtilityDamage` INT NOT NULL DEFAULT 0,
  `EntryKills` INT NOT NULL DEFAULT 0,
  `EntryDeaths` INT NOT NULL DEFAULT 0,
  `Clutches` INT NOT NULL DEFAULT 0,
  `RoundsPlayed` INT NOT NULL DEFAULT 0,
  `KastRounds` INT NOT NULL DEFAULT 0,
  `Rating` FLOAT NOT NULL DEFAULT 0,
  `UpdatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_TournamentPlayerStats` (`MatchId`,`MapId`,`SteamId`),
  KEY `IX_TournamentPlayerStats_SteamId` (`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The servers a tournament can run on.
--
-- This is what replaces the single RCON_HOST/PORT/PASSWORD triple the site has
-- read from the environment until now. Six parallel matches need six targets,
-- and one row per server is the difference between adding a server and editing
-- code. Server 1 is seeded from the environment so nothing existing changes.
CREATE TABLE IF NOT EXISTS `GameServers` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `Name` VARCHAR(64) NOT NULL,
  `Host` VARCHAR(128) NOT NULL,
  `Port` INT NOT NULL DEFAULT 27015,
  `RconPassword` VARCHAR(128) NOT NULL,
  `ConnectAddress` VARCHAR(160) NULL,
  `GotvAddress` VARCHAR(160) NULL,
  -- idle | busy | offline | disabled
  `Status` VARCHAR(16) NOT NULL DEFAULT 'idle',
  `CurrentMatchId` INT NULL,
  `IsTournament` TINYINT(1) NOT NULL DEFAULT 1,
  `UpdatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  KEY `IX_GameServers_Status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Casters allowed onto a tournament server. The roster is the allowlist for
-- players; this is the allowlist for everybody else, and without it a "free
-- camera" server is one anybody can watch from inside.
CREATE TABLE IF NOT EXISTS `TournamentSpectators` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `TournamentId` INT NOT NULL,
  `SteamId` BIGINT UNSIGNED NOT NULL,
  `Name` VARCHAR(64) NULL,
  `AddedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_TournamentSpectators` (`TournamentId`,`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `TournamentAlerts` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `MatchKey` VARCHAR(64) NOT NULL,
  `Map` VARCHAR(64) NULL,
  `SteamId` BIGINT UNSIGNED NOT NULL,
  `Name` VARCHAR(64) NULL,
  `Team` VARCHAR(64) NULL,
  `Score` VARCHAR(16) NULL,
  `Reason` VARCHAR(240) NULL,
  `CreatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `AckedAt` DATETIME(6) NULL,
  `AckedBy` BIGINT UNSIGNED NULL,
  PRIMARY KEY (`Id`),
  KEY `IX_TournamentAlerts_Open` (`AckedAt`,`CreatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
