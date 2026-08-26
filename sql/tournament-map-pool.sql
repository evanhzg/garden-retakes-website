-- The default tournament map pool.
--
-- Idempotent, per the convention in this directory. Apply with
-- `node tools/apply-sql.mjs sql/tournament-map-pool.sql`.
--
-- The Spawn Maker lists maps from GardenMaps, so an empty table means the page
-- says "No maps in the library yet" and there is nothing to author against —
-- which is exactly where a fresh database starts. This seeds the seven agreed
-- for the tournament.
--
-- `Mode` is 'tournament' rather than 'retakes' so these rows cannot land in the
-- ladder's map cycle, which reads its own mode. TournamentReady is 1 because
-- that is the whole point of these rows; a map added to the ladder still has to
-- be marked ready by hand before a bracket can veto it.
--
-- Artwork: the repository already ships /maps/<name>.webp for the stock pool
-- and lib/mapArt.ts falls back to it, so ImageUrl is left null rather than
-- baked to a path that would go stale if those files moved.

INSERT INTO `GardenMaps` (`Mode`, `MapName`, `DisplayName`, `TournamentReady`, `ImageUrl`, `WorkshopId`)
SELECT * FROM (
  SELECT 'tournament' AS Mode, 'de_dust2'   AS MapName, 'Dust II' AS DisplayName, 1 AS TournamentReady, NULL AS ImageUrl, NULL AS WorkshopId
  UNION ALL SELECT 'tournament', 'de_inferno', 'Inferno', 1, NULL, NULL
  UNION ALL SELECT 'tournament', 'de_cache',   'Cache',   1, NULL, NULL
  UNION ALL SELECT 'tournament', 'de_anubis',  'Anubis',  1, NULL, NULL
  UNION ALL SELECT 'tournament', 'de_mirage',  'Mirage',  1, NULL, NULL
  UNION ALL SELECT 'tournament', 'de_ancient', 'Ancient', 1, NULL, NULL
  UNION ALL SELECT 'tournament', 'de_nuke',    'Nuke',    1, NULL, NULL
) AS seed
WHERE NOT EXISTS (
  -- Keyed on the map name alone, not on (mode, name): if a map is already in
  -- the library for the ladder, a second row for the tournament would show the
  -- same map twice in every picker.
  SELECT 1 FROM `GardenMaps` existing WHERE existing.`MapName` = seed.`MapName`
);

-- A map already in the library for another mode still has to be usable by a
-- tournament, and a pre-existing row would not have been marked. This does not
-- touch anything outside the seven.
UPDATE `GardenMaps`
SET `TournamentReady` = 1
WHERE `MapName` IN ('de_dust2','de_inferno','de_cache','de_anubis','de_mirage','de_ancient','de_nuke');

-- Fill in display names only where nothing has been set, so an admin's own
-- naming is never overwritten by re-running this.
UPDATE `GardenMaps` SET `DisplayName` = 'Dust II' WHERE `MapName` = 'de_dust2'   AND (`DisplayName` IS NULL OR `DisplayName` = '');
UPDATE `GardenMaps` SET `DisplayName` = 'Inferno' WHERE `MapName` = 'de_inferno' AND (`DisplayName` IS NULL OR `DisplayName` = '');
UPDATE `GardenMaps` SET `DisplayName` = 'Cache'   WHERE `MapName` = 'de_cache'   AND (`DisplayName` IS NULL OR `DisplayName` = '');
UPDATE `GardenMaps` SET `DisplayName` = 'Anubis'  WHERE `MapName` = 'de_anubis'  AND (`DisplayName` IS NULL OR `DisplayName` = '');
UPDATE `GardenMaps` SET `DisplayName` = 'Mirage'  WHERE `MapName` = 'de_mirage'  AND (`DisplayName` IS NULL OR `DisplayName` = '');
UPDATE `GardenMaps` SET `DisplayName` = 'Ancient' WHERE `MapName` = 'de_ancient' AND (`DisplayName` IS NULL OR `DisplayName` = '');
UPDATE `GardenMaps` SET `DisplayName` = 'Nuke'    WHERE `MapName` = 'de_nuke'    AND (`DisplayName` IS NULL OR `DisplayName` = '');
