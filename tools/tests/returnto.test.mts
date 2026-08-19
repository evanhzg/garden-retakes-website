/**
 * The login callback's redirect target.
 *
 * `?returnTo=//evil.com` used to produce `https://retakes.fr//evil.com` — a
 * protocol-relative URL, so the browser leaves the site. An open redirect
 * through a real Steam login is a phishing link with your domain on it.
 */
import fs from "node:fs";
import path from "node:path";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

// Lifted from the route rather than re-implemented, so this tests the shipped
// function and not a copy of it that could drift.
const src = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../app/api/auth/steam/callback/route.ts"), "utf8");
const body = /function safeReturnTo\(raw: string \| null\): string \{[\s\S]*?\n\}/.exec(src)![0]
  .replace(": string | null", "").replace("): string {", ") {");
const safeReturnTo = new Function("return " + body)() as (r: string | null) => string;

for (const evil of [
  "//evil.com", "///evil.com", "//evil.com/path", "/\\evil.com", "/\\\\evil.com",
  "https://evil.com", "http://evil.com", "javascript:alert(1)", "evil.com", "",
]) {
  check(`refuses ${JSON.stringify(evil)}`, safeReturnTo(evil) === "/", safeReturnTo(evil));
}
check("refuses null", safeReturnTo(null) === "/");

for (const good of ["/", "/inventory", "/clips", "/players/76561198000000000", "/feed?clip=3"]) {
  check(`allows ${JSON.stringify(good)}`, safeReturnTo(good) === good, safeReturnTo(good));
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
