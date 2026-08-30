-- Alerts get a source and a home.
--
-- TournamentAlerts already existed and already worked: a player types .admin,
-- the plugin posts, a row is written. What it could not answer is the two
-- questions an organizer asks first — WHICH tournament is this, and where do I
-- click — and the one that decides how to react: did this come from somebody in
-- the server, or from somebody typing in the match room on the website.
--
-- MatchKey was the only handle, and resolving it to a match means a lookup on
-- every render of every alert. MatchId and TournamentId are written once, when
-- the alert is raised and the answer is already in hand.
--
-- Source defaults to 'game' because every row written before this came from the
-- plugin — that was the only way to raise one.
--
-- Idempotent, the long way round, because MySQL has no ADD COLUMN IF NOT EXISTS.
-- Apply with `node tools/apply-sql.mjs sql/tournament-alerts-scope.sql`.

SET @add_source := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `TournamentAlerts` ADD COLUMN `Source` VARCHAR(8) NOT NULL DEFAULT ''game''',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentAlerts' AND COLUMN_NAME = 'Source'
);
PREPARE stmt FROM @add_source; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_tid := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `TournamentAlerts` ADD COLUMN `TournamentId` INT NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentAlerts' AND COLUMN_NAME = 'TournamentId'
);
PREPARE stmt FROM @add_tid; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_mid := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `TournamentAlerts` ADD COLUMN `MatchId` INT NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentAlerts' AND COLUMN_NAME = 'MatchId'
);
PREPARE stmt FROM @add_mid; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Organizers read "the open alerts for MY tournament", which is this index.
SET @add_idx := (
  SELECT IF(COUNT(*) = 0,
    'CREATE INDEX `IX_TournamentAlerts_Tournament` ON `TournamentAlerts` (`TournamentId`, `AckedAt`, `CreatedAt`)',
    'SELECT 1')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentAlerts'
    AND INDEX_NAME = 'IX_TournamentAlerts_Tournament'
);
PREPARE stmt FROM @add_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;
