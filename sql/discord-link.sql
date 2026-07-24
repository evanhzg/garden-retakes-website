-- Discord account links. Apply once against the same MySQL the app uses
-- (DATABASE_URL), e.g.  mysql <db> < sql/discord-link.sql
-- or run `npx prisma db push` after pulling the schema change.
-- Until this table exists the Connect Discord button just fails gracefully;
-- nothing else on the site is affected.
CREATE TABLE IF NOT EXISTS `GardenDiscordLinks` (
  `SteamId`       BIGINT       NOT NULL PRIMARY KEY,
  `DiscordId`     VARCHAR(32)  NOT NULL,
  `DiscordName`   VARCHAR(64)  NOT NULL,
  `DiscordAvatar` VARCHAR(255) NULL,
  `LinkedAtUtc`   DATETIME(6)  NOT NULL
);
