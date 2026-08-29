# Tournament system — what is still to do

Written at the end of the session that built the role draft, the match page, the
live consoles, the bot driver and the server queue. Everything below is **not**
built. It is written so somebody picking it up cold does the intended thing
rather than a plausible neighbour of it.

Read `content/DESIGN-CONVENTIONS.md` before touching UI. The tournament code
follows one house rule throughout: **anything decidable from numbers alone goes
in an import-free module with tests** (`lib/tournament/veto.ts`, `roles.ts`,
`edition.ts`, `serverAccess.ts`, and `R5eGames.Tournament.Core` on the plugin
side). The parts that talk to a database or a game server stay thin and call
into those. Keep that split.

---

## 1. Persistent teams — DONE (2026-08-29)

Built as specified. `lib/tournament/teams.ts` holds the rules with 38 tests in
`tools/tests/teams.test.mts`; `teamStore.ts` is the database half; `/teams` gains
a standing-teams section above the Blitz ladder it already had, and
`/teams/<slug>` is the team. `sql/garden-teams.sql` is applied to production.

What is worth knowing that the spec did not say:

- **The captain is a member row**, not just `CaptainSteamId`. Without it every
  membership query has to special-case the captain and one of them eventually
  forgets.
- **Deleting a team keeps its results.** Members go and the pointer on past
  entries is cleared, so the entry becomes the ad-hoc row it would have been.
  Deleting the entries would orphan every scoreboard and bracket holding them.
- **`canActOn` refuses acting on the captain from anybody**, including the
  captain. Handing the team over is its own action with its own confirmation,
  never a side effect of a demotion.
- Entering is idempotent: a team already in a tournament has its roster replaced
  rather than a second entry created, so changing who plays is one action.

Left undone deliberately: team avatars (the columns exist, nothing uploads to
them yet) and cross-tournament team STATS. The team page shows a record built
from the bracket — played, won, titles — but not aggregated player stats. When
that is added, note `lib/tournament/stats.ts` is rounds-weighted and never a
mean of means; team stats must match.

## 1b. (original spec, kept for reference)

**Today** a "team" is a row scoped to one tournament (`TournamentTeams`). Five
players entering three events are three unrelated rows, which is why
`Results.tsx` has to group team rankings by NAME rather than by id. There is no
team page, no team identity, and no way to arrive at a tournament as a unit.

**Wanted**

- A standing team that exists outside any tournament, with its own page.
- **No cap on the roster.** A team may hold twenty players.
- **You pick who enters.** Joining a tournament selects a subset of the roster —
  the tournament's `TeamSize` decides how many.
- **A player may belong to several teams, but may enter one tournament with only
  one of them.** This is the invariant most likely to be got wrong: enforce it
  at the point of entry, and write the test before the UI.
- **Captain, and manager.** The captain owns the team; managers can do
  everything except delete it or remove the captain. Managed from a settings
  modal on the team page, in the shape `MatchAdminModal` already uses.
- **Stats that follow the team across every tournament it has entered.**

**Shape it should take**

```
GardenTeam            Id, Name (unique), Tag, CaptainSteamId, CreatedAt,
                      AvatarBytes/Mime  (banners already work this way on
                      Tournaments — there is no object storage here)
GardenTeamMember      TeamId, SteamId, Role: captain|manager|player, JoinedAt
TournamentTeams       gains  GardenTeamId Int?   ← the link, nullable so every
                      existing ad-hoc team keeps working untouched
```

Nullable is the point: a tournament team that came from a standing team points
at it, and one that did not is exactly what it is today. Nothing needs
migrating.

**Where the work lands**

- `sql/garden-teams.sql` — idempotent, in the style of
  `sql/tournament-role-draft.sql`. **The database has no foreign keys**, so
  Prisma's `onDelete: Cascade` does nothing; deleting a team must delete its
  members explicitly. See the sweep in `tools/reset-tournaments.mts` — that
  lesson cost 160 orphaned rows.
- `lib/tournament/teams.ts` — pure rules: who may edit what, whether a player is
  already entered in this tournament with another team. Tests in
  `tools/tests/teams.test.mts`.
- `app/teams/page.tsx`, `app/teams/[slug]/page.tsx`.
- The registration flow in `app/tournaments/[slug]/register/page.tsx` gains
  "enter with a team", which then asks which players.

**Careful of**

- `lib/tournament/stats.ts` aggregates rounds-weighted, never a mean of means.
  Team stats must do the same — see the comment there.
- Team names are used in console commands (`css_t_team`). `consoleName()` in
  `matchRunner.ts` already strips quotes and semicolons; keep going through it.

---

## 2. Avatars everywhere

`components/AvatarImage.tsx` already resolves through `/api/avatars` and falls
back to `/default_pp.png`. It is used on the MVP card and almost nowhere else in
the tournament pages.

Add it to: the team panels either side of the match (`TeamPanel.tsx`), the
scoreboard's name column (`Scoreboard.tsx`), the roster list
(`Roster.tsx`), the role draft's pick order (`RoleDraft.tsx`), and the bracket
boxes if it can be done without making them taller — the bracket depends on
every card being the same height, so an avatar that changes row height breaks
the alignment fixed in `dfda2b88`.

Server components should batch through `resolveAvatars()` in `lib/avatars.ts`
rather than letting each `AvatarImage` fetch on its own; a scoreboard of ten
players is otherwise ten requests.

---

## 3. Demo downloads

**Today** `/api/tournament/demo` records that a demo EXISTS. The file is still
on the game server. `MapCards.tsx` therefore names the recording instead of
offering a download, deliberately — a button that 404s reads as the demo being
lost.

**Wanted:** a collector that moves finished demos off the game servers into
somewhere fetchable, and then a real button.

**The constraint that shapes this:** the website runs on Vercel. Vercel
functions are ephemeral and have no SSH key for the VPS, so they cannot pull
from the game servers. The collector has to be something that runs **on the
VPS** — a cron or a small service — and pushes to storage, then calls the
existing `/api/tournament/demo` with a URL rather than a bare filename.

So: add a `DemoUrl` column beside `DemoFile`, let the collector fill it, and
make `MapCards.tsx` render the button when the URL is present. The component
comment says exactly this; it is one condition away.

Demo files are already named for both teams and land in a folder named after
the tournament (`DemoRecorder.Begin`), so the collector can walk it per event.

---

## 4. Spectators seeing a player's freezetime menu

**Wanted:** while spectating a player, optionally see the menu that player is
seeing — spawn choice, sniper prompt — as a toggle, off by default.

**Feasibility, honestly:** the menus are drawn with
`CenterMessage`/`CenterMenuService`, which prints to one player's centre HUD via
`PrintToCenterHtml`. There is no CS2 mechanism for "show me another player's
HUD", so this cannot be done by mirroring — it has to be **redrawn** for the
spectator from the same model.

That is tractable because `MenuModel.cs` already separates the cursor and rows
from the rendering. The work is:

- Know who each spectator is watching. `CCSPlayerController.ObserverPawn` →
  `ObserverServices.ObserverTarget` gives the observed pawn; map it back to a
  controller.
- On the menu tick, for each spectator with the toggle on, render the observed
  player's `OpenMenu` to the spectator's own centre HUD, read-only — no input
  handling, and it must never be able to move the player's real cursor.
- A `!spectatemenus` toggle, persisted for the session only.

**Careful of:** `CenterMenuService.OnTick` currently iterates open menus by
player slot and writes one HUD per player. Rendering a second copy must not let
a spectator's input reach `MenuCursor.SetIndex` — the highlight hook teleports
the player, and that is a live match.

Nice-to-have rather than required for an event; put it after teams and avatars.

---

## 5. Loose ends worth knowing

- **The scoreboard is deployed but unproven end to end.** `MatchStats` collects
  and `MatchFeed.PlayerStats` sends, and 24 tests cover the arithmetic, but no
  bot match has yet run on a server carrying the build. First thing to do next
  session: start a match on BOT WORLD CUP and check the scoreboard, the MVP card
  and the map-end warmup countdown together.
- **The history modal is unproven end to end, for the same reason.** It is built
  on `css_roundinfo`, which reads the engine's round backup files — and those
  only exist once a match has played rounds on a server carrying this build. The
  parser is pinned against a file CS2 actually wrote (`BackupSummaryTests`, and
  `tools/tests/backups.test.mts` for the wire format), but nobody has yet opened
  a round in the UI. Check the loadouts and the per-round kills specifically: the
  kills are a subtraction between two backups, and a sign error there shows as
  every player having zero.
- **GOTV: it is OUR PLUGIN, not the engine.** Proven by elimination, and this is
  the one fact worth keeping — four earlier theories were wrong and are recorded
  below so nobody retries them.

  The experiment: same instance, same GOTV, tournament plugin moved aside.

  | t6 | plugin | GOTV | result |
  |----|--------|------|--------|
  | with plugin | on  | on | watchdog + segfault every ~100s, for hours |
  | without     | off | on | **0 crashes, 0 level changes, 11 minutes, relay answering A2S** |

  So a stock CS2 server runs GOTV on this box perfectly well. Something the
  tournament plugin does, roughly 100 seconds after the map settles, provokes a
  level reload; SourceTV is torn down and restarted inside it, and that restart
  hangs until the watchdog kills the process.

  **Ruled out, with the measurement that ruled it out:**

  - *Capacity.* One instance with GOTV crashed on an otherwise idle box at load
    1.42 while five others ran clean. Not CPU.
  - *`+tv_enable` as a launch argument.* It is the trigger, not the fault —
    turning GOTV on is simply what makes the server stay awake long enough to
    reach the reload.
  - *`game_mode` in tournament.cfg.* Real bug, genuinely fixed (the fleet had
    been booting into Casual and being corrected afterwards), but not this one:
    with the corrected cfg and the plugin on, it still crashed 8 times in ten
    minutes.
  - *Hibernation.* `sv_hibernate_when_empty` already read `false` at runtime.

  **Where to look next**, in the plugin rather than the config:

  1. The ~100s delay is consistent and unexplained. Find what runs on that
     cadence with no match declared. The one-second `Tick` only calls
     `ApplyPendingModeCfg()` and then returns when `_match.Current` is null, so
     it is probably not the tick itself.
  2. SourceTV joins as a **player controller** — the log says
     `ClientPutInServer create new player controller [SourceTV]`. Anything that
     iterates players and acts on them is a suspect: `EnforceSides()` checks
     `IsHLTV`, but `TeamLock`, `MaintainBots` and the freezetime sweep should be
     audited for the same guard.
  3. Reproduce with the plugin loaded but no match, then bisect by disabling its
     subsystems, rather than by changing cvars.

  **How to test it.** Not `tv_enable`, and not a bound port — both read healthy
  for the entire ninety-minute outage. Use `tools/a2s-probe.mjs <ip>:<tv_port>`:
  a live relay answers with the server's name and map. And watch for ten
  minutes, because the crash cycle is ~100 seconds and anything shorter proves
  nothing.

  GOTV is off fleet-wide (`TV_ENABLE=0` per instance) until this is closed.

- **(superseded) GOTV: the cause is found, one step left.** Paused mid-verification to work on
  matchmaking, so this is written to be picked up cold.

  **What it is.** `r5e/tournament.cfg` writes `game_type 0` / `game_mode 1`.
  Writing `game_mode` is not an ordinary cvar set — it reloads the GameTypes
  manifest and takes the level with it. The plugin execs that cfg three seconds
  after every map start, so every boot has a level change queued behind it. The
  giveaway in the log is a dump of `ctm_idf_variantA…` / `tm_leet_variantA…`
  immediately before the teardown: that is the manifest reloading.

  **Why it only shows up with GOTV.** An empty server hibernates — no clients,
  no ticks — so the queued reload never arrives and nobody ever saw it. GOTV's
  relay connects as a player controller, which keeps the server awake, so the
  reload finally fires. SourceTV is torn down and restarted inside it, and that
  restart hangs:

  ```
  SourceTV shutting down, type non-relay, tv_enable is true
  CNetworkGameServerBase::SetServerState (ss_active -> ss_dead)
  Starting SourceTV server listening on port 27070, type non-relay
  WatchDog! Server took too long to process (probably infinite loop)
  FATAL ERROR: Watchdog timeout exceeded, exiting
  ```

  Every boot starts SourceTV twice. The first, logged as "port 0", is fine. The
  second, on the real port during that level change, is the one that dies.

  **The measurement.** Commenting `game_type`/`game_mode` out of ONE instance's
  `cfg/r5e/tournament.cfg`, with GOTV on: 159 seconds, zero level changes, zero
  watchdogs, one SourceTV start. The same instance with those two lines present
  crashed four times in five minutes. That is one observation, not a proof —
  **rerun it for ten minutes before rolling out.**

  **The fix to make.** Delete `game_type 0` / `game_mode 1` from
  `cfg/r5e/tournament.cfg` and let the launcher set them instead:
  `GAME_TYPE`/`GAME_MODE` in `deploy/vps-run-server.sh` already do this, per
  instance, and `GAME_MODE=1` makes the server exec `gamemode_competitive.cfg`
  at boot rather than `gamemode_casual.cfg`. Note the fleet default is still 0
  and has been all along — a tournament server has been booting into Casual and
  being corrected afterwards, which is a bug in its own right and the reason the
  cfg had to set the mode at all.

  Then enable GOTV with `TV_ENABLE=1` in each instance's
  `/opt/cs2/instances/tN.env`, one at a time, watching for ten minutes each.

  **What proves it works.** Not `tv_enable`, and not a bound port — both read
  healthy for ninety minutes while the fleet was dying. Query the GOTV port:
  `node tools/../a2s.mjs 213.130.147.107:27070` style A2S_INFO. A live relay
  answers with the server's name and map; a dead one does not answer at all.
  That check was already passing on t6 while GOTV was up.

- **(superseded, kept for the measurements) GOTV is OFF, and turning it on crashes the server.** This is the single most
  expensive thing in this document — it cost a ninety-minute fleet outage — so
  read it before touching anything with `tv_` in the name.

  Two true facts that pull in opposite directions. The relay binds its socket
  during map load and only if `tv_enable` is already 1, so setting it from a cfg
  afterwards does nothing until the next changelevel; that is why five of six
  servers had `tv_enable` reading `true` with no listener at all. **A bound port
  is the only proof — `ss -lunp | grep 270` should show twelve, six game and six
  TV.** But passing `+tv_enable 1` at launch, which is the only place that works,
  crash-loops the instance.

  Measured, on one instance, so it is not load: t6 with GOTV crashed four times
  in five minutes at load 1.42 while t1-t5 sat at zero crashes and eleven
  minutes' uptime. The launcher passed only `+tv_enable 1` at that point — no
  `tv_delay`, no `tv_advertise_watchable` — so that one argument does it. The
  crash is always the same, every line inside one second:

  ```
  Server waking up from hibernation
  HLTV:maxplayers set to 64
  Starting SourceTV server listening on port 27070, type non-relay
  ClientPutInServer create new player controller [SourceTV]
  SourceTV[0] broadcast active.
  WatchDog! Server took too long to process (probably infinite loop)
  FATAL ERROR: Watchdog timeout exceeded, exiting
  ```

  It hangs bringing SourceTV **up**, not running it. Two candidates, to try one
  instance at a time with `TV_ENABLE=1` in that instance's `.env` and nowhere
  else: the HLTV slot allocation against `-maxplayers_override 12` (HLTV asks for
  64 while the launcher forces 12), and the hibernation wake in the line above
  it. Note `sv_hibernate_when_empty 0` IS set by tournament.cfg and the server
  still logs a hibernation wake, which is worth understanding on its own.

  Until one of those is proven, the Watch button points at a closed port. That is
  where it was before this work; a crash-looping fleet is much worse.

- **Never set `tv_delay` from a cfg, or at runtime at all.** Changing it on a
  running server crashes it: `tv_delay 0` over RCON to a server sitting at 30
  took the process down (NRestarts 2 -> 3, start timestamp moved to the second
  the command was sent), while the same command to a server already at 0 did
  nothing. Writing the value it already has is harmless; changing it is fatal.
  A cfg is therefore the worst possible place for it — `_baseline.cfg` is exec'd
  by every mode on every map change. Setting it from `gamemode_casual_server.cfg`
  during map load was also tried, and crash-looped the fleet too; that is
  reverted.
- **Servers report `tv_delay 30`, from Valve's own `gamemode_casual.cfg`.** The
  fleet launches `+game_type 0 +game_mode 0`, so that file runs on every map load
  and sets the delay after any launch argument. It cannot be corrected — see
  above — and while GOTV is off it does not matter.
- **A match the plugin has forgotten is a state the website must survive.** A
  fleet restart wipes the plugin's in-memory match while the website still shows
  it live, and every RCON admin command then answers "no match is live". Force
  end and restart are database-first for exactly this reason and work anyway.
  Anything new that ends, scores or advances a match should be too — a feature
  that is only reachable through RCON is one that disappears at the worst
  moment.
- **`main` mirrors this branch.** Vercel deploys `main` to retakes.fr, so
  anything pushed there is live immediately. There is no staging.
- **Claude in Chrome would not connect** during this session, so none of the UI
  was checked visually — only via rendered HTML and builds. Worth a real look at
  the match page, the bracket, the map cards, the restart panel and the history
  modal.
- **"Players can't select sniper as both T and CT" was never reproduced.** The
  rules allow it and `tools/tests/roles.test.mts` now pins that they do. If it
  comes back, the thing to capture is whether the WHOLE draft board is
  unselectable rather than just the sniper: every button is disabled when the
  viewer is not the player on the clock, so somebody who is not recognised finds
  nothing selectable and reports it about whichever role they tried first.
- **A throwaway MySQL is the right way to test destructive work.**
  `docker run -d --name garden-test-db -e MYSQL_ROOT_PASSWORD=testpw -e
  MYSQL_DATABASE=garden -p 33077:3306 mysql:8`, then apply `sql/*.sql` with
  `tools/apply-sql.mjs`. It caught two real bugs this session before they
  reached production.
- **`deploy-tournament.sh` now refuses the public retakes box.** The tournament
  fleet deploys with `./deploy-vps.sh` over SSH. The dathost server runs the
  all-in-one `R5e-games` plugin and must never receive the tournament one.
