# Garden — CS2 Modding Ecosystem Roadmap

> **Purpose of this file**: single source of truth for any human or AI model resuming work
> on this project. If you are an AI picking this up with no other context: read this file
> top to bottom, then read the README/Docs of the repo you are about to touch. Update this
> file whenever a phase lands.

Owner: Evan (pro.evan.dev@gmail.com) — private retakes server "Garden Retakes" (retakes.fr).
Everything lives in sibling folders under `CS2 Mod Dev/`.

---

## 1. Ecosystem overview (current state — all SHIPPED and working)

| Repo | What it is | Stack |
|---|---|---|
| `Garden-retakes` | **THE merged signature plugin (live on the server)** — retakes core + allocator + rankings + admin + Duels/Executes/FastStrat/SmallServer/Edit modes + Spotlight. Fork of B3none/cs2-retakes; absorbed the two donor repos below. | CounterStrikeSharp (C#, net10.0, CSS 1.0.371) |
| `Garden-allocator` | *Read-only donor* (absorbed into Garden-retakes R0). Fork of yonilerner/cs2-retakes-allocator. | CounterStrikeSharp |
| `Garden-rankings` | *Read-only donor* (absorbed into Garden-retakes R0). Seasons, ELO, HLTV-like rating, Ranked/Competitive Retakes, clutch rounds. | CounterStrikeSharp + EF Core (MySQL/SQLite) |
| `Garden-website` | Ladder, HLTV-style player pages + pros section, /compare, CR team ladder, duels ladder, seasons, live spectator dashboard + heatmaps, inventory simulator (per-side loadouts, knives/gloves, stickers, Steam OpenID, /borrow share-keys), profile showcase + Garden-Pops 3D customizer + 3D avatars, admin panel + RCON console, **Games Hub** (6 socket mini-games + universal lobbies + friends/social), roadmap + commands + API docs pages. Deployed on Vercel (socket server needs its own host — see Phase G). | Next.js 14 + Prisma 6 + Aiven MySQL + Socket.IO + three.js |
| `Garden-website/Garden-overlay` | Tauri desktop overlay companion app (in-repo subfolder, excluded from the site's tsconfig). | Tauri (Rust) + Vite |
| `Garden-website /spelltakers` | **FOUNDATIONS ONLY** — SpellTakers page + lobby component + `install.ps1`; gameplay TBD. | Next.js page |
| `Garden-inventory` | Fork of ianlucas/cs2-inventory-simulator-plugin. `css_loadout` menu/random, URL sanitizing, auto-random-per-map convar. | CounterStrikeSharp |
| `Garden-discord` | Discord bot: live presence, status embed, /ladder /stats /compare /seasons, DB-polling event posts. | Node.js + discord.js + gamedig + mysql2 |

Shared infra:
- **DB**: Aiven MySQL (`defaultdb`), shared by rankings plugin, website, and Discord bot.
  Schema bootstrap: `Garden-website/sql/blank-schema.sql` (idempotent). Plugin also
  auto-creates via EF `EnsureCreated` + raw-SQL `SchemaUpgrades` for post-v1 tables.
- **Cross-plugin API**: `RetakesAllocatorShared` → `PluginCapability<IRetakesAllocatorApi>("retakes_allocator:api")`
  (round type, force-buy team, overrides). Rankings consumes it.
- **Website↔plugin contract**: `GET /api/equipped/v4/{steamid}.json` (EquippedV4Response),
  `POST /api/select-loadout` (`INVSIM_API_KEY` == `invsim_apikey`), `POST /api/increment-item-stattrak`.

## 2. Hard-won gotchas (DO NOT re-learn these the crash way)

1. **Never write `m_hActiveWeapon` Raw directly** and never remove a held weapon mid-frame.
   Safe removal: `NativeAPI.IssueClientCommand(userid, "slot3")` then
   `weaponEntity.AddEntityIOEvent("Kill", weaponEntity, null, "", 0.1f)`. (Two crashes came from this.)
2. **Game-event hook ordering across plugins (same event, Post) is load-order dependent.**
   To run after another plugin's `round_prestart` logic but before its `round_poststart`
   logic, hook `EventRoundPoststart` with `HookMode.Pre`. This is how clutch/CR team
   enforcement beats the retakes plugin's team balancer (fixed 2026-07: "1v4 announced, 2v3 played").
3. **The retakes plugin rebalances teams to its T-ratio every round.** Any custom team layout
   must be applied in the window described in (2), and will be auto-reverted next round (desired for clutch).
4. **Native buy menu can't render server-side CanAcquire** — grey-out is faked with per-round-type
   money (`MoneyByRoundType`) + post-purchase top-ups. CanAcquire stays the hard block.
5. **Premier scoreboard rating**: write `CompetitiveRankType=11`, `CompetitiveRanking=elo`,
   `CompetitiveWins>=10` **every tick** + `Utilities.SetStateChanged`. Others' ratings need the
   FakeRanks-RevealAll metamod addon. (K4-System MMR technique.)
6. **FakeConVar string values can keep literal quotes from cfg parsing** → sanitize
   (see `Garden-inventory Api.GetUrl`), and prefer unquoted values in cfg files for URLs/keys.
7. **GetCSWeaponDataFromKey gamedata signature breaks on CS2 updates** → static def-index→CsItem
   table is primary, native is guarded fallback (try/catch on load).
8. **EF `EnsureCreated` never upgrades an existing DB** → additive tables go in `SchemaUpgrades`
   (idempotent `CREATE TABLE IF NOT EXISTS`, MySQL + SQLite dialects).
9. **Prisma**: pinned to v6 (v7 broke `db execute --url`). Aiven self-signed CA → connection string
   `?sslaccept=accept_invalid_certs` (or ship `ca.pem` + `sslaccept=strict` + `outputFileTracingIncludes`).
10. **Workshop/community skins are impossible** (client-side assets). Official catalog only.
11. Server cfg for plugin convars: `game/csgo/cfg/garden-inventory.cfg` + `exec` from `server.cfg`
    (executes after plugin load). Secrets never in git.
12. **CSS API changes between 1.0.329 → 1.0.367** (hit while porting the donors):
    `EventPlayerChat` removed — hook chat with `AddCommandListener("say"/"say_team", handler,
    HookMode.Post)` and read the message from `commandInfo.GetArg(1)`;
    `PlayerConnectedState.PlayerConnected` renamed to `PlayerConnectedState.Connected`.
13. **CSS 1.0.371 / .NET 10 (2026-07-10)** — the CS2 update [1.41.6.9] broke CSS; official
    v1.0.371 (= PR #1348 merged) fixes it and stays on **net10.0** (building needs the .NET 10
    SDK). Both repos pin `CounterStrikeSharp.API 1.0.371`; server runs
    `counterstrikesharp-linux-1.0.371`. Until nuget.org publishes 1.0.371, the package must come
    from the local feed: download `counterstrikesharp-api-v1.0.371.zip` from the GitHub release
    and put the `.nupkg` in `C:\local-nuget` (NuGet.config in each repo points there; nuget.org
    stays enabled so the pin resolves automatically once published — then the local feed +
    NuGet.config files can be deleted).

## 3. Conventions

- C# plugins: net8.0, CounterStrikeSharp; config = JSON file in plugin dir, validated on load;
  all player-facing text through `Localizer`/`lang/*.json` (en at minimum); test project per repo
  (NUnit); every feature toggleable via config.
- Commands: chat `/x` == console `css_x`. Admin-only via flags (until Garden-retakes admin system lands).
- DB writes from game thread: `Task.Run` + fresh DbContext per op; back to game thread with `Server.NextFrame`.
- Website: app router, server components for data pages, purple-rose white theme in `globals.css` (respect it).

---

## 4. Phases

### Phase D — Garden-discord bot ("rich presence") — **IN PROGRESS**
True per-user Discord Rich Presence is client-side only; chosen design: **bot presence + live status embed**.

- [x] D1. Bot skeleton: discord.js v14, `.env` config, graceful shutdown.
- [x] D2. Live presence: A2S query (gamedig) of the game server → "Watching 7/10 · de_mirage", refresh ~60s.
- [x] D3. Status embed: one auto-edited message in a configured channel (map, players+names, connect link, top-5 ladder from MySQL).
- [x] D4. Stats commands — DONE 2026-07-09: `/ladder [count]`, `/stats <player> [ranked]`
      (name or SteamID64, partial names resolve to most recently seen), `/compare <p1> <p2>`,
      `/seasons` — purple embeds linking to the website, shared MySQL via a pooled db helper.
      Optional `GUILD_ID` env for instant slash-command registration.
- [x] D5. Event posts — DONE 2026-07-10: the bot polls the shared DB (30s default) and posts
      CR match results, finished duel challenges and new seasons to `EVENTS_CHANNEL_ID`
      (fallback: status channel). Id cursors persist in data/state.json — first run initializes
      silently, restarts never flood. (Record-broken announces stay in-game chat only.)

### Phase R — Garden-retakes: THE merged signature plugin
Base: **fork of B3none/cs2-retakes** added by Evan as `Garden-retakes/` (not yet present).
End state: retakes core + allocator + rankings in one plugin, plus new modes. Old
Garden-allocator/Garden-rankings become read-only donors (copy code in, keep history there).

**R0. Skeleton & merge foundation** — *scaffold landed 2026-07-09*
- [x] Solution layout: `GardenRetakes.sln` = `RetakesPlugin` (fork of B3none cs2-retakes v3.0.4, now
      "Garden Retakes"), `RetakesPluginShared`, `GardenRetakesCore` (pure logic, no CSS deps),
      `GardenRetakesTest` (NUnit; mode manager + admin registry covered).
- [x] Module system: `RetakesPlugin/Garden/` — `IGardenModule` + `GardenHost` (constructed in
      RetakesPlugin.Load; lifecycle Load/OnMapStart/Unload; per-module enable flags in the
      `GardenSettings` config section of BaseConfigs, ConfigVersion bumped to 3).
      Modules: Admin, InstantDefuse, GameMode, SmallServer (state basis), Duels/Executes/FastStrat (skeletons).
- [x] Central `GameModeManager` (Core): exclusive modes Retakes/Duels/Executes/FastStrat +
      SmallServer overlay (Auto/On/Off, auto at 1..MaxHumans); `css_gamemode` front-end refuses
      unimplemented modes. Still TODO: absorb rankings' ModeCvars profiles into mode switches.
- [x] Instant defuse in retakes core (`InstantDefuseModule`): last T dies + bomb planted + CT alive →
      instant round end as defuse, with HE/molotov/inferno danger block + 0.25s recheck.
      (Instant/auto bomb plant already existed upstream: `Bomb.IsAutoPlantEnabled`.)
- [x] Admin system basis (R3 pulled forward): `AdminRegistry` in Core (Owner/Admin/Moderator,
      config-owner bootstrap, JSON persistence to garden_admins.json, @css/root = Owner fallback).
      Commands: `css_gadmin add|remove|list`, `css_gkick` (Mod+), `css_gmap` (Mod+), `css_gslay` (Admin+),
      `css_grcon` (Owner). g-prefixed until the legacy plugins retire. TODO R3: DB-backed storage, action log.
- [x] Port allocator (donor: Garden-allocator) — *landed 2026-07-09*: `RetakesAllocatorCore/Shared/Test`
      copied into the solution unchanged (Shared keeps its assembly identity so Garden-rankings'
      `IRetakesAllocatorApi` capability still resolves; core's CSS package bumped to 1.0.367).
      Plugin layer lives in `RetakesPlugin/Garden/Modules/Allocator/` keeping the original
      `RetakesAllocator.*` namespaces: Helpers/CustomGameData/menus copied verbatim (only
      `RetakesAllocator.Instance` → `AllocatorModule.Instance`), `AllocatorModule` is the transformed
      main class (attributes → explicit registrations, `_plugin.*` surface, direct subscription to
      `RetakesPlugin.EventSender` instead of the capability lookup). Allocator lang keys merged into
      the fork's en/pt-BR/pt-PT/zh-Hans lang files. Allocator's own config stays `config.json` in the
      plugin dir (copy from the Garden-allocator install, incl. `data.db` and `gamedata/`).
      **Deployment notes**: set `GameSettings.EnableFallbackAllocation=false` (module warns if not);
      `CopyLocalLockFileAssemblies=true` ships EF/SQLite/MySQL deps.
- [x] Port rankings (donor: Garden-rankings) — *landed 2026-07-09*: `GardenRankingsCore/Test` copied
      into the solution (CSS bumped to 1.0.367; **config file renamed to `config/rankings.json`**
      because the allocator core owns `config/config.json` in the same plugin folder).
      Plugin layer in `RetakesPlugin/Garden/Modules/Rankings/` keeping namespace `GardenRankings`:
      Helpers/ScoreboardManager/AfkTracker/RoundDataCollector verbatim; `RankingsModule` +
      `RankingsModule.Modes` are the transformed partial class (attributes → explicit registrations,
      `_plugin.*`, module lifecycle; clutch/CR enforcement stays on round_poststart PRE).
      Round types still flow through `IRetakesAllocatorApi` — registered by AllocatorModule in-process.
      Rankings lang keys merged into the fork's en.json.
      **Deployment (merged plugin replaces ALL THREE legacy plugins)**: remove standalone
      Garden-allocator AND Garden-rankings (duplicate commands/hooks otherwise); copy rankings
      `config/config.json` → merged `config/rankings.json`; FakeRanks-RevealAll metamod addon still
      required for others' scoreboard ratings.

**R0 is COMPLETE** — Garden-retakes now contains retakes core + allocator + rankings + admin +
instant defuse + game-mode/small-server scaffolding. Next: R1 spawn editor.

**R1. Spawn editor (visual, multi-user, fast test)** — *landed 2026-07-09*
- [x] Spawn data: base per-map JSON (`map_config/<map>.json`) extended with `Flags`
      (`duel`/`smallserver`/`execute` — consumed by R4/R5/R6) and `AddedBy` attribution.
      Backward compatible with existing B3none/splewis-style JSONs (import = drop the file in).
- [x] Visual editing (`Garden/Modules/SpawnEditorModule`, Admin level, on top of the base
      agent-model markers + labels): `!gspawns <a|b|all|flag <name>|off>` renders one site, all
      sites, or only flagged spawns; labels show flags + who placed them.
      `!gspawn add <t|ct> <a|b> [flags...]` places at your feet, `!gspawn del`, `!gspawn move`,
      `!gspawn flag <name>` (toggle, incl. planter), `!gspawn info` — all save instantly.
- [x] Multi-editor: all edits flow through the single in-memory MapConfigService
      (`MutateSpawns`) and save immediately; every edit is announced with the editor's name and
      persisted as `AddedBy`. Base editor commands (css_showspawns/css_add/...) still work.
- [x] Quick test: `!gspawn test [a|b]` teleports you through spawns (repeat = next, per-player
      cursor); `!gspawn round <a|b>` forces dry-run rounds on one site (ends warmup + skips to a
      fresh round), `!gspawn round off` restores random sites.

**R2. In-game config commands** — *completed 2026-07-09*
- [x] `!gconfig <target> <path> <value>` — reflection engine (`GardenRetakesCore/Config/
      ConfigReflection`, unit tested): dotted case-insensitive paths, type validation
      (int/double/bool/enum/string incl. on/off), old→new echo, live apply + save.
      Collections stay file-only by design.
- [x] Per-config targets: `retakes` (CSS config incl. GardenSettings — written back to
      configs/plugins/RetakesPlugin/RetakesPlugin.json), `garden` (shortcut), `allocator`
      (config/config.json via new Configs.Save()), `rankings` (config/rankings.json via
      new Configs.Save()). Browse with `!gconfig <target> [path]` (Admin), set = Owner,
      every set goes to the GardenAdminLog audit trail. Construction-time settings
      announce "applies next map"; SmallServer runtime values re-synced immediately.

**R3. Admin system** — *completed 2026-07-09*
- [x] DB-backed admins: `GardenAdmins` table in the shared DB (entities + SchemaUpgrades +
      Queries in GardenRankingsCore; also added to website `sql/blank-schema.sql`). AdminModule
      syncs from DB once the rankings module has it ready (5s retry timer); `garden_admins.json`
      stays as bootstrap/fallback; config `OwnerSteamIds` always win and are never persisted.
- [x] Commands: `!gadmin add|remove|list`, `!gkick`, `!gslay`, `!gmap`, `!grcon` (R0) — now with
      DB persistence.
- [x] Levels: Owner > Admin > Moderator (rcon Owner-only). **All actions logged** to
      `GardenAdminLog` (actor, action, target, detail, timestamp) — future website admin-log page.
- [x] Map-change commands: rankings' `!<alias>` commands + BlockMapChangeDuringMatch came along
      with the R0 rankings port; `!gmap` covers arbitrary maps.

**R4. Duels mode (1v1 arenas)** — *completed 2026-07-09*
- [x] Arenas: pairs of `duel`-flagged spawns (place with `!gspawn add ... duel`), greedily paired
      by proximity within `Duels.MaxPairDistance` (pure logic in Core, unit tested).
- [x] Flow: `!gamemode duels` (Admin) — retakes machinery fully gated via
      `RetakesPlugin.RetakesGameplayActive` (round/queue/allocation handlers skipped; rankings
      collection, clutch/CR/scramble, ranked auto-activate and instant defuse all guarded),
      `mp_ignore_round_win_conditions 1` so the module owns the round. On death both fighters
      respawn instantly at another random arena (no immediate repeats), full heal, configured
      weapon preset (`Duels.Weapons`) + kevlar/helmet; per-player win counters announced each
      duel, `!duelscore` board.
- [x] Queue for 3+ players: FIFO in Core `DuelSession` — loser rotates to the back, next steps in;
      joiners mid-mode are queued; disconnects promote from the queue.
      (Parallel duels on distinct arenas = possible later refinement.)

**R5. Small-server mode (2–3 players)** — *completed 2026-07-09*
- [x] Activation: auto at 1..MaxHumans humans (default 3) or forced via `!smallserver on/off/auto`
      (Mod+); evaluated every round PRESTART so effects land before nade allocation and spawn
      assignment; transitions announced.
- [x] Closer spawns: `SpawnManager.GardenSpawnFilter` hook — while active only spawns flagged
      `smallserver` are used (place with `!gspawn add ... smallserver`), with automatic fallback
      to all spawns when the flagged set is too small or has no planter spawn.
- [x] Reduced utility: `NadeHelpers.GardenMaxTotalNadesOverride` hard-caps each team's nade pool
      (SmallServer.MaxTeamNades, default 2); never persisted to config.
- [x] Last CT dies → instant round switch (T win, no bomb-timer wait; toggleable);
      last T dies → instant defuse (was already global via InstantDefuseModule).

**R6. Executes mode** — *completed 2026-07-09*
- [x] Strategy definitions per map (`executes/<map>.json`, Core `ExecuteStore` + models, unit
      tested; same format feeds R7): name, site, T-start positions, CT-setup positions, utility
      throws (projectile spawn pos + velocity + delay). Edited fully in game with `!gexec`:
      new/edit, `tstart`/`ctsetup` capture where you stand, **`nade` captures your last actually
      thrown grenade** (projectile pos+velocity recorded via OnEntitySpawned while editing).
- [x] Round flow: `!gamemode executes` — retakes machinery gated; each round picks a random
      playable strategy (or `!gexec play <name>` forces one); Ts teleported to starts with
      configured weapons + C4, CTs to setups; utilities auto-thrown after freeze end with
      per-nade delays (smokes/mollies use the InitializeSpawnFromWorld nade-practice technique —
      re-check ThrowUtility first if a CS2 update breaks a type). Normal win conditions
      (plant/defuse/elimination), rounds cycle naturally.

**R7. Fast-strat mode** — *completed 2026-07-09*
- [x] `!gamemode faststrat`: every round CTs vote a SETUP (`!setup <name|list>`) and Ts vote a
      STRATEGY (`!strat <name|list>`) — majority per side, ties/no-votes random; both teams spawn
      in the chosen situation facing off (T strat's TStarts + auto-thrown utility vs CT setup's
      CtSetups), C4 to a T, normal win conditions, votes reset each round.
- [x] Definitions fully shared with Executes: same `executes/<map>.json` via the ExecutesModule
      store; `PlaceGroup`/`ThrowUtility` reused (ThrowUtility now allows both modes).
      **The original Phase R roadmap is COMPLETE** — next up: R8 Duels v2, R9 inventory loadout
      UX, Phase W website pages, Discord D4/D5.

**Suggested order**: R0 → R1 → R3 → R2 → R5 → R4 → R6 → R7
(spawn editor early because Duels/SmallServer/Executes/FastStrat all consume its data;
Executes/FastStrat last — utility replay is the hardest single piece).

**R8. Duels v2 (requested 2026-07-09)** — *completed 2026-07-09*
- [x] Named arena pairs: `!garena new <name>` (end A = where you stand) + `!garena setb <name>`,
      `seta`/`del`/`list`; stored per map in `duels/<map>.json` (Core `DuelArenaStore`, tested);
      the versus announce shows the arena name. Fallback: when a map has no named arenas, the R4
      proximity auto-pairing of `duel`-flagged spawns still applies ("Arena N").
- [x] Parallel duels: Core `DuelManager` runs up to min(arenas, `Duels.MaxParallelDuels`=3) lanes
      at once with one shared FIFO queue and a merged win scoreboard; lanes get non-colliding
      arenas and rotate arenas between duels; disconnects re-slot the abandoned partner.
- [x] Challenges: `!duel <player> [firstTo]` invites (30s); `!duel accept/decline`. A challenge
      reserves a private lane — no queue rotation, fixed arena, own score line — ends at
      first-to-X with a winner announce, or runs infinite until `!duel stop`. Other players keep
      rotating on the remaining lanes; abandoned partners are re-paired automatically.

**R9. Inventory loadout UX (requested 2026-07-09)** — *completed 2026-07-09*
- [x] `GET /api/loadouts/{steamid}.json` on Garden-website (names + active flag) and
      `Api.FetchLoadoutsAsync` in Garden-inventory; `!loadouts` lists them with the active one
      marked green.
- [x] Case-insensitivity: verified — the website's `findLoadout` lower-cases names, so
      `!loadout GREEN` already works; no fix needed.
- [x] Center menu: `!loadout` with no args opens it — W/S navigate, D select, A/TAB exit,
      player frozen while open (same UX as the gun menu), active loadout pre-highlighted,
      "🎲 Random" entry at the bottom. Uses the fork's pinned CSS.NextFrame wrapper.
- [x] `!loadout random` (and the menu entry): picks any loadout except the active one.
      (Auto-random each map = possible later toggle.)

**R10. Consolidated backlog** — every "(for later)" suggestion scattered across this file,
collected 2026-07-09 so nothing gets lost:
- [ ] **Production cutover** (Evan-only — needs the .NET 10 SDK + live server) — build/test DONE
      2026-07-09 (`dotnet build` clean, **all 142 tests green**). Website half DONE 2026-07-11
      (pushed → Vercel auto-deploy; `prisma generate` runs in the build script; W2 endpoints/pages
      live). REMAINING (game server): rebuild Garden-inventory, deploy the merged plugin, retire
      standalone Garden-allocator/Garden-rankings, migrate configs (allocator `config.json` +
      `data.db` + `gamedata/` as-is; rankings config → `config/rankings.json`), set
      `EnableFallbackAllocation=false`, set allocator `DatabaseProvider=MySql` (R12). No manual DB
      step: the plugin's `SchemaUpgrades` now self-creates ALL W2 tables on load (GardenBans /
      GardenNameOverrides / GardenWebProfiles / GardenAdmins / GardenAdminLog / DuelRecords).
- [x] ModeCvars unification — DONE 2026-07-09 (pragmatic form): every mode transition now applies
      the right profile — RankingsModule re-applies its Classic/Ranked/Competitive cvars whenever
      the server returns to Retakes mode (0.5s after ModeChanged), Duels/Executes/FastStrat apply
      their own Start/StopCommands on their transitions. Config locations intentionally unchanged.
- [x] Short command names — DONE 2026-07-09: `GardenSettings.Admin.EnableShortAliases` (default
      false) additionally registers `!admin`, `!kick`, `!slay`, `!map`, `!rcon`. Turn on after the
      legacy plugins are retired.
- [x] Auto-random loadout each map — DONE 2026-07-09: `invsim_random_loadout_each_map` convar
      (default off) in Garden-inventory equips a random loadout for every player on each
      connect/map change (3s after connect so the initial inventory fetch settles).
- [x] Parallel-duels polish — DONE 2026-07-09: dead/queued players auto-spectate the duel that
      just started (in-eye; guarded observer-handle writes, disable via `Duels.SpectatorAutoFollow`
      if a CS2 update misbehaves); `!duelscore arenas` shows per-arena duels played + best fighter.
- [x] Executes polish — DONE 2026-07-09: `ExecuteStrategy.Weight` (0–100, weighted random pick,
      0 = manual-only, `!gexec weight <n>`, tested); `UtilityThrow.Team` records the thrower's
      side (old JSONs default to T) — projectiles spawn with the right TeamNum, Executes replays
      both sides' lineups, Fast-strat replays the T strat's T utility + the CT setup's CT utility.

**R11. Edit mode rework (requested 2026-07-10)** — *completed 2026-07-10*
- [x] `!gamemode edit` (GameModeKind.Edit): paused endless warmup (no timer), mp_death_drop_c4 0
      + a 3s C4 sweep (no bomb), retakes machinery gated; noclip toggle in the editor menu.
      Leaving restores cvars + mp_restartgame.
- [x] Visual differentiation per category (`EditModeModule` markers, rendered for the active
      category): retakes spawns via the existing SpawnService models/labels; duel arenas as
      purple/magenta markers labeled "arena — End A/B"; execute positions as orange (T start) /
      blue (CT setup) markers + green nade labels ("T Smoke +0.5s").
- [x] `!gedit` center menu usable WHILE MOVING — nobody is frozen: **R cycles, E activates,
      TAB closes** (rising-edge bitwise input, so WASD stays free — works in noclip). Flat
      action list per category: add spawn/end/position where you stand, cycle team/site/
      arena/strategy, toggle planter, delete nearest/selected, save last thrown nade.
- [x] Multi-word names ("A Site VS Long"): store validation relaxed (≤48 chars, spaces OK,
      tested), menu "new" actions prompt `!name <name>` (arenas) / `!name <a|b> <name>`
      (strategies), and !garena/!gexec commands join multi-word args
      (**!gexec new signature changed to `new <a|b> <name...>`**).

**R12. Gameplay fixes batch (reported 2026-07-10)** — *DONE 2026-07-11 — build GREEN on .NET 10 SDK, all 146 tests pass (51+56+39); pending Evan's server deploy*
- [x] CR: warmup hold on ranked (`_warmupHoldActive`, `RankedWarmupMaxSeconds`), match start
      suspends Ranked Retakes, `/ry` unanimity dropped, inverted-sides fixed (retakes core's
      win-based team rotation gated during CR). See `RankingsModule.cs` / `RankingsModule.Modes.cs`.
- [x] Executes: detonation fixed — `ExecutesModule.PickThrowerPawn` sets projectile
      `Thrower`/`OwnerEntity` to a live pawn + `InitializeSpawnFromWorld` on all types.
- [x] Allocator: weapon prefs persist via `DatabaseProvider.MySql` (shared DB) — see
      `RetakesAllocatorCore/Db/Db.cs`; set `DatabaseProvider=MySql` in the allocator config.
- [x] Small Server: overlay state computed LIVE (not the prestart snapshot), bots excluded,
      last-CT-death switch re-evaluated in the death handler. See `SmallServerModule.cs`.

**W2. Website overhaul batch (requested 2026-07-10)** — *COMPLETE (website) 2026-07-11*
- [x] RCON page: `/admin/rcon` console (`components/RconConsole` → `POST /api/admin/rcon` →
      `lib/rcon.ts` Source RCON client). Admin+/web-key gated, every command audit-logged.
- [x] Stats + compare pages: entrance animations + correct cursors on every interactive element
      (global cursor rules + `:disabled` states in `globals.css`).
- [x] Profile editor: `/profile` (Steam session) — display-name override, avatar URL, bio,
      country; `POST /api/profile` writes GardenNameOverrides + GardenWebProfiles; revert-to-Steam.
- [x] Ladder redesign: rank medals, avatars, override-aware names (`lib/names.ts`), cleaner table.
- [x] Session link: logged-in user's ladder row highlighted; own placement strip when outside the
      top 20; "your profile" links; own player page shows an Edit-profile button.
- [x] Username override: `GardenNameOverrides` written from /profile and the admin panel; the
      plugin already reads it (`Queries.GetNameOverride`) and stops overwriting LastKnownName;
      revert deletes the row. Name resolution is centralized in `lib/names.ts`.
- [x] Admin tab: `/admin` full panel — searchable player list (everyone in PlayerProfiles + SteamID),
      role management (Owner), rename/kick/slay/ban/unban, map change, embedded RCON. Persistence via
      Prisma (bans/roles/overrides), live effects via the plugin's `css_g*` over RCON. NavBar shows
      "Admin" only to admins. (Plugin ban support — GardenBans + connect kick — already shipped.)
- [x] Hero section: `lib/hero.ts` computes the last session's standout (highest rating that UTC
      day, min 8 rounds); home renders a clickable card with avatar, ELO and key stats.

### Phase W — website/bot follow-ups (opportunistic)
- [x] **Roadmap page** (`/roadmap`) — DONE 2026-07-09: renders this file (mirrored to
      `Garden-website/content/roadmap.md` — keep the mirror in sync on every roadmap change).
- [x] **Commands reference page** (`/commands`) — DONE 2026-07-09: renders
      `content/commands.md` (mirror of `Garden-retakes/COMMANDS.md` — keep BOTH in sync whenever
      commands change), same markdown pipeline/styles as /roadmap, NavBar link.
- [x] Admin log page — DONE 2026-07-09: hidden key-protected URL
      `/admin-log?key=<INVSIM_API_KEY>` (not in the nav), last 200 `GardenAdminLog` entries;
      Prisma models `GardenAdmin`/`GardenAdminLogEntry` added (run `npx prisma generate`).
- [x] Duels ladder — DONE 2026-07-09: plugin persists every completed 1v1 to `DuelRecords`
      (season, map, arena, winner/loser, challenge flag + final score; best-effort like the admin
      log; schema in SchemaUpgrades + blank-schema.sql + Prisma). Website `/duels` page: season
      ladder (wins/losses/winrate/challenges won) + last 20 duels; NavBar link.
- [x] Discord D4/D5 — DONE (see Phase D): D4 stats slash-commands (2026-07-09),
      D5 DB-polling event posts (2026-07-10). Both shipped.
- [x] **Live Spectator Dashboard overhaul** — DONE 2026-07-13: analytics, role-based admin controls, custom player avatars.
- [x] **Player Profile enhancements** — DONE 2026-07-13: dynamic sidebars, real-time server status.
- [x] **Garden-Pop 3D Customizer** — DONE 2026-07-13: UI improvements, responsive design.
- [x] **CI/CD Pipeline** — DONE 2026-07-13: GitHub Actions setup for CS2 plugins using GitHub Packages.

### Phase G — Games Hub & Social platform (`/games`)

Six socket-based mini-games behind universal lobbies, plus a friends/social layer.
Foundation scaffolded with Antigravity 2026-07 (server.js + scripts/*Logic.js + game
components), overhauled 2026-07-17 (commit 48b4a2d).

**Shipped**
- [x] G1. Socket server (`server.js`, port 3001, run via `npm run dev` concurrently):
      presence, notifications, DMs, universal lobbies, per-game event routing + bot AI turns.
- [x] G2. Universal lobby (`scripts/universalLobby.js` + `/games/lobby/[id]`): public/private
      (+password), host/kick/ready flow (host starts, all other humans ready — enforced
      server-side), per-player 10s disconnect grace, chat with 50-msg history replay,
      EN/FR per game, garden-named bots, invite links, glass UI (light+dark), mobile layout.
- [x] G3. Games: UNO (stacking/jump-in/7-0/play-on-draw), Monopoly (Business-Tour-like, 3D dice),
      Codenames, Cards Against (custom cards + LanguageTool cleanup), Make-it-Meme, Skribbl
      (canvas + fuzzy match). All with bot support.
- [x] G4. Social: friends sidebar (requests via `/api/friends`), online presence, toasts
      (`components/social/`); Prisma models WebFriendship etc.
- [x] G5. Name/avatar resolution: `POST /api/players/resolve` + `components/games/hooks.ts`.

**Open**
- [ ] G6. **Per-game UI/UX pass** — each game needs the treatment the lobby got (glass theme,
      responsive, correct layouts). **UNO DONE 2026-07-17**: opponents seated W/N/E on an ellipse
      with viewport clamps (fits down to 375px, no overflow), `--card-*` CSS vars scale per
      breakpoint, board portaled to `<body>` (site layout transforms were capturing
      `position:fixed` and shifting it), fixed identity bug (component compared turns against a
      random DUMMY_STEAM_ID — humans could never play), resolved names everywhere.
      Remaining: Monopoly, Codenames, CAH, Meme, Skribbl.
- [ ] G7. **Socket-server production hosting** — Vercel can't run `server.js`; host it on the
      VPS (or a small node host) + `NEXT_PUBLIC_SOCKET_URL` + CORS allowlist (currently `*` —
      tighten before prod). WSS via reverse proxy.
- [ ] G8. Game-end flow: return-to-lobby for everyone (lobby_return is host-only), rematch vote,
      per-lobby match history.
- [ ] G9. 3D-avatar identity: player pops (profile showcase avatars, animations in progress by
      Evan) become the cross-game identity — lobby cards, in-game seats, victory poses.
- [ ] G10. Persistence: per-game win/loss stats per SteamID in the shared DB; hub leaderboards;
      Discord bot announces big wins.
- [ ] G11. Spectators: join a PLAYING lobby as spectator (currently blocked); watch UNO/Skribbl live.
- [ ] G12. SpellTakers: define gameplay (foundations page + lobby component + install.ps1 exist).

### Phase DOCS — API documentation (docs.retakes.fr)

- [x] DOC1. Docs site — DONE 2026-07-17: `/docs` route group, data-driven from `lib/apiDocs.ts`
      (single source of truth), glass sidebar + endpoint cards (method/auth/params/examples),
      sections: auth, players, inventory, loadouts (plugin contract), live, admin, social, socket.
- [x] DOC2. Subdomain routing — code DONE 2026-07-17: `middleware.ts` rewrites `docs.*` hosts to
      `/docs/...`. REMAINING (Evan): DNS CNAME `docs` → Vercel + add the domain to the project.
- [x] DOC3. Socket protocol reference — DONE 2026-07-17 (`/docs/socket`): lobby + presence +
      per-game event tables with payload shapes.
- [ ] DOC4. Keep-in-sync rule: any new/changed API route or socket event MUST update its docs
      page in the same commit (add to working agreement).
- [ ] DOC5. Later: OpenAPI JSON generated from a single source of truth + "try it" console for
      the public read-only endpoints; auto-listed changelog of API-affecting commits.

### Phase P — "Garden PKMN": browser PokeMMO-like at pkmn.retakes.fr

**Vision**: a persistent, multiplayer, Pokémon-style overworld + battle game, fully playable in
the browser at `pkmn.retakes.fr`, tied to the Garden account system (Steam login, pops/avatars,
site economy). Long-haul project — phases land independently and each one is playable.

**Tooling decision (evaluate in P0, current best picks)**
- *Battle engine*: **`@pkmn/sim` + `@pkmn/dex`** (Pokémon Showdown's battle simulator as npm
  packages) — battle-accurate mechanics, damage calc, formats; runs server-side in Node. This is
  the single biggest lever: we never hand-write battle logic.
- *Client*: **Phaser 3** (TypeScript) for the overworld (tilemaps, sprites, camera, input);
  embedded in a Next.js page or served as its own Vite app under the subdomain.
- *Maps*: **Tiled** (.tmx/.tmj) — first-class Phaser support; collision/encounter layers as
  custom tile properties.
- *Content design*: **Pokémon Studio / PSDK** evaluated as DATA AUTHORING tools only (their
  runtime is desktop Ruby/RGSS — not web-exportable). If their editors beat hand-editing, write
  a converter PSDK data → our JSON; otherwise author encounters/trainers directly in JSON +
  @pkmn/dex ids.
- *Netcode*: reuse the Garden socket stack (Socket.IO) OR **Colyseus** (room state-sync
  framework, built for this) — decide in P1 spike; Colyseus likely wins for interest-area
  filtering + reconnection.
- *Persistence*: Prisma + the shared Aiven MySQL (`PkmnTrainer`, `PkmnMon`, `PkmnBox`, …).
- *Assets*: community free sprite/tile packs (Gen-4-like); NO ripped commercial assets on the
  public site; fan-project, non-commercial, no payments ever (legal posture).

**Phases**
- [x] P0. Discovery & spike — DONE 2026-07 (Antigravity): `@pkmn/sim` battle stream PoC
      (`scripts/pkmnSpike.js`), Phaser grid-movement demo, decisions locked in
      `content/PKMN-DESIGN.md` — @pkmn/sim battles, Phaser 3 client, Socket.IO rooms (Colyseus
      rejected to keep one stack), custom JSON + Tiled data (PSDK too desktop-centric).
- [x] P1. World server v1 — DONE 2026-07 (Antigravity, in server.js): `pkmn_join/move/leave/chat`,
      map rooms, DB-backed trainer persistence (position/facing/map saved on leave), NPC state.
      **Still open: server-side movement validation** (server currently trusts client x/y) —
      required before public exposure.
- [x] P2. Client v1 — DONE 2026-07 (Antigravity, `app/pkmn/PhaserGame.tsx`): Phaser overworld with
      Tiled map + collision layer, other players + name tags (resolved via /api/players/resolve),
      camera follow, chat bubbles, virtual D-pad for touch, NPC interaction (space).
- [ ] P3. Data layer: species/moves/items from `@pkmn/dex`; our own JSON for maps, encounter
      tables (per map zone + rate), trainers, shops; validation script in CI.
- [ ] P4. Wild battles: grass-step encounter roll → server-side `@pkmn/sim` battle vs generated
      wild mon; battle UI (menu-driven: Fight/Bag/Pokémon/Run) as a Phaser scene or DOM overlay;
      catching (ball mechanics via sim), XP/levels/evolution persisted.
- [ ] P5. Party & storage: party of 6, PC boxes, summary screens, healing center; full Prisma
      persistence; starter choice flow for new trainers.
- [ ] P6. Trainers & progression: scripted NPC trainers (vision cones, dialogue), badges/gyms,
      pokédex tracking, money + shop items.
- [ ] P7. PvP & trading: challenge another online player (lobby-style invite reusing Games Hub
      social layer) → `@pkmn/sim` PvP battle with both clients driving choices; 1:1 trade UI with
      server-side escrow; spectate battles.
- [ ] P8. Region v1: a coherent 8-10 map starter region authored in Tiled (routes, one town, one
      gym, one cave), day/night cycle, encounter variety; content pipeline documented so maps can
      be added without code.
- [ ] P9. Website integration: trainer card on the Garden profile (pop/avatar as trainer skin),
      pokédex/ladder pages on the main site, Discord bot announcements (badges, shinies, PvP
      results), shared economy hooks (site currency ↔ in-game money, cosmetic-only).
- [ ] P10. Ops & hardening: `pkmn.retakes.fr` DNS + reverse proxy (client static + WSS), server
      anti-cheat (all mutations server-authoritative, rate limits, movement validation), DB
      backups, session reconnect, load test to target CCU, monitoring.
- [ ] P11. Beta & polish: soft-launch to the Garden community, feedback loop, balance pass,
      onboarding/tutorial, sound, shiny odds/fun events.

---

## 5. Working agreement with the AI

- One **major change** at a time; after finishing it, STOP and wait for Evan to say "Continue".
- Evan builds/tests locally (`dotnet build` / `dotnet test`) — the sandbox has no .NET SDK and no network.
- Keep this file updated: tick checkboxes, add gotchas, note donor-code locations when porting.
- **Mirror**: copy this file to `Garden-website/content/roadmap.md` after every update (it feeds /roadmap).
- Never commit/print secrets (DB password, INVSIM_API_KEY, Discord token).

## 6. Changelog (roadmap-level)

- 2026-07-08: invsim URL-quotes crash fixed (Api.GetUrl sanitize); cfg location documented.
- 2026-07-09: Clutch team enforcement moved to `EventRoundPoststart` Pre (gotcha #2). Roadmap created.
  Phase D started (Garden-discord skeleton: presence + status embed).
- 2026-07-09 (2): B3none fork added as Garden-retakes. R0 scaffold landed: solution + GardenRetakesCore +
  GardenRetakesTest, Garden module system (GardenHost/IGardenModule + GardenSettings config section),
  GameModeManager + css_gamemode, SmallServer overlay state, InstantDefuseModule (working), admin system
  basis (registry + gadmin/gkick/gslay/gmap/grcon), lang keys en+fr.
- 2026-07-09 (3): Allocator ported into the merged plugin (AllocatorModule + copied Core/Shared/Test).
- 2026-07-09 (4): Rankings ported into the merged plugin (RankingsModule + copied Core/Test;
  rankings config renamed to config/rankings.json). **R0 complete** — the merged plugin now fully
  replaces cs2-retakes + Garden-allocator + Garden-rankings.
- 2026-07-09 (5): R1 spawn editor landed (Spawn.Flags/AddedBy, all-sites render with flag labels,
  gspawns/gspawn command set, MutateSpawns, teleport-test, dry-run rounds).
- 2026-07-09 (6): R3 completed — GardenAdmins + GardenAdminLog tables (shared DB, schema also in
  website blank-schema.sql), AdminModule DB sync + full action audit log. Commands reference
  created: `Garden-retakes/COMMANDS.md` + Garden section atop the README; website `/commands`
  page queued in Phase W (after mode commands stabilize).
- 2026-07-09 (7): R2 completed — ConfigReflection engine + !gconfig over all four configs with
  live apply, save-back (incl. CSS config write-back) and audit logging; COMMANDS.md updated.
- 2026-07-09 (8): R5 completed — small-server overlay now changes gameplay: flagged closer
  spawns (with safe fallback), team nade cap, instant round switch on last CT death. New config
  knobs: SmallServer.MaxTeamNades / UseFlaggedSpawns / InstantRoundSwitchOnLastCtDeath.
- 2026-07-09 (9): R4 Duels completed (Core DuelSession/DuelArenas + tests, DuelsModule, retakes
  gating via RetakesGameplayActive, ranked auto-activate guard, duels lang keys). Lang files
  trimmed to en + fr only (user request — others deleted from Garden-retakes).
- 2026-07-09 (10): R6 Executes completed (ExecuteStore + models + tests, ExecutesModule with
  in-game strategy editor, real-throw lineup capture, auto-throw at freeze end). Roadmap gained
  R8 Duels v2 (named arena pairs, parallel duels, challenges) and R9 inventory loadout UX
  (!loadouts, case-insensitive !loadout, center menu, random) — both per Evan's requests.
  Next (on "Continue"): R7 Fast-strat (CT setup vote + T strat vote, both teams spawn facing
  off — reuses the executes data format), which finishes the original roadmap.
- 2026-07-09 (11): Website /roadmap page added (renders this mirrored file, react-markdown +
  remark-gfm, NavBar link).
- 2026-07-09 (12): R7 Fast-strat completed (per-side !strat/!setup votes, shared executes data,
  face-off spawning + utility replay). All four game modes now switchable via !gamemode.
  **Original Phase R roadmap complete.**
- 2026-07-09 (13): R8 Duels v2 completed — DuelArenaStore (named pairs, duels/<map>.json) +
  DuelManager (parallel lanes, shared queue, challenge lanes) in Core with tests; DuelsModule v2
  (!garena editor, per-lane arena assignment, !duel challenges first-to-X/infinite).
  Next (on "Continue"): R9 inventory loadout UX (!loadouts, center menu, random — touches
  Garden-inventory + Garden-website).
- 2026-07-09 (14): R9 completed — /api/loadouts endpoint, !loadouts, !loadout center menu +
  random in Garden-inventory (case-insensitivity confirmed already working). Remaining backlog:
  Phase W (/commands page, admin log page, duels ladder), Discord D4/D5.
- 2026-07-09 (15): Phase W /commands page + hidden /admin-log page shipped (Prisma admin models,
  content/commands.md mirror). New R10 section consolidates every inline "(for later)"
  suggestion — production cutover first, then ModeCvars unification, short command aliases,
  auto-random loadout, duels/executes polish. Remaining: R10, W duels ladder, Discord D4/D5.
- 2026-07-09 (16): **First full build + test pass GREEN** (47+56+39 tests) after fixing CSS
  1.0.367 renames (gotcha #12) and swapping the allocator tests' JsonStringLocalizer for a
  self-contained TestJsonLocalizer. R10 sweep landed: mode-cvar reapply on return to Retakes,
  Admin.EnableShortAliases, invsim_random_loadout_each_map. Remaining backlog: cutover deploy
  steps, duels/executes polish, W duels ladder, Discord D4/D5.
- 2026-07-09 (17): R10 finale — duels polish (spectator auto-follow, !duelscore arenas) +
  executes polish (strategy weights, per-side utility capture/replay). **R10 done except the
  deploy half of the cutover.** Remaining: cutover deploy, W duels ladder, Discord D4/D5.
- 2026-07-09 (18): Discord D4 shipped — /ladder /stats /compare /seasons slash commands
  (db.js pooled helper, stats.js aggregates matching the website's summaries). Remaining:
  cutover deploy (Evan), W duels ladder (needs duel-stat persistence), Discord D5.
- 2026-07-09 (19): Duel persistence + /duels ladder shipped (DuelRecords table end to end:
  plugin → DB → website page). Remaining: cutover deploy (Evan), Discord D5.
- 2026-07-10 (21): TEMP CSS fork switch (gotcha #13): Garden-retakes (all 9 projects) +
  Garden-inventory on CounterStrikeSharp.API 1.0.371-PullRequest1348.5 / net10.0, local NuGet
  feed at C:\local-nuget. Requires the .NET 10 SDK to build.
- 2026-07-10 (22): Discord D5 shipped (DB-polling event posts with persistent cursors).
  **Every planned item is now done** — remaining: Evan's production cutover.
- 2026-07-10 (23): Switched to OFFICIAL CSS v1.0.371 (gotcha #13 updated): all pins now
  `1.0.371`, net10.0 stays. One manual step until nuget.org publishes: drop the official
  api nupkg into C:\local-nuget. (Repacked PR nupkg placed there as a bridge — same merged code.)
- 2026-07-10 (24): Big new batch added to the roadmap (R11 edit mode, R12 gameplay fixes,
  W2 website overhaul). **R11 completed**: EditModeModule (no bomb/timer, noclip, per-category
  markers, moving-friendly R/E/TAB menu, !name prompts), multi-word names everywhere.
  Next (on "Continue"): R12 fixes (CR warmup/auto-ranked/side-inversion, executes nade
  detonation, allocator MySQL persistence, small-server reliability).
- 2026-07-11 (25): **R12 plugin fixes landed** (CR warmup hold + ranked suspend + side-inversion
  gate, executes detonation via live Thrower/OwnerEntity, allocator MySQL persistence, small-server
  live evaluation) — pending Evan's `dotnet build`/deploy. **W2 website batch COMPLETE**: new tables
  GardenBans / GardenNameOverrides / GardenWebProfiles (schema + Prisma + blank-schema.sql); Source
  RCON client (`lib/rcon.ts`) + role/key auth (`lib/adminAuth.ts` with GardenAdmins levels) +
  admin-action layer (`lib/adminActions.ts`, DB-authoritative + `css_g*` over RCON); pages
  `/profile` (self edit + name override), `/admin/rcon`, `/admin` (players/roles/ban/kick/slay/map +
  console); ladder redesign with override-aware names (`lib/names.ts`), session highlight + own
  placement, last-session standout hero (`lib/hero.ts`); NavBar Admin/Profile links; cursor +
  animation polish. Typecheck clean; client pages verified in the dev server (DB-backed pages need
  Evan's live MySQL). Remaining: Evan's production cutover + R12 build/deploy; `npx prisma generate`.
- 2026-07-12 (34): **Admin/Host QoL Features Shipped**. Added `!pause`/`!unpause` functionality for Competitive Retakes. Added `!ghost`/`!freecam` command to allow admins to enter an invisible spectator mode and place spawns using the editor while out of the match.
- 2026-07-12 (33): **Executes nade detonation — diagnosis + settle-monitor fix.** A diagnostic log
  proved the native `Create()` path resolves the smoke signature to the FLASHBANG function on this
  server's build (`requested=Smoke -> designer=flashbang_projectile`); MatchZy main==dev sigs are
  identical, so no upstream fix and no way to derive correct sigs without the server binary. Final
  approach (ExecutesModule): spawn each type by classname (TYPE always correct) + full wiring, then
  a 0.1s `MonitorPendingNades` timer force-detonates each pending nade once it settles (speed²<400
  after a 0.4s grace, or 5s hard timeout) by writing `m_flDetonateTime` via Schema. Timer-fused
  types (HE/flash) self-detonate first and are dropped when their entity goes invalid. Deleted
  GrenadeFunctions.cs. Built + deployed + reloaded. Needs Evan's in-game `!gexec` preview to confirm
  the bloom (can't observe visuals over RCON).
- 2026-07-12 (32): Two post-deploy fixes (built + FTP-deployed to DatHost + RCON-reloaded by me).
  **Nade type**: MatchZy's native `Create()` signatures mis-resolved on the server's build — every
  nade detonated but as a FLASHBANG. Dropped the native-signature path (deleted GrenadeFunctions.cs)
  and spawn each type by classname (`CreateEntityByName<CSmokeGrenadeProjectile>("smokegrenade_projectile")`
  etc.) + the full flashbang-proven wiring (DispatchSpawn, Initial/Vel/AngVelocity, Teleport,
  Globalname, Thrower/OriginalThrower/OwnerEntity) on all types — correct type guaranteed.
  **`/gedit` lag**: the menu re-sent `PrintToCenterHtml` every tick (64/s), choking clients
  (rollbacks/TPs) — now throttled to on-change + a ~6/s heartbeat (EditModeModule). Deploy: FTP to
  `addons/counterstrikesharp/plugins/RetakesPlugin/RetakesPlugin.dll`, `css_plugins reload` (the
  "Could not reload" RCON reply is a lie — the CSS log shows a clean reload). RCON creds: server
  console at the DatHost server; treat as secrets.
- 2026-07-11 (31): **Executes nade detonation — the actual fix (MatchZy technique)**. Attempts (29)/(30)
  via `CreateEntityByName` + `DispatchSpawn` never detonated because that path can't run the game's
  own projectile setup. Ported MatchZy's approach (github.com/shobhit-pathak/MatchZy —
  GrenadeProjectiles.cs / GrenadeThrownData.cs): a new `GrenadeFunctions` static class holds
  signature-scanned `MemoryFunctionWithReturn` pointers to the native
  `CSmokeGrenadeProjectile/CHEGrenadeProjectile/CMolotovProjectile/CDecoyProjectile::Create()`
  statics; `ThrowUtility` now `.Invoke()`s the right one (smoke's Create takes team + self-inits;
  HE/molotov get trajectory + Thrower/OriginalThrower/OwnerEntity/AngVelocity wired after; flash
  stays CreateEntityByName+DispatchSpawn — no Create sig). Builds green + 146 tests pass.
  **GOTCHA**: these signatures are game-build specific — if a CS2 update breaks executes/fast-strat
  utility, refresh the byte patterns from MatchZy's latest GrenadeProjectiles.cs (server is Linux).
- 2026-07-11 (30): **Executes nade detonation — real fix**. Prior attempts (Thrower + reorder +
  InitializeSpawnFromWorld) still never detonated for ANY type. Root cause: a grenade's own `Spawn()`
  (run by `DispatchSpawn`) reads `InitialPosition`/`InitialVelocity` to schedule its detonation think,
  so `DispatchSpawn` must be the LAST call — after seeding Initial*, Thrower, and the Teleport.
  Spawning first initialised it from zeroes (flew but never detonated); `InitializeSpawnFromWorld`
  didn't recover it and is now removed (ExecutesModule.ThrowUtility). Also fixes the `!gedit` preview.
  Builds green. **`!reveal` fix**: pawn self-glow doesn't network in CS2 — switched to the two-prop
  FollowEntity glow (relay + glow clone) so the target glows through walls for everyone
  (SpotlightModule). **No-weapons fix**: `GameModeModule.OnMapStart` now resets any non-Retakes mode
  (esp. the editor) back to Retakes so the allocator isn't left gated.
- 2026-07-11 (29): Executes/edit fixes (builds green, 146 tests pass). **Executes nade detonation**
  (first attempt, superseded by (30)): reordered spawn + InitializeSpawnFromWorld + Elasticity 0.45.
  **`!gedit` menu**:
  center-HTML could only show a few rows — added a scrolling window (▲/▼ "N more"); Executes category
  now cycles a strategy's saved nades to **preview** (throws via ThrowUtility, now allowed in Edit
  mode) or **delete** them (EditModeModule). Pending Evan's in-server confirmation of the nade bloom.
- 2026-07-11 (28): **Spotlight module** (fun) added — watches configured player(s) (default
  Damien/vz7y). Push alerts: `!pushzone add <name> [radius]` defines per-map spheres
  (`spotlight_zones/<map>.json`); when a watched T is inside one during the first
  `AlertWindowSeconds` after freeze end, the audience (CTs by default) gets "⚠ Damien is pushing
  short!" (chat + center), once per zone per round. Gags (Admin): `!reveal [player] [secs]`
  (through-walls glow via the pawn's own CGlowProperty, GlowType 3), `!nojump [player]` (OnTick
  cancels upward velocity for the round). Auto per-round via `Spotlight.AutoReveal` /
  `AutoNoJump`. Config = `GardenSettings.Spotlight`. Builds green + 146 tests still pass. COMMANDS.md
  (+ website mirror, which was re-synced) updated. **Glow + no-jump need in-server confirmation**
  (CS2 glow transmit / velocity feel can vary) — logic is sound but untested live.
- 2026-07-11 (27): **Garden-retakes builds GREEN on the .NET 10 SDK** (0 errors; official CSS
  1.0.371 resolved from nuget.org — local feed no longer needed) and **all 146 tests pass**
  (GardenRetakes 51 + RetakesAllocator 56 + GardenRankings 39). Added `GardenWebProfiles` to the
  plugin's `SchemaUpgrades` so the entire W2 schema self-creates on plugin load — the cutover no
  longer needs a manual `sql/blank-schema.sql` run. (Plugin repo isn't under git here, so this
  edit lives in Evan's working tree; the website schema mirror is already on GitHub.)
- 2026-07-11 (26): Roadmap swept for open items — **everything implementable is done**. Ticked the
  stale "Discord D4/D5" line (both shipped, see Phase D). The one remaining checkbox is the
  **production cutover**, which is Evan-only: it needs the .NET 10 SDK (sandbox has none) and the
  live game server. Its website half is already deployed (2026-07-11 push → Vercel); only the
  game-server steps (plugin rebuild/deploy, legacy-plugin retirement, config migration, one-time
  `sql/blank-schema.sql` run) remain.
- 2026-07-09 (20): New skin collections (today's CS2 update): @ianlucas/cs2-lib bumped to 8.0.3
  (published today with the regenerated item catalog) — run `npm update @ianlucas/cs2-lib` to
  refresh the lockfile before redeploying. The inventory simulator picks the new collections up
  automatically (runtime catalog + cdn.cstrike.app images). Same recipe for future drops.
- 2026-07-13 (35): **Garden-Pop 3D Customizer**. Finalized aesthetic adjustments, fixed interactive layout issues, and ensured seamless camera controls for the 3D character customization interface.
- 2026-07-13 (36): **Live Spectator Dashboard & Player Profiles**. Added richer player analytics, role-based admin controls directly into the dashboard, custom player avatars, dynamic sidebars, and real-time server status indicators.
- 2026-07-13 (37): **Plugin Infrastructure Fixes**. Resolved InventorySimulator "garbage collected delegate" crashes (`CSS.NextWorldUpdate` wrapper), fixed localization bundling (en.json, fr.json deployed correctly), and set up GitHub Actions CI/CD pipeline for CS2 plugins using GitHub Packages.
- 2026-07-17 (38): **Games Hub & Universal Lobby overhaul** (glass theme + reliability). Hub: game
  cards got their gradients back (`data-game` attr), the public-lobby list now loads on page open
  (was empty until a lobby changed), lobby cards show the resolved host name + live status, and an
  invite-code/link box joins any lobby directly. Create modal: EN/FR language picker, glass styling.
  Lobby: full glass restyle on the site palette (light+dark), resolved player names/avatars
  (`/api/players/resolve` batch endpoint), invite-link copy button, host-only kick for *any* player,
  garden-named bots (Sprout, Fern…), chat history replay for late joiners + autoscroll, coherent
  ready flow (host starts, everyone else readies — same rule public & private, enforced server-side),
  and per-player disconnect grace (10s "RECONNECTING…" instead of instant kick on refresh/navigation).
  Server: authenticate ack (`authenticated`) removes the 300ms join race, merged duplicate disconnect
  handlers, soft errors now toast instead of nuking the lobby screen, empty lobbies clean up after
  their last human leaves. Mobile: lobby stacks and scrolls properly.
- 2026-07-17 (39): **Roadmap deep refresh + two new programs.** Ecosystem table rewritten to match
  reality (Garden-retakes = the live merged plugin; donors read-only; website row now lists games
  hub/social/3D pops/overlay; Garden-overlay + SpellTakers foundations noted). New **Phase G**
  (Games Hub & Social) with shipped G1-G5 and open G6-G12 (per-game UI pass — UNO first, socket
  prod hosting, game-end flow, 3D-avatar identity, persistence, spectators, SpellTakers). New
  **Phase DOCS** (docs.retakes.fr API documentation, DOC1-DOC5). New **Phase P** ("Garden PKMN",
  pkmn.retakes.fr): exhaustive P0-P11 plan for a browser PokeMMO-like — tooling picks: @pkmn/sim +
  @pkmn/dex (Showdown battle engine as npm packages), Phaser 3 client, Tiled maps, Pokémon
  Studio/PSDK evaluated as data-authoring only (desktop runtime, not web-exportable), Colyseus vs
  Socket.IO netcode spike, Prisma/MySQL persistence, Steam-session auth handoff, fan-project
  non-commercial posture.
- 2026-07-17 (40): **Docs shipped, link previews, UNO fixed, PKMN P0-P2 landed.**
  *Docs*: DOC1-DOC3 built (`/docs` from `lib/apiDocs.ts`, glass UI, socket protocol page,
  `middleware.ts` host rewrite) — Evan still needs the `docs` CNAME + Vercel domain.
  *Link previews (Discord embeds)*: dynamic `/api/og` card renderer (satori; note: it doesn't
  support sized radial-gradients — use `circle at`), site-wide `metadataBase`/title template,
  player profiles embed a live stat card (name, avatar, ELO, rating, K/D, ADR, win% via cheap
  aggregates in `generateMetadata`), Games Hub page card, lobby invite links get a "You're
  invited" card. *UNO (G6 first slice)*: real session identity (was a random DUMMY_STEAM_ID —
  humans could never take a turn), W/N/E elliptical seating with viewport clamps, board portaled
  to `<body>` (a stuck `.page-enter` transform was capturing position:fixed), resolved names,
  responsive down to 375px. *PKMN*: Antigravity's P0 spike + P1 world server + P2 Phaser client
  committed (typecheck fixed: typed sceneRefs, socket narrowing, sprite types); wild battles,
  catching, XP and Youngster Joey already prototype-working (parts of P4/P6). `scratch/` (963MB
  of map/tileset experiments) added to .gitignore and excluded from tsconfig.
- 2026-07-18 (41): **Stats overhaul + compare fix + nav wheel repair.** */compare 404 fixed*: the
  tool lives at /stats/compare; a query-preserving redirect now catches every old link
  (profile/player/pros buttons + Discord embeds) and CompareInteractive pushes the right path.
  *Compare upgrades*: radar "profile shape" (6 axes scaled to the better player), daily-rating
  form trend (two lines, shared day axis), T/CT side-split cards, metrics grown 12 → 18.
  *Stats page*: season total tiles (rounds/players/kills/damage/clutches/plants/defuses/4k+),
  rounds-per-day columns (14d), player rating histogram, most-played-maps bars, per-map T/CT
  side-balance splits, leaderboards grown 4 → 10 (HS%, util dmg, trades, plants+defuses,
  multi-kills, rounds). All charts are dependency-free SVG (`components/stats/charts.tsx`) on
  validated palettes (dataviz six-checks, light+dark: A/B purple/sky, T/CT amber/blue as
  `--chart-*` vars). *Nav wheel*: full-band invisible hitbox while open (was a thin circle
  sliver), wheel-delta accumulation (1 mouse notch = 1 item, trackpad flicks accumulate,
  direction flips reset residue, horizontal deltas work), hover-peek replaced by a solid
  open/closed state, glass arc + gradient active pill + bottom notch indicator.
- 2026-07-18 (42): **PKMN feels like Pokémon now (P4/P5 slices).** *Battle scene rebuilt*
  (BattleOverlay + pkmn.css): GBA-style arena — animated Showdown sprites (gen5ani front/back,
  static fallback) on platforms, chunky cream info boxes with Lv + green/yellow/red HP bars
  (blink on red), damage shake + faint drop animations, Pokémon cries on appear/faint
  (play.pokemonshowdown.com CDN, helpers in components/games/pkmn/sprites.ts), FIGHT opens a
  real 4-move menu (moves come from the server), richer log lines (super effective/crit/miss/
  status/stat changes), classic FIGHT/BALL/PKMN/RUN buttons. *Starter choice*: brand-new
  trainers pick Bulbasaur/Charmander/Squirtle (server-guarded, once per trainer); guests get a
  Steam sign-in gate (trainer rows are SteamID-keyed). *Server*: per-map weighted encounter
  tables with level ranges (pallet_town + default incl. rare Pikachu), species movesets, catch
  odds now scale with the wild mon's remaining HP (25% full → 90% near-KO, tracked by parsing
  the sim's damage lines), battle_start ships the player's mon (species/level/moves).
  *Party menu*: sprite icons, HP bars, movesets. *Dev plumbing*: socket URL falls back to
  localhost:3001 in dev (Render host stays the prod fallback; .env.development.local override),
  socket CORS allows *.localhost:3131, server.js only honors host-injected PORT in production
  (it was stealing next dev's port). E2E-verified over a raw socket client: join → starter →
  pallet_town Weedle L2 → named move → HP-scaled catch attempt.
- 2026-07-18 (43): **`!gmenu` live server-config menu (Garden-retakes).** New ServerControlModule +
  `!gmenu`/`!config`/`!gsettings` (Admin) opens a native center menu (WASD/E) to flip the settings
  admins change most: friendly fire (TK), force-camera, freeze/round time, buy-anywhere, infinite
  ammo, half-buy & pistol frequency (allocator RoundTypePercentages), auto-ranked, scramble each
  round, competitive (2v2/3v3) on/off. Every toggle applies live, saves, and **stays consistent
  across maps**: cvar toggles are stored in GardenSettings.ServerControl and re-applied on each map
  start (module added last so it wins the rankings ModeCvars pass); round-economy/ranked/scramble
  toggles are written into the allocator & rankings configs those systems already read per map.
  Builds green on the .NET 10 SDK (0 errors). Not per-team yet: half-buy T-only/CT-only needs a
  per-team allocation override in the allocator (single round-type per round today) — noted for
  later. COMMANDS.md + website mirror updated. Needs Evan's in-server check (menu render + toggles).
- 2026-07-19 (44): **PKMN — bag (in & out of combat), real HP, grass encounters.** New item system
  (`scripts/pkmnItems.js`): Poké/Great/Ultra Balls + Potion/Super/Hyper Potion, real max-HP from
  `@pkmn/dex` base stats. Trainers start with 5 Poké Balls + 3 Potions. In battle the BALL button
  became **BAG** (`BagMenu.tsx`): balls throw with per-ball catch modifiers (consume the turn),
  potions heal the active mon in the live sim (free action, server re-enables via `pkmn_can_act`),
  both decrement the bag. Out of battle: 🎒 Bag button / `B` key opens the bag to heal a chosen
  party member (`pkmn_use_item`). Post-battle HP now persists to the DB, and party/battle HP bars
  use real max-HP. Encounters now fire **only on the map`\s tall-grass (`battles`) layer** (18%),
  not every step. E2E-verified over a socket client: starter items → battle → potion (re-enable) →
  ball catch → HP persisted 19/20 → overworld potion → 20/20. The 4-move FIGHT menu was already in.
  NOTE on the authentic **LGFR/Kanto map**: mmmulani/pokemap extracts from a FireRed **ROM** (needs
  the copyrighted binary) — not something reproducible here; the existing 200×200 Tiled map now
  behaves like Pokémon via grass-only encounters. A ROM-based generator remains an Evan-run option.
- 2026-07-19 (45): **PKMN pivot: standalone Unity client — auth + save-data API generated.**
  Evan is moving Garden PKMN off the web Phaser client onto a standalone Unity executable talking to
  pkmn.retakes.fr over REST + the existing Socket.IO world server. Built the first API slice:
  *Auth* (`lib/pkmnAuth.ts` + `app/api/pkmn/auth/*`): device-authorization pairing (RFC 8628-style,
  same shape Steam/consoles use) — `device/start` issues a short human code, the player confirms at
  `pkmn.retakes.fr/link` (new page, reuses the existing Steam cookie session), the client polls
  `device/poll` until it gets a 90-day bearer token. Tokens are DB-backed (`PkmnApiToken`, hash only
  — raw token never stored) so devices can be listed and individually revoked (`GET/DELETE
  /auth/sessions`), plus `/auth/refresh` (rotate) and `/auth/logout`. Domain-tagged HMAC signing
  (reuses AUTH_SECRET but a distinct "pkmn_access:" domain) so a web session cookie can never double
  as an API token or vice versa. *Save data* (`app/api/pkmn/v1/*`, all bearer-authed): `me`, `trainer`
  (GET full blob incl. party+bag+badges / PUT position+map+facing+money checkpoint), `party`, `boxes`
  (list/create, 12-box cap), `mon/:id` (rename/DELETE release) + `mon/:id/move` (party<->box, enforces
  the 6-mon party cap and "can't box your last Pokémon"), `inventory` (GET/PATCH signed-delta,
  validated against the existing item catalog), `badges` (idempotent award), `stats` (honest — only
  reports fields actually tracked), `leaderboard` (species-caught / badges, real queries).
  *Security fix along the way*: `realtime/connect-info` issues a 60s signed ticket so the standalone
  client's Socket.IO handshake is cryptographically verified (server.js's `authenticate` handler now
  checks a ticket when one is sent) instead of trusting a raw client-claimed steamId — the browser
  mini-games still use the old trust-the-claim path for now (flagged as a follow-up, not fixed here
  to avoid touching working code out of scope).
  **Schema added, NOT pushed to the live DB**: `PkmnApiToken` + `PkmnLinkCode` (fully additive, zero
  changes to existing tables) are in schema.prisma and `prisma generate` ran (safe, local codegen
  only). This project uses a `prisma db push` workflow against the shared production Aiven MySQL —
  per standing practice on this repo I did not run it myself. **Until `npx prisma db push` runs, none
  of the new endpoints work** (their tables don't exist yet) — full typecheck is clean (0 errors) and
  a comprehensive E2E script is written and ready (pairing flow, all v1 CRUD, ticket-based socket
  auth, refresh/revoke) but has NOT been run for the same reason. Docs site (docs.retakes.fr) not yet
  updated with this surface — follow-up.
