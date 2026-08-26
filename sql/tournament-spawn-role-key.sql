-- A spawn name can hold more than one role.
--
-- Idempotent, per the convention in this directory. Apply with
-- `node tools/apply-sql.mjs sql/tournament-spawn-role-key.sql`.
--
-- The unique key was (Map, Bombsite, Team, Name), which said "one position per
-- name per side of a site". That is wrong for the way a site is actually
-- authored: "Short" is one place, and a front-runner holding Short, a backup
-- behind them and a roamer cutting through all want their own positions there,
-- under that name, because the name is the PLACE and the role is the JOB.
--
-- With the old key the second one silently overwrote the first — same row,
-- new RoleId, and the earlier role's variants inherited by whoever came last.
-- No error, no warning, just a spawn that used to exist and did not any more.
--
-- Adding RoleId to the key makes (place, role) the identity, which is what the
-- Maker was always trying to express.

-- Dropped and recreated rather than altered: MySQL has no rename-with-columns
-- for a unique index, and IF EXISTS keeps this re-runnable.
SET @drop := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE `TournamentSpawns` DROP INDEX `UX_TournamentSpawns`',
  'SELECT 1')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentSpawns'
    AND INDEX_NAME = 'UX_TournamentSpawns');
PREPARE s FROM @drop; EXECUTE s; DEALLOCATE PREPARE s;

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentSpawns` ADD UNIQUE KEY `UX_TournamentSpawns` (`Map`,`Bombsite`,`Team`,`Name`,`RoleId`)')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentSpawns'
    AND INDEX_NAME = 'UX_TournamentSpawns');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;
