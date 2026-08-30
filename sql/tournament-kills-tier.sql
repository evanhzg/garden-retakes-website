-- Where a round left both sides on the Blitz Tier ladder.
--
-- On the round row rather than in a table of its own: it is part of what the
-- round did. A feed that says "A won" and then, separately, "A is on High"
-- makes the reader join the two up, and a second table would have to be
-- interleaved by round number to draw one line.
--
-- Tier is 1 to 3 after the round. Move is signed and is the arrow count — the
-- feed draws one chevron per rung, so a zero draws nothing, which is how
-- staying put reads as staying put. Both are null on every row that is not a
-- round, and on every round played before this column existed.
--
-- Idempotent, and written the long way because MySQL has no
-- ADD COLUMN IF NOT EXISTS: the information_schema check is what makes
-- re-running this safe.
--
-- Apply with `node tools/apply-sql.mjs sql/tournament-kills-tier.sql`.

SET @add_tier_a := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `TournamentKills` ADD COLUMN `TierA` TINYINT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentKills' AND COLUMN_NAME = 'TierA'
);
PREPARE stmt FROM @add_tier_a; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_tier_b := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `TournamentKills` ADD COLUMN `TierB` TINYINT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentKills' AND COLUMN_NAME = 'TierB'
);
PREPARE stmt FROM @add_tier_b; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_move_a := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `TournamentKills` ADD COLUMN `MoveA` TINYINT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentKills' AND COLUMN_NAME = 'MoveA'
);
PREPARE stmt FROM @add_move_a; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_move_b := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `TournamentKills` ADD COLUMN `MoveB` TINYINT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentKills' AND COLUMN_NAME = 'MoveB'
);
PREPARE stmt FROM @add_move_b; EXECUTE stmt; DEALLOCATE PREPARE stmt;
