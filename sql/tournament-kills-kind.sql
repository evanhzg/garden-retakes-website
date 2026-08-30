-- The feed is not only kills.
--
-- A round ending, and who defused, are the two things people ask about that a
-- list of kills cannot answer: "how did they win that" is answered by "defused
-- with two down", not by the last kill in it. Both belong in the same feed, in
-- the same order, so they are rows in the same table rather than a second list
-- the page would have to interleave by timestamp.
--
-- Kind defaults to 'kill' so every row written before this is exactly what it
-- was. WinnerSlot and Reason are null on a kill and only mean something on a
-- round row.
--
-- Idempotent, and written the long way because MySQL has no
-- ADD COLUMN IF NOT EXISTS: the information_schema check is what makes
-- re-running this safe.
--
-- Apply with `node tools/apply-sql.mjs sql/tournament-kills-kind.sql`.

SET @add_kind := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `TournamentKills` ADD COLUMN `Kind` VARCHAR(16) NOT NULL DEFAULT ''kill''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentKills' AND COLUMN_NAME = 'Kind'
);
PREPARE stmt FROM @add_kind; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_winner := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `TournamentKills` ADD COLUMN `WinnerSlot` VARCHAR(1) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentKills' AND COLUMN_NAME = 'WinnerSlot'
);
PREPARE stmt FROM @add_winner; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_reason := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `TournamentKills` ADD COLUMN `Reason` VARCHAR(24) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentKills' AND COLUMN_NAME = 'Reason'
);
PREPARE stmt FROM @add_reason; EXECUTE stmt; DEALLOCATE PREPARE stmt;
