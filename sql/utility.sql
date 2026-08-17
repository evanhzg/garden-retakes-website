-- Saved grenade lineups, written by the game server and read by the utility page.
-- Additive: no existing table is touched.
--
-- This file is the "start from nothing" path. The plugin's SchemaUpgrades.cs
-- applies the same shape idempotently at runtime and is what a live server
-- actually follows, so the two have to agree — this one had drifted three
-- migrations behind: ThrowType still defaulted to the pre-taxonomy 'standing',
-- and the six columns added since (the three screenshots, the two review flags
-- and MarkedStand) were missing entirely.
CREATE TABLE IF NOT EXISTS `GardenNades` (
  `Id`             INT NOT NULL AUTO_INCREMENT,
  `Map`            VARCHAR(64)  NOT NULL,
  `Name`           VARCHAR(120) NOT NULL,
  `Area`           VARCHAR(64)  NOT NULL DEFAULT '',
  `Utility`        VARCHAR(16)  NOT NULL DEFAULT 'smoke',
  `Purpose`        VARCHAR(16)  NOT NULL DEFAULT 'default',
  `Team`           VARCHAR(2)   NOT NULL DEFAULT '',
  -- stand | crouch | walk | jump | w-jump | step-jump | 2step-jump |
  -- run-jump | crouch-jump. Canonical list is lib/utilityShared.ts, mirrored in
  -- the plugin's ThrowCapture.ThrowTypes.
  `ThrowType`      VARCHAR(16)  NOT NULL DEFAULT 'stand',
  `ClickType`      VARCHAR(8)   NOT NULL DEFAULT 'left',
  `StandX`         DOUBLE NOT NULL,
  `StandY`         DOUBLE NOT NULL,
  `StandZ`         DOUBLE NOT NULL,
  `Pitch`          DOUBLE NOT NULL,
  `Yaw`            DOUBLE NOT NULL,
  `LandX`          DOUBLE NULL,
  `LandY`          DOUBLE NULL,
  `LandZ`          DOUBLE NULL,
  `Notes`          VARCHAR(500) NULL,
  `ClipUrl`        VARCHAR(500) NULL,
  `Thumb`          VARCHAR(500) NULL,
  `Verified`       TINYINT(1) NOT NULL DEFAULT 1,
  `Source`         VARCHAR(16) NOT NULL DEFAULT 'ingame',
  `AddedBySteamId` BIGINT UNSIGNED NULL,
  `CreatedAt`      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  -- The three stills every lineup site publishes. Coordinates say where to
  -- stand; only a picture says what to look at.
  `ShotStand`      VARCHAR(500) NULL,
  `ShotAim`        VARCHAR(500) NULL,
  `ShotResult`     VARCHAR(500) NULL,
  -- Set on rows whose throw type was guessed by the taxonomy migration rather
  -- than recorded, so a guess can be confirmed instead of quietly standing.
  `NeedsReview`    TINYINT(1) NOT NULL DEFAULT 0,
  -- Waiting for its stills. Drives the capture queue.
  `NeedsShots`     TINYINT(1) NOT NULL DEFAULT 1,
  -- Whether the stand position came from an explicit !lineup mark rather than
  -- the last-grounded fallback.
  `MarkedStand`    TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`Id`),
  KEY `IX_GardenNades_Map` (`Map`),
  KEY `IX_GardenNades_Map_Area` (`Map`,`Area`),
  KEY `IX_GardenNades_NeedsShots` (`NeedsShots`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The pending capture: one row per admin, replaced on every throw.
--
-- Keyed by SteamId rather than auto-increment on purpose — re-throwing has to
-- overwrite, which is exactly the "replaces until you validate" behaviour the
-- Game Maker's Utility tab promises.
CREATE TABLE IF NOT EXISTS `GardenNadeDrafts` (
  `SteamId`     BIGINT UNSIGNED NOT NULL,
  `Map`         VARCHAR(64) NOT NULL,
  `Utility`     VARCHAR(16) NOT NULL DEFAULT 'smoke',
  `Team`        VARCHAR(2)  NOT NULL DEFAULT '',
  `ThrowType`   VARCHAR(16) NOT NULL DEFAULT 'stand',
  `ClickType`   VARCHAR(8)  NOT NULL DEFAULT 'left',
  `StandX`      DOUBLE NOT NULL,
  `StandY`      DOUBLE NOT NULL,
  `StandZ`      DOUBLE NOT NULL,
  `Pitch`       DOUBLE NOT NULL,
  `Yaw`         DOUBLE NOT NULL,
  `LandX`       DOUBLE NULL,
  `LandY`       DOUBLE NULL,
  `LandZ`       DOUBLE NULL,
  `MarkedStand` TINYINT(1) NOT NULL DEFAULT 0,
  `CapturedAt`  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
