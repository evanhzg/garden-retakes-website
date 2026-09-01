# Handoff — continuing the design rebuild

Written at the end of the session that ended at `89b7fa25`. Everything below
is fact checked against the running site, not from memory.

---

## 1. Where the work is

- **Repo:** `git@github.com:evanhzg/garden-retakes-website.git`
- **Branch that matters:** `main`. Everything from this session is **pushed and
  deployed** — `main` is what Vercel serves at retakes.fr, and there is no
  staging.
- **HEAD at handoff:** `89b7fa25`.
- The session worked in a git worktree (`.claude/worktrees/tournament`, branch
  `worktree-tournament`) and pushed with `git push origin HEAD:main`. On a
  laptop **ignore the worktree entirely** — clone and work on `main`.

```bash
git clone git@github.com:evanhzg/garden-retakes-website.git
cd garden-retakes-website
git log --oneline -14        # the session's commits should be at the top
```

## 2. Getting it running

```bash
pnpm install                 # pnpm ONLY — npm install breaks the build
cp /path/from/desktop/.env . # see §3
npx prisma generate
./node_modules/.bin/next build
```

**pnpm only.** `npm install` produces a tree this project does not build with.
That is a standing rule, not a preference.

The three checks, run after every change:

```bash
./node_modules/.bin/next build          # NOT `pnpm build` if you want it quick —
                                        # that runs check-i18n + prisma generate too
node tools/tests/run.mjs                # 37 files, plain node, globs *.test.mts
node tools/check-i18n.mjs               # en/fr parity — currently 3158 / 3158
```

To look at it in a browser, build then serve — `next dev` is fine too but the
production build is what catches the real layout:

```bash
./node_modules/.bin/next start -p 3111
```

## 3. Secrets

`.env` is **gitignored and must stay that way**. It holds **72 keys** —
`DATABASE_URL`, `AUTH_SECRET`, `STEAM_API_KEY`, `RCON_*`, `DATHOST_*`,
`DISCORD_*`, `FACEIT_*`, `GAMESERVER_FTP_*` and more. There is no
`.env.example`.

Copy the file across by hand over something private. Do not paste it into a
chat, a gist, or a commit.

`DATABASE_URL` points at the **live Aiven MySQL** — the same database the
deployed site uses. A local `next start` is therefore reading and writing
production data. That is how this project has always been developed, but know
it: a destructive query locally is destructive for real. For anything
destructive, use a throwaway container instead:

```bash
docker run -d --name garden-test-db -e MYSQL_ROOT_PASSWORD=testpw \
  -e MYSQL_DATABASE=garden -p 33077:3306 mysql:8
node tools/apply-sql.mjs sql/<file>.sql   # then point DATABASE_URL at it
```

## 4. Things that will bite you

- **ES target is below ES2020.** No BigInt literals (`123n`), no spread on a
  string, no spread on a `Set`, no `for…of` over a typed array. Use
  `Array.from()`. This cost four separate build failures in one session.
- **Demo mode is ON.** It is a row in `GardenSchedulerState` (`Key="DemoMode"`),
  toggled from the admin overview. While it is on, `/stats` serves the
  tournament hub instead of the ladder boards, `/players/[id]` serves
  `DemoProfile`, and the nav is cut down. If a page looks unexpectedly sparse,
  check this before hunting for a bug.
- **Deploys take about 2–4 minutes** after a push. Poll for a marker rather
  than guessing:
  ```bash
  curl -s https://www.retakes.fr/ | grep -o '/_next/static/css/[a-z0-9]*\.css'
  # then curl that stylesheet and grep for a class you just added
  ```
- **The socket server is not in this deploy.** It runs on the VPS at
  `/opt/garden-socket` (port 8443) and is a *copy*, not a checkout — update it
  with rsync + `systemctl restart garden-socket`. Vercel cannot run
  `server.js`.
- **The dathost server must never receive the tournament plugin.** It runs the
  all-in-one `R5e-games` build. `deploy-tournament.sh` refuses it; keep it
  that way.
- `pkill -f "next start -p 3111"` **kills the shell running it** if that
  string is in the same command line. Start and stop in separate commands.

## 5. What this session changed, in one paragraph each

Read the commit messages — they are long on purpose and explain the reasoning
and the bug behind each change. `git log --format='%h %s%n%b' -14`.

- `89b7fa25` settings form: 11 English literals translated.
- `711e8b2b` nine fixes — the player-card API querying a season that does not
  exist, presence moved into `SocketProvider`, `/settings` restored, the
  notification panel positioned for the rail, match-result design, form-page
  session→match links, team page links.
- `3f20ab77` chat docks survive folding the panel; status menu and tournament
  dot escape their clipping parents; `DELETE /api/friends` (unfriending did
  not exist); lobby players open cards.
- `b1682bf8` / `933d767e` matchmaking: squared, modes renamed 2v2/3v3, the
  page reordered to the order of the task, three "Leave Game" buttons that
  left nothing.
- `85b02ef7` **the site-wide hydration error** — `Toast.tsx` portalled into
  `<body>` on the client's first render only. Every page was re-rendering
  wholesale on the client. Fixed and verified: zero hydration errors.
- `ba7eb505` stats hub (MVP + player of the month + tabs + archive).
- `01d5eb97` avatars on four tournament lists, plus request batching.

## 6. What is still open

**From `content/TOURNAMENT-TODO.md`:**

- **§3 demo downloads.** Needs a collector running *on the VPS* — Vercel
  functions have no SSH key for the game servers. Add a `DemoUrl` column
  beside `DemoFile`, let the collector fill it, and `MapCards.tsx` renders the
  button when the URL is present. The component comment says exactly this; it
  is one condition away.
- **§4 spectator freezetime menus.** Plugin work, in the other repo, and the
  doc itself marks it nice-to-have.
- **§5 loose ends** — the scoreboard and the history modal are deployed but
  have never been watched end to end on a live match. First bot match on BOT
  WORLD CUP, check the scoreboard, the MVP card and the warmup countdown
  together.

**From `content/roadmap.md` (Phase G) — the file is stale:**

- G7 says the socket server still needs production hosting. It runs on the
  VPS. The same entry says CORS is `*`; `server.js` has a real allowlist.
  **This file is a mirror of the plugin repo's roadmap**, so fix both copies
  or neither — editing one desyncs the mirror.
- G6 (per-game UI pass for Monopoly, Codenames, CAH, Meme, Skribbl) is
  genuinely open.

**Known and deliberately not done:**

- The non-demo `/stats` page (the season ladder) was not restyled. Turn demo
  mode off and it is the old panel stack.
- `components/AvatarMenu.tsx` is now unused — the rail's avatar was removed
  and its contents became rail buttons and `/settings`. Left in place rather
  than deleted.

## 7. Conventions worth not re-learning

`content/DESIGN-CONVENTIONS.md` is the source of truth. The two that came up
most:

- **Sharp corners.** `--radius-sm/md/lg` are all `0`. No pills, no rounded
  cards. Circles are for avatars and status dots only. A whole session was
  spent squaring things that had drifted.
- **Logic decidable from values lives in an import-free module with tests.**
  See `lib/tournament/honours.ts`, `lib/sessionMatches.ts`,
  `lib/tournament/veto.ts`. Tests are plain node in `tools/tests/*.test.mts`.
- Names of people, teams and tournaments are set in the serif
  (`var(--font-serif)`), roman for the thing itself, italic for asides.
- Every user-visible string goes in both `locales/en.json` and
  `locales/fr.json`, in real French. `check-i18n` gates it.
