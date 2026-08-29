-- Standing teams: a team that exists outside any one tournament.
--
-- Today a "team" is a row scoped to a single tournament, so five players
-- entering three events are three unrelated rows with no thread between them —
-- which is why the results page has to group team rankings by NAME, the only
-- thing those rows share. These two tables are the thread, and the nullable
-- column on TournamentTeams is how an entry points back at it.
--
-- Nullable is the point. A tournament team that came from a standing team
-- points at it; one that did not is exactly what it is today. Nothing needs
-- migrating and nothing existing changes behaviour.
--
-- NOTE, and it has cost this project 160 orphaned rows once already: this
-- database has NO foreign keys. Prisma's `onDelete: Cascade` is a client-side
-- fiction here. Deleting a team must delete its members explicitly — see the
-- top-down sweep in tools/reset-tournaments.mts.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/garden-teams.sql`.

CREATE TABLE IF NOT EXISTS `GardenTeams` (
  `Id`             INT AUTO_INCREMENT PRIMARY KEY,
  `Name`           VARCHAR(64)  NOT NULL,
  `Slug`           VARCHAR(64)  NOT NULL,
  `Tag`            VARCHAR(8)   NULL,
  `CaptainSteamId` BIGINT UNSIGNED NOT NULL,
  -- Bytes rather than a URL: tournament banners already work this way because
  -- there is no object storage in this deployment.
  `AvatarBytes`    LONGBLOB     NULL,
  `AvatarMime`     VARCHAR(32)  NULL,
  `Bio`            TEXT         NULL,
  `CreatedAt`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `UpdatedAt`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY `UX_GardenTeams_Slug` (`Slug`),
  UNIQUE KEY `UX_GardenTeams_Name` (`Name`),
  KEY `IX_GardenTeams_Captain` (`CaptainSteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `GardenTeamMembers` (
  `Id`       INT AUTO_INCREMENT PRIMARY KEY,
  `TeamId`   INT NOT NULL,
  `SteamId`  BIGINT UNSIGNED NOT NULL,
  -- captain | manager | player
  `Role`     VARCHAR(16) NOT NULL DEFAULT 'player',
  `JoinedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  -- One row per player per team. A player may be in many teams — that is the
  -- point of standing teams — but not twice in one.
  UNIQUE KEY `UX_GardenTeamMembers` (`TeamId`, `SteamId`),
  KEY `IX_GardenTeamMembers_Player` (`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The link. Null for every row that exists today, and for every ad-hoc team
-- made in a lobby or by an organizer typing a name.
SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentTeams` ADD COLUMN `GardenTeamId` INT NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentTeams'
    AND COLUMN_NAME = 'GardenTeamId');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentTeams` ADD INDEX `IX_TournamentTeams_GardenTeam` (`GardenTeamId`)')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentTeams'
    AND INDEX_NAME = 'IX_TournamentTeams_GardenTeam');
PREPARE s FROM @idx; EXECUTE s; DEALLOCATE PREPARE s;
