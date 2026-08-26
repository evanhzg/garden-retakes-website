-- The Organizer role.
--
-- Idempotent, per the convention in this directory. Apply with
-- `node tools/apply-sql.mjs sql/tournament-organizers.sql`.
--
-- Why this is not a fourth GardenAdmins level: that column is a ladder — a
-- Moderator is strictly less than an Admin, and immunity is decided by
-- comparing the two numbers. An organizer is not a rung on that ladder. They
-- run their own events and nothing else, they may be nobody at all on the
-- server, and they still play in the tournaments they run. Putting them in the
-- ladder would either hand them moderation they should not have or rank them
-- below people who cannot run an event at all.
--
-- So it is a separate capability, in two tables:
--
--   * GardenOrganizers — may create tournaments. A registry, not a level.
--   * TournamentOrganizers — may manage THIS tournament. Several per event,
--     which is the whole reason it is a table rather than a column.
--
-- Admins and Owners are handled in code rather than by seeding rows here: they
-- manage every tournament by virtue of being Admins, and a copy of that fact in
-- a table is a copy that goes stale the moment somebody is promoted.

CREATE TABLE IF NOT EXISTS `GardenOrganizers` (
  `SteamId` BIGINT UNSIGNED NOT NULL,
  `Name` VARCHAR(64) NULL,
  `AddedBySteamId` BIGINT UNSIGNED NULL,
  `AddedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `TournamentOrganizers` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `TournamentId` INT NOT NULL,
  `SteamId` BIGINT UNSIGNED NOT NULL,
  `Name` VARCHAR(64) NULL,
  -- The one who created it. Kept so the list can say who to ask, and so the
  -- last organizer cannot be removed by accident.
  `IsCreator` TINYINT(1) NOT NULL DEFAULT 0,
  `AddedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_TournamentOrganizers` (`TournamentId`,`SteamId`),
  KEY `IX_TournamentOrganizers_SteamId` (`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Existing tournaments have an OwnerSteamId and no organizer rows, so the
-- creator of anything already made would lose access the moment the gate starts
-- reading TournamentOrganizers. Backfill them.
INSERT IGNORE INTO `TournamentOrganizers` (`TournamentId`, `SteamId`, `IsCreator`)
SELECT `Id`, `OwnerSteamId`, 1 FROM `Tournaments` WHERE `OwnerSteamId` IS NOT NULL;
