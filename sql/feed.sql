-- Feed tables. Additive only: nothing here alters a table the game plugin owns,
-- so this is safe to run against the live database.
CREATE TABLE IF NOT EXISTS `FeedClips` (
  `Id`          INT AUTO_INCREMENT PRIMARY KEY,
  `SteamId`     BIGINT UNSIGNED NOT NULL,
  `Title`       VARCHAR(140) NOT NULL,
  `Description` VARCHAR(500) NULL,
  `Kind`        VARCHAR(16) NOT NULL,
  `Source`      VARCHAR(255) NOT NULL,
  `Thumb`       VARCHAR(255) NULL,
  `Bytes`       INT NULL,
  `CreatedAt`   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX `FeedClips_SteamId_idx` (`SteamId`),
  INDEX `FeedClips_CreatedAt_idx` (`CreatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `FeedClipLikes` (
  `ClipId`  INT NOT NULL,
  `SteamId` BIGINT UNSIGNED NOT NULL,
  `AtUtc`   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`ClipId`, `SteamId`),
  CONSTRAINT `FeedClipLikes_Clip_fk` FOREIGN KEY (`ClipId`) REFERENCES `FeedClips`(`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `FeedClipComments` (
  `Id`      INT AUTO_INCREMENT PRIMARY KEY,
  `ClipId`  INT NOT NULL,
  `SteamId` BIGINT UNSIGNED NOT NULL,
  `Body`    VARCHAR(500) NOT NULL,
  `AtUtc`   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX `FeedClipComments_ClipId_idx` (`ClipId`),
  CONSTRAINT `FeedClipComments_Clip_fk` FOREIGN KEY (`ClipId`) REFERENCES `FeedClips`(`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Renditions + pipeline identity, added when the highlight pipeline landed.
ALTER TABLE `FeedClips`
  ADD COLUMN IF NOT EXISTS `DurationSec` INT NULL,
  ADD COLUMN IF NOT EXISTS `Variants` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `ExternalId` VARCHAR(190) NULL,
  ADD UNIQUE INDEX IF NOT EXISTS `FeedClips_ExternalId_key` (`ExternalId`);
