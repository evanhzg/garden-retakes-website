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
| `Garden-allocator` | Fork of yonilerner/cs2-retakes-allocator. Weapon/utility allocator, heavily customized. | CounterStrikeSharp (C#, net8.0) |
| `Garden-rankings` | Built from scratch. Seasons, ELO (Premier-like, start 5000), HLTV-like per-round rating, Ranked Retakes (auto ≥4 humans), Competitive Retakes (/cr, 2v2/3v3 MR12), clutch rounds, mode cvar profiles, AFK handling, per-round raw stats. | CounterStrikeSharp + EF Core (MySQL/SQLite) |
| `Garden-website` | Ladder, HLTV-style player pages, /compare, CR team ladder, seasons, inventory simulator (per-side loadouts, knives/gloves, 2D sticker placement, Steam OpenID). Deployed on Vercel. | Next.js 14 + Prisma 6 + Aiven MySQL |
| `Garden-inventory` | Fork of ianlucas/cs2-inventory-simulator-plugin. Added `css_loadout <name>` (switch active loadout via website API), URL sanitizing. | CounterStrikeSharp |
| `Garden-discord` | **NEW (Phase D)** Discord bot: live presence + auto-updating status embed; future stats commands. | Node.js + discord.js + gamedig + mysql2 |
| `Garden-retakes` | **PLANNED (Phase R)** Fork of B3none/cs2-retakes. Will absorb allocator + rankings into ONE signature plugin + all new game modes. | CounterStrikeSharp |

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
- [ ] D5. (Later) Round/match event posts (CR results, records broken) — either poll DB or a tiny
      webhook sender in the plugin.

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
- [ ] **Production cutover** — build/test DONE 2026-07-09 (`dotnet build` clean,
      **all 142 tests green** across the three suites after two fixes: CSS 1.0.367 API renames
      + test localizer replacement). REMAINING: rebuild Garden-inventory, deploy the merged
      plugin, retire standalone Garden-allocator/Garden-rankings, migrate configs
      (allocator `config.json` + `data.db` + `gamedata/` as-is; rankings config →
      `config/rankings.json`), set `EnableFallbackAllocation=false`, redeploy website
      (react-markdown deps + new endpoints/pages), `npx prisma generate`.
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

### Phase W — website/bot follow-ups (opportunistic)
- [x] **Commands reference page** (`/commands`) — DONE 2026-07-09: renders
      `content/commands.md` (mirror of `Garden-retakes/COMMANDS.md` — keep BOTH in sync whenever
      commands change), same markdown pipeline/styles as /roadmap, NavBar link.
- [ ] **Roadmap page** (`/roadmap`) — DONE 2026-07-09: renders this file (mirrored to
      `Garden-website/content/roadmap.md` — keep the mirror in sync on every roadmap change).
- [x] Admin log page — DONE 2026-07-09: hidden key-protected URL
      `/admin-log?key=<INVSIM_API_KEY>` (not in the nav), last 200 `GardenAdminLog` entries;
      Prisma models `GardenAdmin`/`GardenAdminLogEntry` added (run `npx prisma generate`).
- [x] Duels ladder — DONE 2026-07-09: plugin persists every completed 1v1 to `DuelRecords`
      (season, map, arena, winner/loser, challenge flag + final score; best-effort like the admin
      log; schema in SchemaUpgrades + blank-schema.sql + Prisma). Website `/duels` page: season
      ladder (wins/losses/winrate/challenges won) + last 20 duels; NavBar link.
- [ ] Discord D4/D5.

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
- 2026-07-09 (20): New skin collections (today's CS2 update): @ianlucas/cs2-lib bumped to 8.0.3
  (published today with the regenerated item catalog) — run `npm update @ianlucas/cs2-lib` to
  refresh the lockfile before redeploying. The inventory simulator picks the new collections up
  automatically (runtime catalog + cdn.cstrike.app images). Same recipe for future drops.
