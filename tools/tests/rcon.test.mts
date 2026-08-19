/**
 * The RCON client, against a fake Source server.
 *
 * The bug being pinned: Source splits any reply over ~4 kB into several
 * packets and does not say how many are coming. The old client armed a 150 ms
 * timer on the first packet and destroyed the socket, so a long `status` came
 * back silently truncated — a short string, not an error.
 */
import net from "node:net";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

function pkt(id: number, type: number, body: string) {
  const b = Buffer.from(body, "utf8");
  const buf = Buffer.alloc(14 + b.length);
  buf.writeInt32LE(10 + b.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  b.copy(buf, 12);
  return buf;
}

/** A Source-like server. `parts` is how many packets the reply is split into. */
function fakeServer(opts: { parts: number; badPassword?: boolean; slowMs?: number }) {
  return new Promise<{ port: number; close: () => void; seen: string[] }>((resolve) => {
    const seen: string[] = [];
    const server = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      // Serialized, because a real server writes its replies in order on one
      // TCP stream. Without this the sentinel overtakes the slow parts and the
      // test measures the fake rather than the client.
      let work: Promise<void> = Promise.resolve();
      sock.on("data", (c) => { work = work.then(() => handle(c)); });

      async function handle(c: Buffer) {
        buf = Buffer.concat([buf, c]);
        while (buf.length >= 4) {
          const size = buf.readInt32LE(0);
          if (buf.length < 4 + size) break;
          const id = buf.readInt32LE(4);
          const type = buf.readInt32LE(8);
          const body = buf.subarray(12, 4 + size - 2).toString("utf8");
          buf = buf.subarray(4 + size);

          if (type === 3) {                       // auth
            sock.write(pkt(opts.badPassword ? -1 : id, 2, ""));
          } else if (type === 2 && body !== "") { // the real command
            seen.push(body);
            for (let i = 0; i < opts.parts; i++) {
              if (opts.slowMs) await new Promise((r) => setTimeout(r, opts.slowMs));
              sock.write(pkt(2, 0, `part${i};`));
            }
          } else if (type === 2) {                // the sentinel
            sock.write(pkt(3, 0, ""));
          }
        }
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, close: () => server.close(), seen });
    });
  });
}

async function withServer<T>(opts: any, fn: (rcon: typeof import("@/lib/rcon")) => Promise<T>) {
  const s = await fakeServer(opts);
  process.env.RCON_HOST = "127.0.0.1";
  process.env.RCON_PORT = String(s.port);
  process.env.RCON_PASSWORD = "x";
  // Fresh module each time so the queue state does not leak between cases.
  const rcon = await import(`@/lib/rcon.ts?${Math.random()}`);
  try { return await fn(rcon as any); } finally { s.close(); }
}

// --- the truncation bug ------------------------------------------------------
await withServer({ parts: 1 }, async (rcon) => {
  check("a single-packet reply comes back whole", (await rcon.rconExec("status")) === "part0;");
});

await withServer({ parts: 5 }, async (rcon) => {
  const out = await rcon.rconExec("status");
  check("a five-packet reply is NOT truncated", out === "part0;part1;part2;part3;part4;", out);
});

// Packets arriving slowly: the old 150ms timer would have cut this off.
await withServer({ parts: 4, slowMs: 60 }, async (rcon) => {
  const out = await rcon.rconExec("status");
  check("a slow multi-packet reply survives", out === "part0;part1;part2;part3;", out);
});

// --- serialization -----------------------------------------------------------
await withServer({ parts: 2 }, async (rcon) => {
  const results = await Promise.all(["a", "b", "c", "d"].map((c) => rcon.rconExec(c)));
  check("concurrent callers each get a whole reply",
    results.every((r) => r === "part0;part1;"), JSON.stringify(results));
  check("the queue drains to empty", rcon.rconQueueDepth() === 0, String(rcon.rconQueueDepth()));
});

await withServer({ parts: 1 }, async (rcon) => {
  const order: string[] = [];
  await Promise.all(["1", "2", "3"].map((c) => rcon.rconExec(c).then(() => order.push(c))));
  check("order is FIFO", order.join("") === "123", order.join(""));
});

// --- failures ----------------------------------------------------------------
await withServer({ parts: 1, badPassword: true }, async (rcon) => {
  let msg = "";
  try { await rcon.rconExec("status"); } catch (e) { msg = String(e); }
  check("a bad password rejects", msg.includes("auth failed"), msg);
});

await withServer({ parts: 1, badPassword: true }, async (rcon) => {
  await rcon.rconExec("a").catch(() => {});
  let second = "";
  try { await rcon.rconExec("b"); } catch (e) { second = String(e); }
  check("a failure does not wedge the queue for the next caller", second.includes("auth failed"), second);
  check("  and the depth is back to zero", rcon.rconQueueDepth() === 0, String(rcon.rconQueueDepth()));
});

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
