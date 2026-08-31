-- Who a room line is FOR, as opposed to who said it.
--
--   "room" — everybody on the match page. The default, and what every line
--            written before this column existed was.
--   "a"    — team A only.
--   "b"    — team B only.
--
-- The table already has `Role`, and it is a different question. Role is who is
-- speaking, and it is how a line is drawn: an "a" badge, a "b" badge, a staff
-- one. Scope is who may read it. A captain talking to their own team is
-- Role="a" Scope="a"; the same captain talking to the room is Role="a"
-- Scope="room". Reusing Role for both would have made every existing line
-- private to its own author's team.
--
-- One table rather than three for the same reason Source is one table: it is
-- one conversation, and the panel deciding which lines to draw is a rendering
-- decision. The difference is that this one is also a PERMISSION, so the
-- filtering has to happen in the query and not in the component — see
-- app/api/tournament/room/route.ts, which never sends the other team's lines
-- rather than sending them and hiding them.
--
-- Defaults to 'room' because that is what every row already is: before this
-- there was no way to say anything privately.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/tournament-room-scope.sql`.

SET @add_scope := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `TournamentRoomMessages` ADD COLUMN `Scope` VARCHAR(8) NOT NULL DEFAULT ''room''',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentRoomMessages'
    AND COLUMN_NAME = 'Scope'
);
PREPARE stmt FROM @add_scope; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The read is always "this match, in id order, in these scopes", so the scope
-- belongs in the index the panel already uses rather than in a filter after it.
SET @add_idx := (
  SELECT IF(COUNT(*) = 0,
    'CREATE INDEX `IX_TournamentRoomMessages_Match_Scope` ON `TournamentRoomMessages` (`MatchId`, `Scope`, `Id`)',
    'SELECT 1')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentRoomMessages'
    AND INDEX_NAME = 'IX_TournamentRoomMessages_Match_Scope'
);
PREPARE stmt FROM @add_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;
