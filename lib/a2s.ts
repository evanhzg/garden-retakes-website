/**
 * The Steam server query protocol, from the outside.
 *
 * This is the one thing RCON cannot tell you. RCON is a private back door the
 * panel opens on 127.0.0.1 with a password; A2S is the public front door every
 * client and the Steam master server knocks on, over UDP, on the game port.
 * A server can answer RCON perfectly while being completely invisible to
 * players — sv_lan, a hibernating process, a bind address on the wrong
 * interface — and the only way to see that difference is to ask the way a
 * client asks.
 *
 * Written here rather than taken as a dependency because it is four packet
 * shapes and the challenge dance, and a query library that goes unmaintained
 * for a protocol change is worse than sixty lines that are visible.
 */
import dgram from "node:dgram";

const HEADER_SIMPLE = 0xffffffff;
const A2S_INFO = 0x54;
const A2S_PLAYERS = 0x55;
const REPLY_INFO = 0x49;
const REPLY_PLAYERS = 0x44;
const REPLY_CHALLENGE = 0x41;

export class A2SError extends Error {}

export type A2SInfo = {
  name: string;
  map: string;
  folder: string;
  game: string;
  players: number;
  maxPlayers: number;
  bots: number;
  /** d = dedicated, l = listen, p = SourceTV relay. */
  serverType: string;
  environment: string;
  /** True when the server is password protected — visible to every client. */
  passworded: boolean;
  vac: boolean;
  version: string;
  /** From the extra-data flags, when the server sends them. */
  keywords?: string;
  steamId?: string;
  /** Round trip in milliseconds, which is also the latency a player sees. */
  pingMs: number;
};

export type A2SPlayer = { name: string; score: number; durationSeconds: number };

/** Walks a response body, which is a stream of little-endian values and C strings. */
class Reader {
  private offset = 0;
  constructor(private readonly buffer: Buffer) {}

  byte(): number {
    return this.buffer.readUInt8(this.offset++);
  }

  short(): number {
    const value = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  long(): number {
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  float(): number {
    const value = this.buffer.readFloatLE(this.offset);
    this.offset += 4;
    return value;
  }

  longlong(): string {
    const value = this.buffer.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value.toString();
  }

  string(): string {
    const end = this.buffer.indexOf(0, this.offset);
    // An unterminated string is a truncated packet; treating the remainder as
    // the value is better than throwing, because the fields before it are the
    // ones that matter and they have already been read.
    const stop = end === -1 ? this.buffer.length : end;
    const text = this.buffer.subarray(this.offset, stop).toString("utf8");
    this.offset = stop + 1;
    return text;
  }

  get remaining(): number {
    return this.buffer.length - this.offset;
  }
}

/**
 * One request/response over UDP, with the challenge retry built in.
 *
 * Since 2020 every Source server answers the first A2S_INFO with a four-byte
 * challenge instead of an answer, and expects the same query again with the
 * challenge appended. A client that does not do this sees silence and reads it
 * as "the server is down" — which is exactly the wrong conclusion, and the
 * reason this is not just a single sendto.
 */
function ask(
  host: string,
  port: number,
  kind: number,
  payload: Buffer,
  timeoutMs: number,
): Promise<{ body: Buffer; type: number; pingMs: number }> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const started = Date.now();
    let settled = false;
    let retried = false;

    const finish = (error?: Error, value?: { body: Buffer; type: number; pingMs: number }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve(value!);
    };

    const timer = setTimeout(
      () =>
        finish(
          new A2SError(
            `${host}:${port} did not answer a Steam query within ${timeoutMs}ms. To a player this is "server not responding".`,
          ),
        ),
      timeoutMs,
    );

    const send = (challenge?: Buffer) => {
      const packet = Buffer.concat([
        Buffer.from([0xff, 0xff, 0xff, 0xff, kind]),
        payload,
        challenge ?? Buffer.alloc(0),
      ]);
      socket.send(packet, port, host, (error) => {
        if (error) finish(new A2SError(`could not send to ${host}:${port} — ${error.message}`));
      });
    };

    socket.on("error", (error) => finish(new A2SError(error.message)));

    socket.on("message", (message) => {
      if (message.length < 5) return;

      // 0xFFFFFFFE is a split response. CS2 does not split A2S_INFO, and
      // reassembling something that never arrives would be untested code, so
      // it is refused by name rather than mis-parsed.
      const prefix = message.readUInt32LE(0);
      if (prefix === 0xfffffffe) {
        finish(
          new A2SError("the server split its reply across packets, which this reader does not reassemble."),
        );
        return;
      }
      // Anything that is not a single-packet reply is somebody else's UDP.
      if (prefix !== HEADER_SIMPLE) return;

      const type = message.readUInt8(4);
      const body = message.subarray(5);

      if (type === REPLY_CHALLENGE && !retried) {
        retried = true;
        send(body.subarray(0, 4));
        return;
      }

      finish(undefined, { body, type, pingMs: Date.now() - started });
    });

    send();
  });
}

/** What a player's client learns about this server before it connects. */
export async function info(host: string, port: number, timeoutMs = 4000): Promise<A2SInfo> {
  const { body, type, pingMs } = await ask(
    host,
    port,
    A2S_INFO,
    Buffer.from("Source Engine Query\0", "utf8"),
    timeoutMs,
  );

  if (type !== REPLY_INFO) {
    throw new A2SError(`expected an info reply, got type 0x${type.toString(16)}`);
  }

  const read = new Reader(body);
  read.byte(); // protocol
  const name = read.string();
  const map = read.string();
  const folder = read.string();
  const game = read.string();
  read.short(); // appid, truncated to 16 bits and therefore wrong for CS2
  const players = read.byte();
  const maxPlayers = read.byte();
  const bots = read.byte();
  const serverType = String.fromCharCode(read.byte());
  const environment = String.fromCharCode(read.byte());
  const passworded = read.byte() === 1;
  const vac = read.byte() === 1;
  const version = read.string();

  const result: A2SInfo = {
    name,
    map,
    folder,
    game,
    players,
    maxPlayers,
    bots,
    serverType,
    environment,
    passworded,
    vac,
    version,
    pingMs,
  };

  // The extra-data block is optional and its fields are flag-gated, so every
  // read is guarded — a server that sends a shorter block than its flags claim
  // should cost us the keywords, not the whole answer.
  if (read.remaining > 0) {
    try {
      const flags = read.byte();
      if (flags & 0x80) read.short(); // game port
      if (flags & 0x10) result.steamId = read.longlong();
      if (flags & 0x40) {
        read.short();
        read.string();
      }
      if (flags & 0x20) result.keywords = read.string();
      if (flags & 0x01) read.longlong(); // 64-bit appid
    } catch {
      // Keywords are a nicety; the fields above them are the answer.
    }
  }

  return result;
}

/** Who the server tells the world is on it. Bots included; SourceTV is not. */
export async function players(host: string, port: number, timeoutMs = 4000): Promise<A2SPlayer[]> {
  const { body, type } = await ask(
    host,
    port,
    A2S_PLAYERS,
    Buffer.from([0xff, 0xff, 0xff, 0xff]),
    timeoutMs,
  );

  if (type !== REPLY_PLAYERS) {
    throw new A2SError(`expected a player reply, got type 0x${type.toString(16)}`);
  }

  const read = new Reader(body);
  const count = read.byte();
  const list: A2SPlayer[] = [];

  for (let i = 0; i < count && read.remaining > 0; i += 1) {
    read.byte(); // index, always 0 from CS2
    list.push({ name: read.string(), score: read.long(), durationSeconds: read.float() });
  }

  return list;
}
