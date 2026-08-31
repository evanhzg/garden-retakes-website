-- A square avatar for a tournament, separate from its banner.
--
-- Tournaments already have BannerImage/BannerMime, and that is a 16:9 card
-- banner: it is drawn full-width at the top of the tournament page and is
-- composed for that shape. The social rail needs a circle about thirty pixels
-- across, and a 16:9 banner cropped to one is whatever happened to be in the
-- middle — usually half a word of the event's name.
--
-- Named to match GardenTeam, which already carries exactly this pair for the
-- same reason, so the serving route and the upload route are the same shape as
-- the ones that exist.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/tournament-avatar.sql`.

SET @add_bytes := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `Tournaments` ADD COLUMN `AvatarBytes` MEDIUMBLOB NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments'
    AND COLUMN_NAME = 'AvatarBytes'
);
PREPARE stmt FROM @add_bytes; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_mime := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `Tournaments` ADD COLUMN `AvatarMime` VARCHAR(32) NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments'
    AND COLUMN_NAME = 'AvatarMime'
);
PREPARE stmt FROM @add_mime; EXECUTE stmt; DEALLOCATE PREPARE stmt;
