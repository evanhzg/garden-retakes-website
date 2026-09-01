-- A player's chosen status, as opposed to the one the server observes.
--
-- The site already knows two things about presence and neither is this: the
-- socket knows who has a tab open, and /api/live knows who is in a game. Both
-- are OBSERVED. What was missing is the one a person sets on purpose — "I am
-- here but do not message me" — which no amount of watching can infer.
--
-- Four values, and the reason for each:
--
--   online     the default, and what every existing row means
--   away       here, not at the keyboard
--   dnd        here, and asking not to be interrupted. The one that changes
--              anybody else's behaviour rather than just their reading of you.
--   invisible  appear offline. Kept separate from `away` because the two are
--              opposite intentions that look similar from outside.
--
-- Not an ENUM: this schema uses VARCHAR with the values written down beside
-- the column everywhere else, and an ENUM makes adding a fifth a migration.
--
-- Nullable, and null means "online". Backfilling every existing row to write
-- down a default they already have is a write for nothing.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/web-presence.sql`.

SET @add_presence := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `GardenWebProfiles` ADD COLUMN `Presence` VARCHAR(12) NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'GardenWebProfiles'
    AND COLUMN_NAME = 'Presence'
);
PREPARE stmt FROM @add_presence; EXECUTE stmt; DEALLOCATE PREPARE stmt;
