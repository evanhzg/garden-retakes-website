/**
 * Direct messages, on the wire.
 *
 * This exists because of how it failed. The POST answered with the Prisma row,
 * whose SteamID columns are BigInt, and `JSON.stringify` refuses those outright
 * — so the row was written and the request still returned 500. The sender saw
 * their message appear, vanish, and their text come back, while the message was
 * in the database the whole time.
 *
 * A route cannot be tested here without a database, so the mapper is its own
 * module and this tests that. The assertion that matters is the one a type
 * cannot make: that nothing in the payload is still a bigint by the time it
 * reaches JSON.
 */
import { toWireMessage, type WebMessageRow } from "@/lib/webMessage";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const row: WebMessageRow = {
  Id: 42,
  SenderSteamId: BigInt("76561198154541270"),
  RecipientSteamId: BigInt("76561198000000001"),
  Content: "gl hf",
  CreatedAtUtc: new Date("2026-08-30T19:00:00.000Z"),
};

const wire = toWireMessage(row);

check("the id survives", wire.id === 42);
check("the body survives", wire.content === "gl hf");
check("the timestamp is epoch millis", wire.ts === Date.parse("2026-08-30T19:00:00.000Z"));

// The bug itself.
check("the sender is a string", typeof wire.from === "string", typeof wire.from);
check("the recipient is a string", typeof wire.to === "string", typeof wire.to);
check("the sender is not rounded", wire.from === "76561198154541270", wire.from);

/** Nothing anywhere in the payload is a bigint, however nested. */
const hasBigInt = (value: unknown): boolean => {
  if (typeof value === "bigint") return true;
  if (value === null || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(hasBigInt);
};

check("no bigint anywhere in the payload", !hasBigInt(wire));

// The real proof: this is exactly what NextResponse.json does, and it threw.
let serialised = "";
try {
  serialised = JSON.stringify({ success: true, message: wire });
  check("it serialises at all", true);
} catch (err) {
  check("it serialises at all", false, String(err));
}
check("and round-trips", JSON.parse(serialised || "{}")?.message?.id === 42);

// A broadcast message has no recipient, and undefined must not become "null".
const broadcast = toWireMessage({ ...row, RecipientSteamId: null });
check("a message with no recipient has no recipient", broadcast.to === undefined, String(broadcast.to));
check("and still serialises", !hasBigInt(broadcast));

// The GET adds this flag; the POST does not, and must not invent it.
check("isAdmin is absent unless asked for", !("isAdmin" in wire));
check("isAdmin is carried when given", toWireMessage(row, true).isAdmin === true);

console.log(fails ? `\n${fails} FAILED` : "\nall good");
process.exit(fails ? 1 : 0);
