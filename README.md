<div align="center">

# 🌿 Garden Retakes — Website

**Season ladder, player stats, inventory builder, admin panel and more — for [retakes.fr](https://retakes.fr).**

[![Live](https://img.shields.io/badge/Live%20at-retakes.fr-brightgreen?style=flat-square)](https://retakes.fr)
[![Plugin Repo](https://img.shields.io/badge/Plugin%20repo-garden--retakes-blue?style=flat-square)](https://github.com/evanhzg/garden-retakes)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-blue?style=flat-square)](https://www.prisma.io)

</div>

---

This is the companion website for the **Garden Retakes** CS2 server.  
It reads the same MySQL database that the [garden-retakes plugin](https://github.com/evanhzg/garden-retakes) writes to — no API layer, no sync jobs — and is deployed on [Vercel](https://vercel.com) at **[retakes.fr](https://retakes.fr)**.

---

## Table of Contents

- [Pages](#pages)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Running Locally](#running-locally)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Deploying on Vercel](#deploying-on-vercel)
- [Inventory Simulator Integration](#inventory-simulator-integration)
- [Admin Panel](#admin-panel)
- [License](#license)

---

## Pages

| Route | Description |
|---|---|
| `/` | Server connect button + current-season ELO ladder |
| `/players/[steamId]` | Full per-player stats with season selector, ranked filter, match history |
| `/teams` | Competitive Retakes duo/trio ELO ladder + recent CR matches |
| `/seasons` | All seasons with champions and record ELOs |
| `/inventory` | In-game skin/sticker loadout builder (Steam login required for in-game sync) |
| `/duels` | Duel arena stats and scoreboard |
| `/compare` | Side-by-side player stat comparison |
| `/roadmap` | Public development roadmap |
| `/commands` | Full command reference (sourced from `COMMANDS.md` in the plugin repo) |
| `/admin` | Web-based admin panel (ban, roles, config, RCON console) |
| `/admin-log` | Admin action audit log |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 14](https://nextjs.org) (App Router) |
| Language | TypeScript |
| ORM | [Prisma](https://www.prisma.io) |
| Database | MySQL 8.0+ (shared with the plugin) |
| Skin catalog | [@ianlucas/cs2-lib](https://github.com/ianlucas/cs2-lib) |
| Auth | Steam OpenID (session cookie signed with `AUTH_SECRET`) |
| Deployment | [Vercel](https://vercel.com) |

Pages revalidate every 30–60 s via ISR — stats stay fresh without hammering the database.

---

## Prerequisites

- Node.js 18+
- A MySQL database reachable from both your CS2 game server and (for production) Vercel
- The [garden-retakes plugin](https://github.com/evanhzg/garden-retakes) running against the same database

---

## Running Locally

```bash
# 1. Clone the repo
git clone https://github.com/evanhzg/garden-retakes-website.git
cd garden-retakes-website

# 2. Copy and fill in the environment file
cp .env.example .env

# 3. Install dependencies
npm install

# 4. Generate the Prisma client
npm run prisma:generate

# 5. Start the dev server
npm run dev
```

The site will be available at `http://localhost:3000`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | MySQL connection string — same DB as the plugin |
| `NEXT_PUBLIC_SERVER_ADDRESS` | ✅ | Shown on the connect button (`ip:port`) |
| `AUTH_SECRET` | ✅ | Long random string — signs the Steam login cookie |
| `SITE_URL` | Production | Public base URL (e.g. `https://retakes.fr`) — used for Steam OpenID redirect |
| `INVSIM_API_KEY` | Inventory | Shared secret between the Garden-inventory plugin and this site |
| `STEAM_API_KEY` | Optional | Enables Steam name + avatar fetching after login |
| `NEXT_PUBLIC_ASSETS_BASE_URL` | Optional | CDN for skin/sticker images (defaults to `https://cdn.cstrike.app`) |
| `RCON_HOST` / `RCON_PORT` / `RCON_PASSWORD` | Admin panel | Game server RCON credentials for the `/admin` RCON console |
| `ADMIN_KEY` | Admin panel | Superuser key for the admin pages (`?key=…`); falls back to `INVSIM_API_KEY` |

Generate a strong `AUTH_SECRET`:
```bash
openssl rand -base64 32
```

---

## Database Setup

Vercel pre-renders pages at build time, so the database **must exist with tables** before the first deploy.

**Option A — Let the plugin create it (recommended):**  
Start the garden-retakes plugin once with `DatabaseProvider = MySql`. It creates all tables automatically and seeds an active Season 1.

**Option B — Apply the blank schema directly:**
```bash
mysql -h <host> -P <port> -u <user> -p <database> < sql/blank-schema.sql
```

The `sql/blank-schema.sql` script is idempotent and matches the plugin's schema exactly.

> **Note:** Existing SQLite data does not migrate automatically. If you have season data you want to keep, either stay on SQLite until a season rollover, or copy the rows manually.

---

## Deploying on Vercel

1. Push this repository to GitHub (or GitLab/Bitbucket).
2. In Vercel: **New Project → Import Repository**.
3. The defaults work out of the box — the build command is already `prisma generate && next build`.
4. Add all required environment variables in **Project Settings → Environment Variables**.
5. Deploy.

Make sure your MySQL host allows connections from Vercel's egress IPs, or use a managed provider with a public endpoint (e.g. [Aiven](https://aiven.io) free tier, [Railway](https://railway.app), PlanetScale).

---

## Inventory Simulator Integration

The `/inventory` page is a self-contained skin and sticker loadout builder that works with the [ianlucas/cs2-inventory-simulator-plugin](https://github.com/ianlucas/cs2-inventory-simulator-plugin).

**Flow:**
1. Players sign in with Steam on the website.
2. They pick weapons, choose skins, place stickers, set wear/seed/StatTrak/name tags, and save named loadouts.
3. Loadouts are stored in the `WebInventories` table, keyed by SteamID64.
4. In-game, players run `!ws` to pull their active loadout. The plugin fetches:

```
GET {SITE_URL}/api/equipped/v4/{steamID64}.json
```

which returns the plugin's exact `ctWeapons` / `tWeapons` econ-item shape.

5. Players can switch loadouts in-game with `!loadout <name>` or `!loadout` (menu).

**Guests** (not signed in) can still build loadouts — they're saved to `localStorage` only and are not served in-game.

---

## Admin Panel

The `/admin` page provides a web-based interface for:
- Viewing and managing bans
- Editing player roles (Owner / Admin / Mod)
- Browsing and editing live config values
- A browser-based RCON console (requires `RCON_*` environment variables)

Access is gated by the `GardenAdmins` database table (shared with the plugin) or the `ADMIN_KEY` environment variable.

---

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for the full text.

MIT is permissive: anyone can use, fork, modify, and build on this code (including commercially) as long as they keep the copyright notice. The plugin side ([garden-retakes](https://github.com/evanhzg/garden-retakes)) is GPL-3.0; MIT on the website is compatible since they are separate codebases.
