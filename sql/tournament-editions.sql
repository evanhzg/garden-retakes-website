-- Everything a tournament needs to be set up, published and run.
--
-- Idempotent, per the convention in this directory. Apply with
-- `node tools/apply-sql.mjs sql/tournament-editions.sql`.
--
-- Written as ADD COLUMN guards rather than one CREATE, because Tournaments,
-- TournamentTeams and TournamentTeamMembers already exist and hold live rows.
-- Every column is nullable or defaulted so an existing tournament stays valid
-- without a backfill.

-- ---------------------------------------------------------------- helper
-- MySQL has no ADD COLUMN IF NOT EXISTS, so each one is a guarded PREPARE.
-- The pattern is verbose and it is the pattern the rest of this directory
-- uses; consistency beats brevity when somebody is reading these in a hurry.

-- ============================================================ Tournaments

-- public | invite
-- Invite-only is not secrecy — the bracket stays readable by anyone — it only
-- gates who may CREATE A TEAM. That distinction is why this is separate from
-- State: a tournament can be invite-only and still fully public to watch.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `Visibility` VARCHAR(16) NOT NULL DEFAULT ''public''')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'Visibility');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- The token in the invite link. Null until invite-only is turned on.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `InviteToken` VARCHAR(32) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'InviteToken');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- single | double | group | swiss. The shape the bracket takes at start.
-- Editable right up until the start button is pressed, which is why it lives
-- here rather than only on a stage: stages do not exist until generation.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `Format` VARCHAR(16) NOT NULL DEFAULT ''single''')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'Format');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- random | faceit | manual. How seeds are decided when the bracket is built.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `Seeding` VARCHAR(16) NOT NULL DEFAULT ''random''')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'Seeding');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `BestOf` TINYINT NOT NULL DEFAULT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'BestOf');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `FinalBestOf` TINYINT NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'FinalBestOf');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- Whether anybody other than an organizer can see it yet. A tournament is
-- built in private and published deliberately — the "preview before it goes
-- public" step. Distinct from State: a published tournament can still be in
-- registration, and an unpublished one is not merely a draft, it is invisible.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `Published` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'Published');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- When the start button was actually pressed. StartsAt is the plan; this is
-- the fact, and it is what makes "the format can still be changed until the
-- tournament starts" a question with a definite answer.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `StartedAt` DATETIME(6) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'StartedAt');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- The Rules tab's organizer-written half. Markdown, rendered on the page.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `RulesText` TEXT NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'RulesText');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `PrizeText` TEXT NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'PrizeText');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `SponsorsText` TEXT NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'SponsorsText');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `DiscordUrl` VARCHAR(255) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'DiscordUrl');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `TeamSpeakUrl` VARCHAR(255) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'TeamSpeakUrl');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- Comma-separated Twitch channel names. A list rather than a table because it
-- is a handful of strings edited as one field and never queried across.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `Tournaments` ADD COLUMN `TwitchChannels` VARCHAR(500) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'TwitchChannels');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- ========================================================= TournamentTeams

-- The token in a team's player-invite link.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentTeams` ADD COLUMN `InviteToken` VARCHAR(32) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentTeams' AND COLUMN_NAME = 'InviteToken');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentTeams` ADD UNIQUE KEY `UX_TournamentTeams_Invite` (`InviteToken`)')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentTeams' AND INDEX_NAME = 'UX_TournamentTeams_Invite');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- =================================================== TournamentTeamMembers

-- What this player is called FOR THIS TOURNAMENT.
--
-- Not a rename of their account. A player's Steam name changes on a whim and
-- often carries clan tags, sponsors or jokes that a bracket should not inherit;
-- an organizer needs a stable name for the duration and the player needs to be
-- recognisable. Null falls back to the profile name, so this is opt-in.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentTeamMembers` ADD COLUMN `DisplayName` VARCHAR(32) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentTeamMembers' AND COLUMN_NAME = 'DisplayName');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- ======================================================= TournamentMatches

-- Ready-up, per side. The veto starts when both are true, or when an admin
-- forces it — which is why these are columns rather than socket state: a team
-- that readied and then reconnected must not have to do it again.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentMatches` ADD COLUMN `ReadyA` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentMatches' AND COLUMN_NAME = 'ReadyA');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentMatches` ADD COLUMN `ReadyB` TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentMatches' AND COLUMN_NAME = 'ReadyB');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentMatches` ADD COLUMN `VetoStartedAt` DATETIME(6) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentMatches' AND COLUMN_NAME = 'VetoStartedAt');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- When the current veto turn runs out. Stored rather than computed so every
-- viewer counts down to the same instant regardless of clock skew, and so a
-- turn survives a page reload.
SET @s := (SELECT IF(COUNT(*) > 0, 'SELECT 1',
  'ALTER TABLE `TournamentMatches` ADD COLUMN `VetoDeadline` DATETIME(6) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'TournamentMatches' AND COLUMN_NAME = 'VetoDeadline');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- Existing tournaments were created before Published existed and are already
-- visible to everybody; leaving them at the new default of 0 would hide them.
UPDATE `Tournaments` SET `Published` = 1 WHERE `State` <> 'draft';
