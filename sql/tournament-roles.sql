-- Roles a player holds in a tournament, and the servers matches run on.
--
-- Roles are per player and per SIDE, because sides swap at halftime and a player
-- carries one on each — a single role column would mean somebody is a planter on
-- CT, which is not a thing.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/tournament-roles.sql`.

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentTeamMembers` ADD COLUMN `RoleT` VARCHAR(24) NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentTeamMembers' AND COLUMN_NAME = 'RoleT');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentTeamMembers` ADD COLUMN `RoleCt` VARCHAR(24) NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentTeamMembers' AND COLUMN_NAME = 'RoleCt');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;
