-- Rematches: which match a match is a rematch OF, and who has agreed to it.
--
-- Two additions, both idempotent.
--
-- `RematchOfMatchId` on TournamentMatches is the link back to the match that
-- was played first. It is what makes "already rematched" answerable without a
-- second table, and what lets the new match know which map is game one — the
-- rematch is a BO3 whose first game is already in the books, so the played map
-- has to stay findable rather than being copied across as a number.
--
-- Nullable, and null for every match that exists today. A match with no
-- rematch parent is the normal case and always will be.
--
-- `TournamentRematchVotes` is the vote. One row per person per match, rather
-- than a JSON blob on the match, because the question "who have we not heard
-- from" is asked every two seconds by everybody in the lobby and is a much
-- better index than a document scan. The unique key is the pair, so a second
-- click is an update and not a second vote.
--
-- No foreign keys, per the house rule for this schema.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/tournament-rematch.sql`.

SET @add_parent := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `TournamentMatches` ADD COLUMN `RematchOfMatchId` INT NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentMatches'
    AND COLUMN_NAME = 'RematchOfMatchId'
);
PREPARE stmt FROM @add_parent; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- "Has this match been rematched already?" is a lookup by parent, and it runs
-- on every view of a finished match.
SET @add_parent_idx := (
  SELECT IF(COUNT(*) = 0,
    'CREATE INDEX `IX_TournamentMatches_RematchOf` ON `TournamentMatches` (`RematchOfMatchId`)',
    'SELECT 1')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentMatches'
    AND INDEX_NAME = 'IX_TournamentMatches_RematchOf'
);
PREPARE stmt FROM @add_parent_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `TournamentRematchVotes` (
  `Id`        INT NOT NULL AUTO_INCREMENT,
  -- The match that ENDED, not the rematch — the rematch does not exist yet
  -- while the vote is running, and cannot be what the vote hangs off.
  `MatchId`   INT NOT NULL,
  `SteamId`   BIGINT UNSIGNED NOT NULL,
  -- 1 = in, 0 = out. A row that exists is an answer; no row is silence, which
  -- is a third state and the one the lobby is waiting on.
  `Accepted`  TINYINT(1) NOT NULL DEFAULT 1,
  `AtUtc`     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_TournamentRematchVotes` (`MatchId`, `SteamId`),
  KEY `IX_TournamentRematchVotes_Match` (`MatchId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
