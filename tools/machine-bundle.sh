#!/usr/bin/env bash
#
# machine-bundle.sh — move this working setup to another machine, in one file.
#
#   On THIS machine:   ./tools/machine-bundle.sh pack
#   On the LAPTOP:     ./tools/machine-bundle.sh restore ~/garden-bundle-<date>.enc
#   Any time:          ./tools/machine-bundle.sh doctor
#
# WHAT IT MOVES
#   .env                      — 72 keys: DATABASE_URL (Aiven MySQL), AUTH_SECRET,
#                               STEAM_API_KEY, RCON_*, DATHOST_*, DISCORD_*,
#                               FACEIT_*, GAMESERVER_FTP_*. This is the whole
#                               database and server connection story: there is no
#                               separate config to copy.
#   .env.local                — if you have one.
#   an SSH key                — only with --with-ssh-key <path>, and only because
#                               the VPS deploy needs one. Never included by default.
#
# WHAT IT CANNOT MOVE, AND WHY
#   Vercel. There is no Vercel credential anywhere in this repo — no .vercel
#   directory, no VERCEL_* key in .env — because deploys happen through GitHub,
#   not the CLI: pushing to `main` is the deploy. Vercel's own auth is an
#   interactive browser login or a token you create in the dashboard, so it
#   cannot be packaged from here. `restore` prints the two commands for it.
#
# THE ARCHIVE IS ENCRYPTED. It contains every secret this project has; an
# unencrypted copy in a Downloads folder or a chat attachment is a breach. The
# passphrase is asked for interactively and never written down. Move the file
# over something private and delete it from both machines afterwards.
#
# Nothing here ever prints a secret value — not to the terminal, not to a log.
# Key NAMES are printed by `doctor`; values are not.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BUNDLE_NAME="garden-bundle-$(date +%Y%m%d).enc"
BUNDLE_OUT="${HOME}/${BUNDLE_NAME}"

# Cleaned up by the EXIT trap. NOT `local`: a trap fires after the function
# has returned, when a local is out of scope, and under `set -u` that aborts
# with "stage: unbound variable" — masking whatever actually went wrong.
STAGE=""
cleanup() { if [ -n "$STAGE" ]; then rm -rf "$STAGE"; fi; }
trap cleanup EXIT

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
die()  { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "Missing '$1'. Install it and re-run."
}

# openssl reads a passphrase from the TERMINAL, not from stdin, which is right
# for a human and impossible for a script. GARDEN_BUNDLE_PASS is the way in for
# automation — and for this script's own round-trip test, which would otherwise
# be untestable. Unset by default, so the normal path is still the prompt.
pass_args() {
  if [ -n "${GARDEN_BUNDLE_PASS:-}" ]; then
    printf '%s' "-pass env:GARDEN_BUNDLE_PASS"
  fi
}

# ---------------------------------------------------------------- pack -------

cmd_pack() {
  local ssh_key=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --with-ssh-key) ssh_key="${2:-}"; shift 2 ;;
      *) die "Unknown option: $1" ;;
    esac
  done

  need tar
  need openssl

  [ -f .env ] || die "No .env here. Run this from the repo that has one."

  STAGE="$(mktemp -d)"
  local stage="$STAGE"

  mkdir -p "$stage/bundle"
  cp .env "$stage/bundle/.env"
  if [ -f .env.local ]; then cp .env.local "$stage/bundle/.env.local"; fi

  if [ -n "$ssh_key" ]; then
    [ -f "$ssh_key" ] || die "No SSH key at: $ssh_key"
    cp "$ssh_key" "$stage/bundle/vps_key"
    if [ -f "${ssh_key}.pub" ]; then cp "${ssh_key}.pub" "$stage/bundle/vps_key.pub"; fi
    info "Including SSH key: $(basename "$ssh_key")"
  fi

  # A manifest of NAMES, so the other side can check nothing was lost without
  # anybody having to open the file and look at values.
  sed 's/=.*//' .env | grep -v '^#' | grep . | sort > "$stage/bundle/MANIFEST-keys.txt"

  cat > "$stage/bundle/WHERE-THINGS-ARE.txt" <<'TXT'
Connections, and where each one lives.

  DATABASE      DATABASE_URL in .env. Aiven MySQL, and it is the LIVE database —
                a local `next start` reads and writes production data. For
                anything destructive use a throwaway instead:
                  docker run -d --name garden-test-db \
                    -e MYSQL_ROOT_PASSWORD=testpw -e MYSQL_DATABASE=garden \
                    -p 33077:3306 mysql:8
                  node tools/apply-sql.mjs sql/<file>.sql

  VERCEL        Not a credential. Deploys are `git push origin HEAD:main`;
                Vercel builds what GitHub receives. retakes.fr serves `main`
                and there is no staging. For the CLI (optional):
                  npx vercel login          # browser
                  npx vercel link           # pick the existing project
                Never commit a token. VERCEL_TOKEN belongs in the shell, not
                in .env.

  VPS           213.130.147.107 over SSH. The socket server is at
                /opt/garden-socket and is a COPY, not a checkout — update with
                rsync, then: systemctl restart garden-socket   (port 8443)
                The CS2 fleet deploys with ./deploy-vps.sh (t1–t6, VPS only).

  DATHOST       DATHOST_* in .env — HTTP basic auth against
                https://dathost.net/api/0.1. The console is the only reliable
                liveness test; A2S is filtered on private_server: true.
                It runs the all-in-one R5e-games plugin and must NEVER receive
                the tournament plugin.

  GAME SERVERS  RCON_HOST / RCON_PORT / RCON_PASSWORD in .env.
TXT

  say "Encrypting the bundle"
  if [ -n "${GARDEN_BUNDLE_PASS:-}" ]; then
    info "Using GARDEN_BUNDLE_PASS from the environment."
  else
    info "You will be asked for a passphrase twice. Choose one you can type on"
    info "the other machine, and send it separately from the file itself."
  fi

  # shellcheck disable=SC2046 — pass_args is empty or one flag pair, both fine.
  tar -C "$stage" -czf - bundle \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt $(pass_args) -out "$BUNDLE_OUT"

  chmod 600 "$BUNDLE_OUT"

  say "Done"
  info "Bundle:   $BUNDLE_OUT"
  info "Size:     $(du -h "$BUNDLE_OUT" | cut -f1)"
  info "SHA-256:  $(openssl dgst -sha256 "$BUNDLE_OUT" | awk '{print $2}')"
  printf '\n'
  info "Move it over something private — a USB stick, scp, or your password"
  info "manager's file attachment. Not a chat, not a gist, not email."
  info "Then on the laptop:"
  info "  ./tools/machine-bundle.sh restore ~/$BUNDLE_NAME"
  printf '\n'
  info "Delete it from both machines once restore has worked."
}

# ------------------------------------------------------------- restore -------

cmd_restore() {
  local archive="${1:-}"
  [ -n "$archive" ] || die "Usage: $0 restore <bundle.enc>"
  [ -f "$archive" ] || die "No such file: $archive"

  need tar
  need openssl

  STAGE="$(mktemp -d)"
  local stage="$STAGE"

  say "Decrypting"
  # shellcheck disable=SC2046
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 $(pass_args) -in "$archive" \
    | tar -C "$stage" -xzf - \
    || die "Could not decrypt. Wrong passphrase, or the file did not survive the trip."

  [ -f "$stage/bundle/.env" ] || die "Bundle has no .env — was it made by pack?"

  if [ -f .env ]; then
    cp .env ".env.backup.$(date +%s)"
    info "Existing .env backed up."
  fi

  cp "$stage/bundle/.env" .env
  chmod 600 .env
  info "Restored .env ($(grep -c . "$stage/bundle/MANIFEST-keys.txt") keys)."

  if [ -f "$stage/bundle/.env.local" ]; then
    cp "$stage/bundle/.env.local" .env.local
    chmod 600 .env.local
    info "Restored .env.local."
  fi

  if [ -f "$stage/bundle/vps_key" ]; then
    mkdir -p "$HOME/.ssh"
    cp "$stage/bundle/vps_key" "$HOME/.ssh/garden_vps"
    chmod 600 "$HOME/.ssh/garden_vps"
    if [ -f "$stage/bundle/vps_key.pub" ]; then cp "$stage/bundle/vps_key.pub" "$HOME/.ssh/garden_vps.pub"; fi
    info "Restored SSH key to ~/.ssh/garden_vps"
    info "Use it with: ssh -i ~/.ssh/garden_vps root@213.130.147.107"
  fi

  cp "$stage/bundle/WHERE-THINGS-ARE.txt" ./WHERE-THINGS-ARE.txt 2>/dev/null || true
  info "Notes written to ./WHERE-THINGS-ARE.txt (gitignored)."

  say "Installing"
  need node
  command -v pnpm >/dev/null 2>&1 || {
    info "pnpm is missing. Installing with corepack."
    corepack enable >/dev/null 2>&1 || npm i -g pnpm
  }

  info "pnpm install — this project does NOT build after npm install."
  pnpm install
  npx prisma generate

  say "Checking"
  node tools/check-i18n.mjs
  node tools/tests/run.mjs

  say "Building"
  ./node_modules/.bin/next build

  say "Ready"
  info "Look at it:   ./node_modules/.bin/next start -p 3111"
  info "Deploy:       git push origin HEAD:main   (Vercel builds what GitHub gets)"
  printf '\n'
  info "Vercel CLI, only if you want it — there is no token to restore:"
  info "  npx vercel login"
  info "  npx vercel link"
  printf '\n'
  info "Now delete the bundle from both machines."
}

# -------------------------------------------------------------- doctor -------

cmd_doctor() {
  say "Toolchain"
  info "node   $(node -v 2>/dev/null || echo 'MISSING')"
  info "pnpm   $(pnpm -v 2>/dev/null || echo 'MISSING — corepack enable')"
  info "git    $(git --version 2>/dev/null | awk '{print $3}' || echo MISSING)"

  say "Repo"
  info "branch $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  info "head   $(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  info "clean  $([ -z "$(git status --porcelain 2>/dev/null)" ] && echo yes || echo 'no — uncommitted changes')"

  say "Secrets"
  if [ -f .env ]; then
    info ".env present, $(sed 's/=.*//' .env | grep -v '^#' | grep -c .) keys"
    # Names only. Never values.
    for k in DATABASE_URL AUTH_SECRET STEAM_API_KEY NEXT_PUBLIC_SOCKET_URL RCON_HOST DATHOST_SERVER_ID; do
      if grep -q "^${k}=" .env; then
        info "  $k  set"
      else
        info "  $k  MISSING"
      fi
    done
  else
    info ".env MISSING — run restore, or copy it by hand."
  fi

  say "Database"
  if [ -f .env ] && command -v node >/dev/null 2>&1; then
    node --env-file=.env -e '
      const { PrismaClient } = require("@prisma/client");
      const p = new PrismaClient();
      p.$queryRaw`SELECT 1`
        .then(() => console.log("  reachable"))
        .catch((e) => console.log("  UNREACHABLE:", String(e.message).split("\n")[0]))
        .finally(() => p.$disconnect());
    ' 2>/dev/null || info "  could not test (prisma generate not run yet?)"
  fi
}

# ---------------------------------------------------------------- main -------

case "${1:-}" in
  pack)    shift; cmd_pack "$@" ;;
  restore) shift; cmd_restore "$@" ;;
  doctor)  shift; cmd_doctor "$@" ;;
  *)
    sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
