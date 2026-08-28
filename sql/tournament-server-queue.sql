-- The server waitlist.
--
-- A bracket releases a whole round of matches at once and the fleet is six
-- servers, so more matches want to play than there is room for. Before this,
-- startMatch simply failed with "No server is free" and the match sat in
-- "ready" — indistinguishable, from the match page, from a match nobody had
-- got round to starting. Two organizers watching that both press start, and
-- whoever the scheduler happens to serve first wins.
--
-- QueuedAt makes waiting a state rather than an absence: the match says it is
-- waiting, the page can say how many are ahead of it, and the next server to be
-- released goes to whoever has waited longest rather than to whoever retries
-- fastest.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/tournament-server-queue.sql`.

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentMatches` ADD COLUMN `QueuedAt` DATETIME(6) NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentMatches' AND COLUMN_NAME = 'QueuedAt');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

-- The queue is read in order on every server release, so it is worth an index.
SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'CREATE INDEX `IX_TournamentMatches_Queued` ON `TournamentMatches` (`QueuedAt`)')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentMatches'
    AND INDEX_NAME = 'IX_TournamentMatches_Queued');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;
