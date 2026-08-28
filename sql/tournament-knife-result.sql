-- Who won the knife round, and which way it sent them.
--
-- Only ever set on a map whose sides the veto did NOT settle: a BO1, or the
-- decider of a longer series. Everywhere else the veto recorded the sides when
-- the map was picked, and there was no knife round to report.
--
-- Worth storing because it is the one part of a knifed map the website cannot
-- work out for itself. The sides are decided in game, and until now the match
-- page could only ever say "knife round" and never how it went — so a map whose
-- sides looked wrong had no record to check against.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/tournament-knife-result.sql`.

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentMatchMaps` ADD COLUMN `KnifeWinnerTeamId` INT NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentMatchMaps'
    AND COLUMN_NAME = 'KnifeWinnerTeamId');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;

SET @add := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentMatchMaps` ADD COLUMN `KnifeChoice` VARCHAR(8) NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TournamentMatchMaps'
    AND COLUMN_NAME = 'KnifeChoice');
PREPARE s FROM @add; EXECUTE s; DEALLOCATE PREPARE s;
