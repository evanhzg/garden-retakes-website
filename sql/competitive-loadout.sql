-- Competitive retakes: the loadout picker's storage, and map preferences.
--
-- Idempotent, and safe to run twice: the table is IF NOT EXISTS, and each
-- column add is guarded against information_schema.
--
-- Written without DELIMITER or a stored procedure on purpose. MySQL has no
-- ADD COLUMN IF NOT EXISTS, and the usual workaround is a procedure — but
-- DELIMITER is a directive of the `mysql` command-line client, not SQL, so a
-- file that uses it can only be applied by that one tool. These statements go
-- through a driver as well, which is how tools/apply-sql.mjs runs them.

-- ---------------------------------------------------------------- bundles
--
-- The loadout page stopped offering four weapon dropdowns per side and started
-- offering a handful of named options per round type — "Default + Kevlar",
-- "Rifle + Kit" — each picked for T, for CT, or for both. `Bundles` is what the
-- picker writes and reads back: the choice itself, as
--
--   { "T": { "pistol": "<id>", "half": "<id>", "full": "<id>" }, "CT": { ... } }
--
-- The columns beside it are derived from that choice on save. They are columns
-- rather than fields inside the JSON so the game server can read a preference
-- with a plain SELECT instead of parsing JSON in SQL — the same reason
-- KevlarPistolT/Ct already were.
--
-- The weapon half of an option is deliberately not here. It is written through
-- to UserSettings.WeaponPreferences, which the allocator plugin has read every
-- buy round since long before this table existed, and still owns.

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `GardenRetakeLoadouts` ADD COLUMN `Bundles` TEXT NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GardenRetakeLoadouts' AND COLUMN_NAME = 'Bundles');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `GardenRetakeLoadouts` ADD COLUMN `KevlarForceT` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GardenRetakeLoadouts' AND COLUMN_NAME = 'KevlarForceT');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `GardenRetakeLoadouts` ADD COLUMN `KevlarForceCt` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GardenRetakeLoadouts' AND COLUMN_NAME = 'KevlarForceCt');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `GardenRetakeLoadouts` ADD COLUMN `KevlarFullT` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GardenRetakeLoadouts' AND COLUMN_NAME = 'KevlarFullT');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `GardenRetakeLoadouts` ADD COLUMN `KevlarFullCt` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GardenRetakeLoadouts' AND COLUMN_NAME = 'KevlarFullCt');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

-- CT only, both of these: there is nothing for a T to defuse.
SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `GardenRetakeLoadouts` ADD COLUMN `KitForceCt` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GardenRetakeLoadouts' AND COLUMN_NAME = 'KitForceCt');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `GardenRetakeLoadouts` ADD COLUMN `KitFullCt` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GardenRetakeLoadouts' AND COLUMN_NAME = 'KitFullCt');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

-- ------------------------------------------------------------------ the gate
--
-- False for everybody the day this ships, and that is the point rather than an
-- oversight: the picker is new, the options it writes did not exist before it,
-- and a row that already said "set" would mean a player never sees the thing
-- that sets them.
SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `GardenOnboardingStates` ADD COLUMN `CompletedRetakeSetup` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GardenOnboardingStates' AND COLUMN_NAME = 'CompletedRetakeSetup');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------- map preferences
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
