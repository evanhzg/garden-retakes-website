/**
 * Pulling the plugin's JSON out of an RCON reply.
 *
 * The previous expression was /\{[^}]*\}/ — a character class that cannot
 * contain a `}`, so it matched only a flat object and would break silently the
 * first time css_gstatus nested one.
 */
import { extractJson } from "@/lib/liveSnapshot";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const flat = '{"map":"de_mirage","players":8}';
check("a flat object still works", extractJson(`noise ${flat} noise`) === flat);

const nested = '{"map":"de_mirage","score":{"t":7,"ct":9},"players":10}';
check("a NESTED object survives", extractJson(`x ${nested} y`) === nested, String(extractJson(`x ${nested} y`)));

const deep = '{"a":{"b":{"c":1}},"d":2}';
check("two levels deep", extractJson(deep) === deep, String(extractJson(deep)));

check("a brace inside a string does not end it",
  extractJson('{"map":"de_{weird}","players":1}') === '{"map":"de_{weird}","players":1}',
  String(extractJson('{"map":"de_{weird}","players":1}')));

check("an escaped quote does not confuse it",
  extractJson('{"name":"a\\"b}c","n":1}') === '{"name":"a\\"b}c","n":1}',
  String(extractJson('{"name":"a\\"b}c","n":1}')));

check("no object at all is null", extractJson("Unknown command") === null);
check("an unterminated object is null", extractJson('{"map":"de_dust2"') === null);
check("empty input is null", extractJson("") === null);

// Everything it extracts must actually parse.
for (const s of [flat, nested, deep]) {
  const got = extractJson(`prefix ${s} suffix`)!;
  let ok = true;
  try { JSON.parse(got); } catch { ok = false; }
  check(`  extracted output parses: ${s.slice(0, 28)}…`, ok, got);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
