-- Tournament spawn authoring.
--
-- The Maker tool has two halves and this is the seam between them. The website
-- owns what a spawn *is* — its name, the role it serves, which site and side it
-- belongs to — and the plugin owns where it is, because that is decided by
-- standing in it. Positions arrive here from the plugin as they are placed, so
-- the page can show them live and so a map's authoring state survives a server
-- restart.
--
-- The plugin's own tournament_spawns/<map>.json stays the file the game reads.
-- This is not a second source of truth for that: it is the record of what was
-- authored and the thing GENERATE writes the file from.
--
-- Idempotent, per the convention in this directory: run it as many times as you
-- like. Apply with `node tools/apply-sql.mjs sql/tournament-maker.sql`.

CREATE TABLE IF NOT EXISTS `TournamentSpawns` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `Map` VARCHAR(64) NOT NULL,
  `Name` VARCHAR(64) NOT NULL,
  `RoleId` VARCHAR(24) NOT NULL,
  -- 0 = A, 1 = B, matching the plugin's Bombsite enum.
  `Bombsite` TINYINT NOT NULL,
  -- 2 = T, 3 = CT, matching CS2's own team numbers.
  `Team` TINYINT NOT NULL,
  `CanBePlanter` TINYINT(1) NOT NULL DEFAULT 0,
  `Sort` INT NOT NULL DEFAULT 100,
  `CreatedBy` BIGINT UNSIGNED NULL,
  `CreatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `UpdatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  -- One spawn of a given name per side of a site. Two rows reading "A · site"
  -- in one menu would be indistinguishable to the player choosing between them.
  UNIQUE KEY `UX_TournamentSpawns` (`Map`,`Bombsite`,`Team`,`Name`),
  KEY `IX_TournamentSpawns_Map` (`Map`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `TournamentSpawnVariants` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `SpawnId` INT NOT NULL,
  `X` FLOAT NOT NULL,
  `Y` FLOAT NOT NULL,
  `Z` FLOAT NOT NULL,
  `Yaw` FLOAT NOT NULL DEFAULT 0,
  -- Kept alongside the numbers rather than derived on read: an admin pastes
  -- these straight into a console to stand where the variant is, and a rounding
  -- difference between what the page shows and where the game put it is the
  -- kind of discrepancy nobody would think to question.
  `SetPos` VARCHAR(96) NOT NULL,
  `ViewPos` VARCHAR(96) NOT NULL,
  `CreatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  KEY `IX_TournamentSpawnVariants_SpawnId` (`SpawnId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Which server a Maker session is running on, so the page knows where to send
-- SELECT IN-GAME and GENERATE. One row: a session is a person standing in a map,
-- and there is only one of them at a time per server.
CREATE TABLE IF NOT EXISTS `TournamentMakerSessions` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `ServerId` INT NOT NULL DEFAULT 1,
  `SpawnId` INT NOT NULL,
  `SteamId` BIGINT UNSIGNED NOT NULL,
  `Map` VARCHAR(64) NOT NULL,
  `StartedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `EndedAt` DATETIME(6) NULL,
  PRIMARY KEY (`Id`),
  KEY `IX_TournamentMakerSessions_Server` (`ServerId`,`EndedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The map library the Maker page lists, and the tournament pool draws from.
--
-- GardenMaps already carries MapName, WorkshopId and ImageUrl for the ladder's
-- map cycle, so this adds only what a tournament needs on top rather than a
-- second maps table: a display name that can differ from the file name, and
-- whether the map is available to tournaments at all.
SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `GardenMaps` ADD COLUMN `DisplayName` VARCHAR(64) NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GardenMaps' AND COLUMN_NAME = 'DisplayName');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `GardenMaps` ADD COLUMN `TournamentReady` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GardenMaps' AND COLUMN_NAME = 'TournamentReady');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;
