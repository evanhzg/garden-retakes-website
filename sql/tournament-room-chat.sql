-- The match room's chat.
--
-- Players, captains and organizers talking in one place about one match, which
-- is where "the server is not up" and "we are ready when you are" belong. Today
-- those conversations happen in Discord, in a DM, or not at all — and an
-- organizer arriving at a problem has no idea what has already been said.
--
-- Persisted rather than socket-only. Somebody opening the page five minutes
-- into an argument needs to see it; a live-only room means the person who most
-- needs the context is the one guaranteed not to have it.
--
-- Deliberately narrow. This is not the site's DM system — that is WebMessages,
-- it is between two people, and it has its own inbox. A room message belongs to
-- a match and dies with it.
--
-- NOTE: this database has NO foreign keys. Prisma's `onDelete: Cascade` is a
-- client-side fiction here, so deleting a match must delete these rows
-- explicitly — see the top-down sweep in tools/reset-tournaments.mts.
--
-- Idempotent. Apply with `node tools/apply-sql.mjs sql/tournament-room-chat.sql`.

CREATE TABLE IF NOT EXISTS `TournamentRoomMessages` (
  `Id`           INT AUTO_INCREMENT PRIMARY KEY,
  `MatchId`      INT             NOT NULL,
  `SteamId`      BIGINT UNSIGNED NOT NULL,
  -- Stored beside the id for the same reason the killfeed stores it: a name is
  -- what was on screen at the time, and somebody renaming themselves next month
  -- should not rewrite a conversation from last night.
  `Name`         VARCHAR(64)     NULL,
  -- "a", "b", "organizer" or NULL. Who is speaking changes how a line reads —
  -- "we are ready" from an organizer is not the same sentence as from a player.
  `Role`         VARCHAR(12)     NULL,
  `Body`         VARCHAR(500)    NOT NULL,
  `CreatedAtUtc` DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  -- The room asks for "this match, since id N" and nothing else.
  INDEX `IX_TournamentRoomMessages_Match` (`MatchId`, `Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
