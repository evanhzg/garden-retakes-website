# Garden Retakes — Website

Next.js site for the Garden Retakes server: season ladder, in-depth player stats,
Competitive Retakes (duo/trio) ladder + match history, a connect / copy-IP button,
and a placeholder page for the upcoming InventorySimulator integration.

It reads the **same MySQL database** the GardenRankings plugin writes to — no API
layer, no sync jobs. The future Discord bot can use the same connection.

## 1. Point the plugin at MySQL

In `GardenRankings/config/config.json` on the game server:

```json
"DatabaseProvider": "MySql",
"DatabaseConnectionString": "Server=your-db-host;Port=3306;Database=gardenrankings;Uid=user;Pwd=password;"
```

Any MySQL reachable from both the game server and Vercel works: a MySQL on the game
box with remote access enabled, or a managed one (Aiven free tier, PlanetScale,
Railway...). On first start the plugin creates all tables.

> Existing SQLite data does not migrate automatically. If you care about the current
> season, either keep SQLite until a season rollover, or copy the rows over manually.

## 2. Run locally

```bash
cp .env.example .env      # fill DATABASE_URL + NEXT_PUBLIC_SERVER_ADDRESS
npm install
npm run prisma:generate
npm run dev
```

## 3. Deploy on Vercel

1. Push this folder to a Git repository (GitHub/GitLab).
2. In Vercel: **New Project** → import the repo. The defaults work — the build
   command already runs `prisma generate && next build`.
3. Add the environment variables `DATABASE_URL` and `NEXT_PUBLIC_SERVER_ADDRESS`
   in the project settings.
4. Deploy. Pages revalidate every 30-60s, so stats stay fresh without hammering
   the database.

Make sure the MySQL server allows connections from Vercel (public host with SSL,
or an allowlist that includes Vercel's egress IPs if your provider supports it).

## InventorySimulator (planned)

The `/inventory` page is a placeholder for
[cs2-inventory-simulator](https://github.com/ianlucas/cs2-inventory-simulator).
The plan: run its companion CounterStrikeSharp plugin on the server and link to a
self-hosted simulator instance from that page, so players equip skins on the web
and see them in-game.

## Pages

- `/` — connect button + current-season ladder
- `/players/[steamId]` — full player stats with season selector and ranked-only filter
- `/teams` — Competitive Retakes duo/trio ELO ladder + recent matches
- `/seasons` — all seasons with champions and record ELOs
- `/inventory` — InventorySimulator placeholder
"# garden-retakes-website" 
