-- Tournament organizations.
--
-- Today a tournament names a list of organizer SteamIDs and nothing else, so
-- "who runs this" is answered by a set of people rather than by a thing with a
-- name, a description and a history. Every event by the same group is unrelated
-- to every other one, and there is nowhere to send somebody who liked the last
-- tournament and wants to know when the next one is.
--
-- An org is that thing. Tournaments point at one, permissions are inherited
-- from it, and people can follow it.
--
-- Nullable on the tournament, deliberately. A tournament that came from nowhere
-- in particular is exactly what every existing one is, and nothing about them
-- changes.
--
-- NOTE, and it has cost this project 160 orphaned rows once already: this
-- database has NO foreign keys. Prisma's `onDelete: Cascade` is a client-side
-- fiction here. Deleting an org must delete its members and follows explicitly.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/garden-orgs.sql`.

CREATE TABLE IF NOT EXISTS `GardenOrgs` (
  `Id`          INT AUTO_INCREMENT PRIMARY KEY,
  `Slug`        VARCHAR(64)  NOT NULL,
  `Name`        VARCHAR(80)  NOT NULL,
  `Description` TEXT         NULL,

  -- Bytes rather than a URL, because tournament banners already work this way:
  -- there is no object storage in this deployment.
  `ImageBytes`  LONGBLOB     NULL,
  `ImageMime`   VARCHAR(32)  NULL,

  -- Where else they are. All optional — an org with none of these is a group of
  -- friends running an event, which is most of them.
  `DiscordUrl`  VARCHAR(255) NULL,
  `TwitchUrl`   VARCHAR(255) NULL,
  `YoutubeUrl`  VARCHAR(255) NULL,
  `WebsiteUrl`  VARCHAR(255) NULL,
  `TwitterUrl`  VARCHAR(255) NULL,

  -- Just the id, not a URL: it is embedded, and storing a whole watch link
  -- means parsing it back out on every render to build an embed src.
  `TrailerYoutubeId` VARCHAR(24) NULL,

  `CreatedAtUtc` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  UNIQUE KEY `UX_GardenOrgs_Slug` (`Slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who is in the org, and what they may do with its tournaments.
--
-- Two roles, and the difference is the whole point of having roles at all:
--
--   organizer — runs the event. Creates and edits tournaments, changes the
--               bracket, everything a tournament organizer can do today.
--   moderator — works the event. Answers tickets, takes admin calls, fixes a
--               score, restarts a match, messages players. Cannot change what
--               the tournament IS: no structure, no rules, no dates.
--
-- That split exists because the person you want awake at 2am to restart a
-- server is not necessarily the person you want able to delete the bracket.
CREATE TABLE IF NOT EXISTS `GardenOrgMembers` (
  `Id`      INT AUTO_INCREMENT PRIMARY KEY,
  `OrgId`   INT             NOT NULL,
  `SteamId` BIGINT UNSIGNED NOT NULL,
  `Role`    VARCHAR(16)     NOT NULL DEFAULT 'moderator',
  `AddedAt` DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  UNIQUE KEY `UX_GardenOrgMembers` (`OrgId`, `SteamId`),
  INDEX `IX_GardenOrgMembers_SteamId` (`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Following, for "tell me when they run another one".
CREATE TABLE IF NOT EXISTS `GardenOrgFollows` (
  `Id`         INT AUTO_INCREMENT PRIMARY KEY,
  `OrgId`      INT             NOT NULL,
  `SteamId`    BIGINT UNSIGNED NOT NULL,
  `FollowedAt` DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  UNIQUE KEY `UX_GardenOrgFollows` (`OrgId`, `SteamId`),
  INDEX `IX_GardenOrgFollows_SteamId` (`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which org ran it. Null for everything that exists today.
SET @add_org := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `Tournaments` ADD COLUMN `OrgId` INT NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'OrgId'
);
PREPARE stmt FROM @add_org; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- "Every tournament by this org", which is the org page's only query.
SET @add_idx := (
  SELECT IF(COUNT(*) = 0,
    'CREATE INDEX `IX_Tournaments_Org` ON `Tournaments` (`OrgId`)',
    'SELECT 1')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tournaments' AND INDEX_NAME = 'IX_Tournaments_Org'
);
PREPARE stmt FROM @add_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;
