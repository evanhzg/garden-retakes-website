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

### Creating the schema up front (needed before the first deploy)

Vercel pre-renders the pages at build time, so the database must exist **with tables**
before the first deploy. Either start the plugin once against MySQL (it creates
everything), or create a blank schema directly:

```bash
mysql -h <host> -P <port> -u <user> -p <database> < sql/blank-schema.sql
```

The script is idempotent, matches the plugin's schema exactly, and seeds an initial
active "Season 1" so every page renders.

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

## Inventory Simulator (in-game skins)

The `/inventory` page is a self-contained skin/sticker loadout builder that talks
directly to ianlucas's
[cs2-inventory-simulator-plugin](https://github.com/ianlucas/cs2-inventory-simulator-plugin).
Item ids come from [`@ianlucas/cs2-lib`](https://github.com/ianlucas/cs2-lib), the
same catalog the plugin uses, so the numeric weapon `def` / paint / sticker ids we
serve match what the game expects.

Flow: players sign in with Steam, pick a weapon by type, choose a skin, place
stickers on a 2D render, tweak wear / seed / StatTrak / name tag, and save it to
their inventory. Loadouts are stored in the `WebInventories` table (keyed by
SteamID64) and switched with one click.

The plugin polls the active loadout from:

```
GET {SITE_URL}/api/equipped/v4/{steamID64}.json
```

which returns the plugin's exact `ctWeapons` / `tWeapons` econ-item shape. Point
the plugin's `invsim_url` convar at this site; players run `css_ws` in-game to
refresh. Guests (not signed in) can still build loadouts — they're saved to the
browser's localStorage only and are not served in-game.

Extra environment variables (see `.env.example`): `AUTH_SECRET` (required — signs
the login cookie), `SITE_URL`, and optional `STEAM_API_KEY` (Steam name/avatar)
and `NEXT_PUBLIC_ASSETS_BASE_URL` (skin image host).

## Pages

- `/` — connect button + current-season ladder
- `/players/[steamId]` — full player stats with season selector and ranked-only filter
- `/teams` — Competitive Retakes duo/trio ELO ladder + recent matches
- `/seasons` — all seasons with champions and record ELOs
- `/inventory` — skin/sticker loadout builder that syncs in-game via the plugin
"# garden-retakes-website" 
