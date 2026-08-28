-- The role draft: the step between ready-up and the veto.
--
-- Roles were a registration form nobody filled in, and a team sheet with three
-- empty roles plays three generalists — which is not a format so much as the
-- absence of one. This adds the draft: a snake through both rosters, a clock
-- per turn, and a record of what each player actually played in each match.
--
-- Why the picks are a table rather than the two columns already on
-- TournamentTeamMembers: a role is part of what a match WAS. Reading a finished
-- match's roles off the team sheet would show whatever those players picked
-- most recently, which for a tournament that re-drafts every match is a
-- scoreboard that changes after the fact. The sheet is still written, so the
-- next match has a starting point.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/tournament-role-draft.sql`.

-- ---------------------------------------------------------------- tournament

-- tournament | match. Whether teams draft once and keep it, or are prompted
-- before every match so they can answer the opponent. Defaulted to "tournament"
-- because that is what every existing event has effectively been doing, and a
-- migration should not change how a running tournament behaves.
SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `RoleMode` VARCHAR(16) NOT NULL DEFAULT ''tournament''')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'RoleMode');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

-- --------------------------------------------------------------------- match

-- The draft's own clock, not the veto's. It has its own turn order — a snake
-- through the two rosters rather than an alternation between two captains — and
-- one shared deadline column would have to mean two things at once.
SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentMatches` ADD COLUMN `RolesStartedAt` DATETIME(6) NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentMatches' AND COLUMN_NAME = 'RolesStartedAt');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentMatches` ADD COLUMN `RolesDeadline` DATETIME(6) NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentMatches' AND COLUMN_NAME = 'RolesDeadline');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

-- Which team picks first, drawn when the draft opens. It is the one thing about
-- the draft that cannot be recomputed, which is exactly why it is written down;
-- drawing it per match rather than always giving it to the bracket's A slot
-- stops the same advantage following one team around all evening.
SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentMatches` ADD COLUMN `RolesFirstTeamId` INT NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentMatches' AND COLUMN_NAME = 'RolesFirstTeamId');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

-- --------------------------------------------------------------------- picks

CREATE TABLE IF NOT EXISTS `TournamentRolePicks` (
  `Id`      INT NOT NULL AUTO_INCREMENT,
  `MatchId` INT NOT NULL,
  -- Position in the snake. 0 is the first pick of the whole draft.
  `Ordinal` INT NOT NULL,
  `TeamId`  INT NOT NULL,
  `SteamId` BIGINT UNSIGNED NOT NULL,
  -- Per side, for the same reason TournamentTeamMembers has two columns: sides
  -- swap at halftime and a player carries one role on each.
  `RoleT`   VARCHAR(24) NULL,
  `RoleCt`  VARCHAR(24) NULL,
  -- Whether a turn ran out and the system chose, as on a veto action. An
  -- auto-pick that looks deliberate is a support conversation nobody can
  -- resolve.
  `WasAuto` TINYINT(1) NOT NULL DEFAULT 0,
  `ActedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_TournamentRolePicks_Player` (`MatchId`, `SteamId`),
  UNIQUE KEY `UX_TournamentRolePicks_Ordinal` (`MatchId`, `Ordinal`),
  KEY `IX_TournamentRolePicks_Match` (`MatchId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
