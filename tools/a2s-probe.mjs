// Does the GOTV port actually answer, and answer AS a GOTV relay?
//
// A2S_INFO is what a game client and the server browser both send, so a proper
// reply here is the same "yes" a streamer typing `connect ip:port` would get.
// Modern Source replies to the first query with a challenge (0x41) and expects
// it echoed back, which is why this is two round trips rather than one.
import dgram from "node:dgram";

const [host, port] = (process.argv[2] ?? "213.130.147.107:27070").split(":");

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]);
const PAYLOAD = Buffer.from("Source Engine Query\0", "ascii");
const query = (challenge) =>
  challenge ? Buffer.concat([HEADER, PAYLOAD, challenge]) : Buffer.concat([HEADER, PAYLOAD]);

const sock = dgram.createSocket("udp4");
const started = Date.now();
let asked = 0;

const done = (msg, code) => {
  try { sock.close(); } catch {}
  console.log(msg);
  process.exit(code);
};

/** Reads consecutive null-terminated strings out of the info reply. */
function strings(buf, from, count) {
  const out = [];
  let i = from;
  for (let n = 0; n < count; n++) {
    const end = buf.indexOf(0, i);
    if (end < 0) break;
    out.push(buf.subarray(i, end).toString("utf8"));
    i = end + 1;
  }
  return out;
}

sock.on("message", (buf) => {
  const type = buf[4];

  // 0x41 'A' — a challenge. Ask again with it appended.
  if (type === 0x41 && asked < 2) {
    asked++;
    sock.send(query(buf.subarray(5, 9)), Number(port), host);
    return;
  }

  if (type !== 0x49) {
    done(`unexpected reply type 0x${type.toString(16)} from ${host}:${port}`, 1);
  }

  // 0x49 'I': protocol byte, then name, map, folder, game.
  const [name, map, , game] = strings(buf, 6, 4);
  done(
    `REPLY ${host}:${port} in ${Date.now() - started}ms\n` +
      `  name = ${name}\n  map  = ${map}\n  game = ${game}`,
    0,
  );
});

sock.on("error", (e) => done(`ERROR ${e.message}`, 1));
setTimeout(() => done(`NO REPLY from ${host}:${port} after 6s`, 1), 6000);

sock.send(query(), Number(port), host);
