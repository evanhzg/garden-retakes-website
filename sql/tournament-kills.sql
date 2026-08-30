-- The killfeed: one row per kill in a tournament match.
--
-- Nothing recorded a kill before this. TournamentPlayerStats holds the totals —
-- kills, deaths, damage — pushed as a whole table every couple of seconds, which
-- is enough to draw a scoreboard and no use at all for a feed: totals cannot
-- tell you WHO killed WHOM with WHAT, which is the entire content of a killfeed.
--
-- Append-only and deliberately narrow. A row is written once by the ingest and
-- never updated, and the page reads the tail of it.
--
-- Names are stored alongside the ids rather than joined at read time. A bot has
-- no profile row to join to, and a player who changes their Steam name should
-- not retroactively rewrite a feed of a match played last month — the feed is a
-- record of what was on screen.
--
-- NOTE: this database has NO foreign keys. Prisma's `onDelete: Cascade` is a
-- client-side fiction here, so deleting a match must delete these rows
-- explicitly — see the top-down sweep in tools/reset-tournaments.mts.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/tournament-kills.sql`.

CREATE TABLE IF NOT EXISTS `TournamentKills` (
  `Id`             INT AUTO_INCREMENT PRIMARY KEY,
  `MatchId`        INT             NOT NULL,
  -- Which map of the series. A BO3 has three feeds, not one.
  `MapOrdinal`     INT             NOT NULL DEFAULT 0,
  `Round`          INT             NOT NULL DEFAULT 0,

  -- 0 for the world: a fall, the bomb, or anything else with no attacker. Kept
  -- as a kill rather than dropped, because "died to nobody" is information a
  -- feed should show rather than silently swallow.
  `AttackerSteamId` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `AttackerName`    VARCHAR(64)     NULL,
  -- "A" or "B", or NULL for somebody on neither roster.
  `AttackerSlot`    VARCHAR(1)      NULL,

  `VictimSteamId`   BIGINT UNSIGNED NOT NULL,
  `VictimName`      VARCHAR(64)     NULL,
  `VictimSlot`      VARCHAR(1)      NULL,

  `AssisterSteamId` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `AssisterName`    VARCHAR(64)     NULL,
  `AssisterSlot`    VARCHAR(1)      NULL,

  -- The engine's own name, "weapon_ak47" style, normalised to its bare form.
  `Weapon`          VARCHAR(32)     NOT NULL DEFAULT '',
  `Headshot`        TINYINT(1)      NOT NULL DEFAULT 0,
  `TeamKill`        TINYINT(1)      NOT NULL DEFAULT 0,
  `Penetrated`      TINYINT(1)      NOT NULL DEFAULT 0,
  `NoScope`         TINYINT(1)      NOT NULL DEFAULT 0,
  `ThroughSmoke`    TINYINT(1)      NOT NULL DEFAULT 0,
  `AttackerBlind`   TINYINT(1)      NOT NULL DEFAULT 0,

  `CreatedAtUtc`    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  -- The page asks for "this match, newest first" and nothing else, so one index
  -- covers every read it makes.
  INDEX `IX_TournamentKills_Match` (`MatchId`, `Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
