-- Where a room line was said.
--
--   "room" — typed on the website, in the match room panel.
--   "game" — said in the server, relayed here by the plugin.
--
-- One table rather than two, because they are one conversation seen from two
-- places: an admin reading the room needs to see that a player said "server is
-- lagging" in game, and a player in the server needs to see the admin's answer.
-- Two tables would mean the page interleaving them by timestamp to get back to
-- the order they already happened in.
--
-- The panel can still show them apart — that is what the toggle is for — but
-- that is a rendering decision, not a storage one.
--
-- Defaults to "room" because every row written before this was typed on the
-- website; that was the only way to write one.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/tournament-room-source.sql`.

SET @add_source := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `TournamentRoomMessages` ADD COLUMN `Source` VARCHAR(8) NOT NULL DEFAULT ''room''',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentRoomMessages'
    AND COLUMN_NAME = 'Source'
);
PREPARE stmt FROM @add_source; EXECUTE stmt; DEALLOCATE PREPARE stmt;
