-- Where a live match has been told to move to, once the round it is in ends.
--
-- A move cannot happen the moment an admin asks for it: the match is mid-round
-- on the old box, and yanking it would lose the round rather than the server.
-- So the request is stored and applied at the next round end, which the site
-- already learns about from the plugin's own report.
--
-- Null means no move is pending, which is every match almost all of the time.
--
-- Idempotent, and written the long way because MySQL has no
-- ADD COLUMN IF NOT EXISTS: the information_schema check is what makes
-- re-running this safe.
--
-- Apply with `node tools/apply-sql.mjs sql/tournament-pending-server.sql`.

SET @add := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `TournamentMatches` ADD COLUMN `PendingServerId` INT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentMatches'
    AND COLUMN_NAME = 'PendingServerId'
);
PREPARE stmt FROM @add; EXECUTE stmt; DEALLOCATE PREPARE stmt;
