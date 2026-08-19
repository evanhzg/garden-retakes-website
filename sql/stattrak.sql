-- Per-season StatTrak counters.
--
-- The website stored no count at all before this: /api/equipped/v4 sent
-- `stattrak: 0` for every StatTrak item, so a counter that a player watched
-- climb all evening was back at zero the next time the plugin re-read their
-- loadout. Nothing was persisted because there was nowhere to persist it —
-- /api/increment-item-stattrak, which the plugin POSTs to on every kill, was
-- never implemented and answered 404.
--
-- Keyed by season as well as item, because a counter that never resets is a
-- counter nobody can catch up with: a player who joined in season 4 is not
-- competing with somebody's season-1 knife. The row is created on the first
-- kill of the season with that item, so an item carried across seasons starts
-- from zero without anything having to reset it.
--
-- Uid is the plugin-facing item id (InventoryStore.items[].uid), not the
-- cs2-lib item id and not the store's own string id: it is the only handle the
-- plugin has, and it is what the increment POST sends back as targetUid.
CREATE TABLE IF NOT EXISTS `GardenStatTrakCounts` (
  `Id`        BIGINT NOT NULL AUTO_INCREMENT,
  `SeasonId`  INT NOT NULL,
  `SteamId`   BIGINT UNSIGNED NOT NULL,
  `Uid`       INT NOT NULL,
  `Kills`     INT NOT NULL DEFAULT 0,
  `UpdatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_GardenStatTrakCounts` (`SeasonId`,`SteamId`,`Uid`),
  KEY `IX_GardenStatTrakCounts_Player` (`SeasonId`,`SteamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
