CREATE TABLE IF NOT EXISTS `GardenClipRequests` (
  `Id`          INT NOT NULL AUTO_INCREMENT,
  `SteamId`     BIGINT UNSIGNED NOT NULL,
  `PlayerName`  VARCHAR(64)  NOT NULL DEFAULT '',
  `Map`         VARCHAR(64)  NOT NULL,
  `DemoFile`    VARCHAR(160) NOT NULL,
  `SessionId`   VARCHAR(64)  NOT NULL,
  `Tick`        INT NOT NULL,
  `DurationSec` INT NOT NULL DEFAULT 15,
  `Status`      VARCHAR(16) NOT NULL DEFAULT 'pending',
  `Note`        VARCHAR(500) NULL,
  `ClipId`      INT NULL,
  `CreatedAt`   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `ProcessedAt` DATETIME(6) NULL,
  PRIMARY KEY (`Id`),
  KEY `IX_GardenClipRequests_Status` (`Status`),
  KEY `IX_GardenClipRequests_SessionId` (`SessionId`),
  KEY `IX_GardenClipRequests_SteamId` (`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- MySQL has no ADD COLUMN IF NOT EXISTS (that is MariaDB), so these are written
-- plainly; running them twice errors harmlessly with 'duplicate column'.
ALTER TABLE `FeedClips` ADD COLUMN `Unlisted` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `FeedClips` ADD COLUMN `SessionId` VARCHAR(64) NULL;
ALTER TABLE `FeedClips` ADD COLUMN `Tags` VARCHAR(200) NOT NULL DEFAULT '';
