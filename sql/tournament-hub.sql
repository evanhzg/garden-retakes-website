-- Banners, organizer invite links, and bot rosters.
--
-- Idempotent, per the convention in this directory. Apply with
-- `node tools/apply-sql.mjs sql/tournament-hub.sql`.
--
-- Guarded ADD COLUMN rather than CREATE for the existing tables, because they
-- hold live rows. Every column is nullable or defaulted, so nothing needs a
-- backfill and an existing tournament stays valid.

-- ============================================================ Tournaments

-- The card image, stored in the database rather than on disk.
--
-- There is no object storage configured for this project, and the one existing
-- upload path (profile avatars) writes under process.cwd()/data — which on
-- Vercel is a per-invocation filesystem, so those files do not survive a
-- redeploy and very likely do not survive the request that follows them. A
-- MEDIUMBLOB holds 16 MB and a cropped banner is a few hundred KB; the upload
-- route caps it far below that. One row per tournament, read once per card,
-- and it cannot evaporate.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `BannerImage` MEDIUMBLOB NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'BannerImage');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- Served back as the Content-Type. Stored rather than sniffed on read, because
-- the upload route has already validated the magic bytes and re-deriving the
-- answer on every request would be doing that work again for no new fact.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `BannerMime` VARCHAR(32) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'BannerMime');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- Marks a tournament as a test: bot teams and instant resolution are offered
-- here and refused everywhere else. Separate from Published, because an
-- unpublished tournament is a real event somebody is still setting up and must
-- never gain a "fill with bots" button by accident.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `IsTest` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'IsTest');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- ================================================== TournamentTeamMembers

-- A synthetic player. Bots carry a real-looking SteamId so every join, stat
-- and scoreboard path treats them as a player without a special case, and this
-- flag is the only thing that says otherwise — which keeps the special case in
-- one column instead of scattered through the queries.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentTeamMembers` ADD COLUMN `IsBot` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentTeamMembers' AND COLUMN_NAME = 'IsBot');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- ======================================================= OrganizerInvites

-- A link that makes whoever clicks it an organizer.
--
-- Modelled on the team invite rather than on the tournament's invite-only
-- token. That one is a shared secret compared by string equality, so it can
-- gate an action but can never say WHO used it; this needs to name the
-- redeemer, so the token is unique and looked up.
CREATE TABLE IF NOT EXISTS `OrganizerInvites` (
  `Id`               INT NOT NULL AUTO_INCREMENT,
  -- 32 hex characters, from randomBytes(16). Same generator as the team link.
  `Token`            VARCHAR(32) NOT NULL,
  -- 'registry' grants the right to create tournaments at all.
  -- 'tournament' adds the redeemer to one tournament's staff.
  `Kind`             VARCHAR(16) NOT NULL DEFAULT 'registry',
  -- Set only for Kind = 'tournament'.
  `TournamentId`     INT NULL,
  `CreatedBySteamId` BIGINT UNSIGNED NOT NULL,
  `CreatedAt`        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  -- Null means it does not expire. An invite handed out in a call does not
  -- need a clock; one posted in a channel does.
  `ExpiresAt`        DATETIME(6) NULL,
  -- Single use: set on redemption, and checked before granting anything.
  `UsedBySteamId`    BIGINT UNSIGNED NULL,
  `UsedAt`           DATETIME(6) NULL,
  PRIMARY KEY (`Id`),
  -- The unique index is the whole point: it is what makes findUnique by token
  -- possible, and what stops two invites colliding on one string.
  UNIQUE KEY `UX_OrganizerInvites_Token` (`Token`),
  KEY `IX_OrganizerInvites_Tournament` (`TournamentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
