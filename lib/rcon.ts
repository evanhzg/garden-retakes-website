import net from "node:net";

// Minimal Source RCON client (W2). Uses RCON_HOST / RCON_PORT / RCON_PASSWORD.
// One short-lived connection per command — fine for an admin panel.

const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;

function packet(id: number, type: number, body: string): Buffer {
  const bodyBuf = Buffer.from(body, "utf8");
  const buf = Buffer.alloc(14 + bodyBuf.length);
  buf.writeInt32LE(10 + bodyBuf.length, 0); // size
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  // two null terminators already zeroed by alloc
  return buf;
}

export async function rconExec(command: string): Promise<string> {
  const host = process.env.RCON_HOST;
  const port = Number.parseInt(process.env.RCON_PORT ?? "27015", 10);
  const password = process.env.RCON_PASSWORD;
  if (!host || !password) {
    throw new Error("RCON is not configured (RCON_HOST / RCON_PASSWORD).");
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 6000 });
    let buffer = Buffer.alloc(0);
    let authed = false;
    let response = "";
    const done = (err?: Error) => {
      socket.destroy();
      if (err) reject(err);
      else resolve(response.trim());
    };

    socket.on("timeout", () => done(new Error("RCON timeout")));
    socket.on("error", (e) => done(e));
    socket.on("connect", () => socket.write(packet(1, SERVERDATA_AUTH, password)));

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (buffer.length < 4 + size) break;
        const id = buffer.readInt32LE(4);
        const type = buffer.readInt32LE(8);
        const body = buffer.subarray(12, 4 + size - 2).toString("utf8");
        buffer = buffer.subarray(4 + size);

        if (!authed && type === SERVERDATA_AUTH_RESPONSE) {
          if (id === -1) return done(new Error("RCON auth failed (bad password)."));
          authed = true;
          socket.write(packet(2, SERVERDATA_EXECCOMMAND, command));
        } else if (authed && type === SERVERDATA_RESPONSE_VALUE) {
          response += body;
          // CS2 answers in a single packet for typical commands.
          setTimeout(() => done(), 150);
        }
      }
    });
  });
}
