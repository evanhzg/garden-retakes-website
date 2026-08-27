-- Public spectating, and the connect address a spectator needs.
--
-- Idempotent, per the convention in this directory. Apply with
-- `node tools/apply-sql.mjs sql/tournament-spectators.sql`.

-- Whether anybody may spectate, or only the allowlist in TournamentSpectators.
--
-- The allowlist is the right default for a competitive match — a GOTV slot is a
-- seat in the server and an open one is an invitation for whoever finds the
-- address. But a showmatch or a community event wants the opposite, and until
-- now the only way to get it was adding every viewer by SteamID64 one at a
-- time, which nobody was ever going to do.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `SpectatorsPublic` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'SpectatorsPublic');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;
