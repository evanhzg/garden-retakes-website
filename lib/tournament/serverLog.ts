import crypto from "node:crypto";
import { appendLog } from "@/lib/tournament/console";

/**
 * Where a server's console output actually comes from.
 *
 * Two different things get called "the console" and only one of them was ever
 * captured here. `/api/admin/console` opens an RCON connection, sends one
 * command, and keeps the reply — that is a request and its answer. It is blind
 * to everything the server says when nobody asked: connects, disconnects,
 * kills, chat, plugin exceptions, the line explaining why a map failed to load.
 * A console that only echoes replies cannot answer "what happened just now",
 * which is the only question anybody opens a console to ask.
 *
 * RCON cannot fix that on its own. The protocol has no server-initiated
 * messages at all — nothing arrives that was not a response to a packet we
 * sent — so no amount of polling turns it into a tail. The output has to be
 * pushed from the other end.
 *
 * CS2 will do that. `logaddress_add_http <url>` makes the server POST its log
 * stream to an HTTP endpoint, which is what `/api/admin/console/log` is. The
 * classic `logaddress_add <ip:port>` form was rejected rather than added
 * alongside it: this site is deployed as a single web service (see render.yaml)
 * that is routed one TCP port, so an inbound UDP listener would bind fine, log
 * nothing, and be indistinguishable from a fleet that had not been armed.
 *
 * WHAT THIS DOES AND DOES NOT CAPTURE, because the difference matters and is
 * easy to overclaim:
 *
 *   - It is the server's LOG stream, which is most of what the console prints
 *     and is the half that describes the game: every connect, every kill, every
 *     round, chat, team changes, and anything a plugin writes through its
 *     logger.
 *   - It is not literally every line of the process's stdout. Engine chatter
 *     printed only to the local console — cvar echoes, some startup spew, a few
 *     kinds of engine warning — never enters the log stream and therefore never
 *     arrives here. Capturing those needs `con_logfile` and a way to read a
 *     file off the box, which is a filesystem problem, not a website one.
 *
 * The UI says which of the two it is showing rather than implying the stronger
 * one, and `tailState` below is what it says it from.
 */

/** How long after the last line a tail still counts as live. */
const TAIL_FRESH_MS = 90_000;

type Tail = { lines: number; lastAt: number };

const TAILS = new Map<number, Tail>();

/**
 * The shared secret the game server presents when it posts.
 *
 * Derived from AUTH_SECRET rather than read from a new environment variable,
 * because a capability that needs an ops change before it can be tried is a
 * capability nobody tries. Domain-tagged and per server, so a token that leaks
 * out of one server's config cannot be used to inject log lines into another
 * server's scrollback.
 */
function tokenFor(serverId: number): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  return crypto
    .createHmac("sha256", secret)
    .update(`console-log:${serverId}`)
    .digest("base64url");
}

/** Constant-time, because this is a bearer token on an unauthenticated route. */
export function verifyLogToken(serverId: number, presented: string | null): boolean {
  const expected = tokenFor(serverId);
  if (!expected || !presented) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Where the game server should post.
 *
 * Null when the site does not know its own public address. That is a real
 * state and not a fallback worth guessing at: `logaddress_add_http` pointed at
 * a wrong host fails silently on the server, and the admin would be left
 * looking at a console that says it is armed and never receives a line.
 */
export function logSinkUrl(serverId: number): string | null {
  const origin = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  const token = tokenFor(serverId);
  if (!origin || !token) return null;

  return `${origin.replace(/\/$/, "")}/api/admin/console/log?server=${serverId}&token=${token}`;
}

/**
 * What to send to point a server at us.
 *
 * `log on` is not redundant with the address: a server with a log address and
 * logging off posts nothing at all. `mp_logdetail 3` is what turns damage and
 * kill lines on, which is the half of the stream anybody actually reads during
 * a match.
 *
 * Each of these is run separately and its reply recorded verbatim, so a build
 * that does not know `logaddress_add_http` says "Unknown command" in the
 * scrollback rather than leaving the admin to wonder.
 */
export function armCommands(url: string): string[] {
  return [`logaddress_add_http "${url}"`, "log on", "mp_logdetail 3"];
}

export function disarmCommands(): string[] {
  return ["logaddress_delall_http"];
}

/**
 * Take a posted body apart into lines and file them.
 *
 * Bounded in both directions. A server that has been running for a while can
 * post a large batch, and the buffer it lands in is a fixed 600 lines — so
 * accepting an unbounded body would mean spending memory to overwrite the
 * scrollback that was worth keeping.
 */
export function ingest(serverId: number, body: string): number {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .slice(-400);

  for (const line of lines) {
    appendLog(serverId, line.slice(0, 500));
  }

  if (lines.length > 0) {
    const tail = TAILS.get(serverId) ?? { lines: 0, lastAt: 0 };
    tail.lines += lines.length;
    tail.lastAt = Date.now();
    TAILS.set(serverId, tail);
  }

  return lines.length;
}

export type TailState = {
  /** Whether the site can even tell a server where to post. */
  configured: boolean;
  /** Whether a line has arrived recently enough to call the tail live. */
  live: boolean;
  /** Total lines received this process lifetime, so "0" is distinguishable. */
  lines: number;
  lastAt: string | null;
};

/**
 * Whether this server's own output is actually arriving.
 *
 * The honest half of the feature. Arming is a command that can be refused, a
 * URL that can be unreachable, and a firewall that can drop the POST — none of
 * which the site learns about from the RCON reply. The only proof that the tail
 * works is a line having arrived, so that is what is reported, rather than
 * whether the button was pressed.
 */
export function tailState(serverId: number): TailState {
  const tail = TAILS.get(serverId);

  return {
    configured: logSinkUrl(serverId) !== null,
    live: tail !== undefined && Date.now() - tail.lastAt < TAIL_FRESH_MS,
    lines: tail?.lines ?? 0,
    lastAt: tail?.lastAt ? new Date(tail.lastAt).toISOString() : null,
  };
}
