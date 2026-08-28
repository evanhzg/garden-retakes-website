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

## 1. Persistent teams  — the big one

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
- **GOTV needed a launch argument, not a cvar.** Worth knowing because it will
  look like a config problem the next time it breaks and it is not. The relay
  binds its socket during map load and only if `tv_enable` is already 1, so
  setting it from a cfg exec'd afterwards does nothing until the next
  changelevel. It is now passed by `deploy/vps-run-server.sh`, which
  `deploy-vps.sh` syncs. **To check it, look at the socket, not the cvar:**
  `ss -lunp | grep 270` on the box should list twelve ports — six game, six TV.
  `tv_enable` reported `true` on servers with no listener at all.
- **Idle servers can still report `tv_delay 30`.** Valve's own
  `gamemode_*.cfg` sets it, and a server that is not running a tournament match
  has not exec'd ours. Any server that starts a match execs `tournament.cfg` and
  goes to 0. Cosmetic, but it looks like the fix did not take.
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
