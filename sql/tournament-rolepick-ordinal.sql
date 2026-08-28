-- The role draft's ordinal stops being unique.
--
-- TournamentRolePicks carried two unique indexes: (MatchId, SteamId), which is
-- the real invariant — one pick per player per match — and (MatchId, Ordinal),
-- which was only ever a tidiness rule and which production kept failing:
--
--   PrismaClientKnownRequestError P2002
--   Unique constraint failed on the constraint: `UX_TournamentRolePicks_Ordinal`
--
-- Eleven of them, on /api/tournament/roles. Two writers race for the same
-- number. carryForwardSettledRoles() reads which players already have a pick and
-- then creates rows at 1000, 1001, … — check-then-act, so two requests a
-- moment apart both start at 1000. And recordRolePick() takes its ordinal from
-- the caller, which computes it from state that can be read twice before either
-- write lands.
--
-- Nothing needs the number to be unique. It is read for `ORDER BY Ordinal` and
-- for the >= 1000 marker that says "this team was not drafting", and both work
-- with duplicates. The pick that must not be duplicated is the player's, and
-- that index stays.
--
-- A plain index replaces it, because the ordering read is the reason the column
-- is indexed at all.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/tournament-rolepick-ordinal.sql`.

SET @drop := (SELECT IF(COUNT(*) = 0, 'SELECT 1',
  'ALTER TABLE `TournamentRolePicks` DROP INDEX `UX_TournamentRolePicks_Ordinal`')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentRolePicks'
    AND INDEX_NAME = 'UX_TournamentRolePicks_Ordinal');
PREPARE s FROM @drop; EXECUTE s; DEALLOCATE PREPARE s;

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentRolePicks` ADD INDEX `IX_TournamentRolePicks_Ordinal` (`MatchId`, `Ordinal`)')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentRolePicks'
    AND INDEX_NAME = 'IX_TournamentRolePicks_Ordinal');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;
