-- Competitive retakes: the loadout picker's storage, and map preferences.
--
-- Idempotent, and safe to run against a database that already has some of it:
-- every statement is IF NOT EXISTS, and the ALTERs go through a procedure
-- because MySQL has no ADD COLUMN IF NOT EXISTS.

-- ---------------------------------------------------------------- bundles
--
-- The loadout page stopped offering four weapon dropdowns and started offering
-- a handful of named bundles per round type — "Default + Kevlar", "Rifle +
-- Kit" — each picked for T, for CT, or for both. `Bundles` is what the picker
-- writes and reads back: the choice itself, as
--
--   { "T": { "pistol": "<id>", "half": "<id>", "full": "<id>" }, "CT": { ... } }
--
-- The columns beside it are derived from that choice on save. They exist as
-- columns rather than as fields inside the JSON so the game server can read a
-- preference with a plain SELECT instead of parsing JSON in SQL — the same
-- reason KevlarPistolT/Ct already were.
--
-- The weapon half of a bundle is deliberately not here. It is written through
-- to UserSettings.WeaponPreferences, which the allocator plugin has read every
-- buy round since long before this table existed and still owns.

DROP PROCEDURE IF EXISTS `garden_add_column`;
DELIMITER //
CREATE PROCEDURE `garden_add_column`(
  IN tbl VARCHAR(64), IN col VARCHAR(64), IN spec VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', spec);
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL garden_add_column('GardenRetakeLoadouts', 'Bundles',       'TEXT NULL');
CALL garden_add_column('GardenRetakeLoadouts', 'KevlarForceT',  'TINYINT(1) NOT NULL DEFAULT 0');
CALL garden_add_column('GardenRetakeLoadouts', 'KevlarForceCt', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL garden_add_column('GardenRetakeLoadouts', 'KevlarFullT',   'TINYINT(1) NOT NULL DEFAULT 0');
CALL garden_add_column('GardenRetakeLoadouts', 'KevlarFullCt',  'TINYINT(1) NOT NULL DEFAULT 0');
-- CT only: there is nothing for a T to defuse.
CALL garden_add_column('GardenRetakeLoadouts', 'KitForceCt',    'TINYINT(1) NOT NULL DEFAULT 0');
CALL garden_add_column('GardenRetakeLoadouts', 'KitFullCt',     'TINYINT(1) NOT NULL DEFAULT 0');

-- ------------------------------------------------------------ the gate
--
-- False for everybody the day this ships, and that is the point rather than an
-- oversight: the picker is new, the bundles it writes did not exist before it,
-- and a row that already said "set" would mean a player never sees the thing
-- that sets them.
CALL garden_add_column(
  'GardenOnboardingStates', 'CompletedRetakeSetup', 'TINYINT(1) NOT NULL DEFAULT 0'
);

DROP PROCEDURE IF EXISTS `garden_add_column`;

-- -------------------------------------------------------- map preferences
--
-- Up to four of the ten maps a player never wants to be sent to. A preference,
-- not a veto: the matchmaker pairs two parties only when what both captains
-- allow still leaves enough maps to run a veto on, and widens what counts as
-- enough the longer they have waited. Saved per account so it is set once and
-- pre-fills the lobby, where a captain can adjust it for one queue without
-- writing the change back.
CREATE TABLE IF NOT EXISTS `GardenMapPreferences` (
  `SteamId`   BIGINT UNSIGNED NOT NULL,
  `Excluded`  TEXT NOT NULL,
  `UpdatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
