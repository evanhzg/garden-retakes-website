import net from "node:net";

/**
 * Source RCON, serialized.
 *
 * Two things were wrong with the previous version, and both were the kind that
 * look fine until the output gets long or two people click at once.
 *
 * **It truncated multi-packet responses.** Source splits any reply over ~4 kB
 * across several packets, and there is no length field saying how many are
 * coming. The old code armed a 150 ms timer on the *first* response packet and
 * then destroyed the socket, so `status` on a busy server came back cut off —
 * silently, as a short string rather than an error. The fix is the standard
 * one: after the real command, send an empty command with a different id. The
 * server answers in order, so its reply to *that* is the marker that everything
 * for the real command has arrived. No timers, no guessing.
 *
 * **Concurrent callers raced.** One connection per command, no serialization,
 * and `/api/server/live` fires on every homepage view while `/api/admin/overview`
 * fires another. A queue means the game server sees one conversation at a time,
 * which is also what makes a rate limit meaningful.
 */

const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;

const ID_AUTH = 1;
const ID_COMMAND = 2;
/** The sentinel whose reply means "the command's output is complete". */
const ID_SENTINEL = 3;

function packet(id: number, type: number, body: string): Buffer {
  const bodyBuf = Buffer.from(body, "utf8");
  const buf = Buffer.alloc(14 + bodyBuf.length);
  buf.writeInt32LE(10 + bodyBuf.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  return buf;
}

/** Where to send a command. The environment triple is the default target. */
export type RconTarget = { host: string; port: number; password: string };

export function envTarget(): RconTarget {
  const host = process.env.RCON_HOST;
  const port = Number.parseInt(process.env.RCON_PORT ?? "27015", 10);
  const password = process.env.RCON_PASSWORD;
  if (!host || !password) {
    throw new Error("RCON is not configured (RCON_HOST / RCON_PASSWORD).");
  }

  return { host, port, password };
}

function connectAndRun(command: string, target?: RconTarget): Promise<string> {
  const { host, port, password } = target ?? envTarget();

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 8000 });
    let buffer = Buffer.alloc(0);
    let authed = false;
    let response = "";
    let settled = false;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(response.trim());
    };

    socket.on("timeout", () => done(new Error("RCON timed out.")));
    socket.on("error", (e) => done(e));
    socket.on("close", () => done(new Error("RCON closed before the reply was complete.")));
    socket.on("connect", () => socket.write(packet(ID_AUTH, SERVERDATA_AUTH, password)));

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (buffer.length < 4 + size) break;

        const id = buffer.readInt32LE(4);
        const type = buffer.readInt32LE(8);
        const body = buffer.subarray(12, 4 + size - 2).toString("utf8");
        buffer = buffer.subarray(4 + size);

        if (!authed) {
          if (type !== SERVERDATA_AUTH_RESPONSE) continue;
          if (id === -1) return done(new Error("RCON auth failed (bad password)."));
          authed = true;

          socket.write(packet(ID_COMMAND, SERVERDATA_EXECCOMMAND, command));
          // Queued behind the real command. Its reply is the end marker.
          socket.write(packet(ID_SENTINEL, SERVERDATA_EXECCOMMAND, ""));
          continue;
        }

        if (type !== SERVERDATA_RESPONSE_VALUE) continue;

        if (id === ID_SENTINEL) {
          return done();
        }

        response += body;
      }
    });
  });
}

/**
 * One conversation at a time.
 *
 * A promise chain rather than an array: each call links onto the tail, so
 * ordering is FIFO for free and a rejection cannot break the chain for whoever
 * is behind it (the `catch` resets the tail to a resolved promise).
 */
/**
 * One conversation per SERVER, rather than one globally.
 *
 * Six parallel matches means six servers, and a single global chain would make
 * them wait on each other — a slow server would stall a match on a healthy one,
 * and a dead server would stall all six. Keyed per target, so each queue is
 * independent and a server that stops answering only refuses its own commands.
 */
const queues = new Map<string, { tail: Promise<unknown>; depth: number }>();

/** Refuse rather than queue forever when the server has stopped answering. */
const MAX_DEPTH = 12;

const keyOf = (t: RconTarget) => `${t.host}:${t.port}`;

function queueFor(key: string) {
  let queue = queues.get(key);
  if (!queue) {
    queue = { tail: Promise.resolve(), depth: 0 };
    queues.set(key, queue);
  }
  return queue;
}

/** Sends to a specific server. */
export async function rconExecOn(target: RconTarget, command: string): Promise<string> {
  const key = keyOf(target);
  const queue = queueFor(key);

  if (queue.depth >= MAX_DEPTH) {
    throw new Error(`RCON is busy on ${key} — too many commands are already queued.`);
  }

  queue.depth++;
  const run = queue.tail.then(
    () => connectAndRun(command, target),
    () => connectAndRun(command, target),
  );
  queue.tail = run.catch(() => {});

  try {
    return await run;
  } finally {
    queue.depth--;
  }
}

/** Sends to the server named by the environment — everything that predates the registry. */
export async function rconExec(command: string): Promise<string> {
  return rconExecOn(envTarget(), command);
}

/** How many commands are waiting, for the health endpoint and the tests. */
export const rconQueueDepth = (target?: RconTarget) =>
  queues.get(keyOf(target ?? { host: process.env.RCON_HOST ?? "", port: Number.parseInt(process.env.RCON_PORT ?? "27015", 10), password: "" }))?.depth ?? 0;
