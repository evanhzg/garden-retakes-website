// A recursive-descent parser for the subset of Lua the League wiki uses to
// store its data modules (`return { ["Ahri"] = { ["id"] = 103, ... } }`).
//
// The wiki is the only source that carries release dates, lore regions and
// per-champion positions, and it publishes them as Lua rather than JSON — so
// the seeder needs to read Lua. Only what those modules actually contain is
// supported: tables, string/number/boolean/nil literals, `["key"] =` and
// `[1] =` entries, positional values, and `--` comments.

/**
 * Fold a `+ - * / ( )` expression over number literals. Deliberately its own
 * recursive-descent evaluator: the input is wiki-authored, and this way there
 * is no path from wiki text to executed code.
 */
function evalArithmetic(expr) {
  let p = 0;
  const ws = () => { while (p < expr.length && /\s/.test(expr[p])) p++; };

  function primary() {
    ws();
    if (expr[p] === "(") {
      p++;
      const v = sum();
      ws();
      if (expr[p] === ")") p++;
      return v;
    }
    if (expr[p] === "-") { p++; return -primary(); }
    if (expr[p] === "+") { p++; return primary(); }
    const start = p;
    while (p < expr.length && /[0-9.]/.test(expr[p])) p++;
    // exponent, e.g. 1e3
    if (/[eE]/.test(expr[p]) && /[0-9+\-]/.test(expr[p + 1] || "")) {
      p += 2;
      while (p < expr.length && /[0-9]/.test(expr[p])) p++;
    }
    return Number(expr.slice(start, p));
  }

  function product() {
    let v = primary();
    for (;;) {
      ws();
      const op = expr[p];
      if (op !== "*" && op !== "/") return v;
      p++;
      const rhs = primary();
      v = op === "*" ? v * rhs : v / rhs;
    }
  }

  function sum() {
    let v = product();
    for (;;) {
      ws();
      const op = expr[p];
      if (op !== "+" && op !== "-") return v;
      p++;
      const rhs = product();
      v = op === "+" ? v + rhs : v - rhs;
    }
  }

  const out = sum();
  ws();
  return p === expr.length ? out : NaN;
}

function parseLuaTable(src) {
  let i = 0;

  const isSpace = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";

  function skip() {
    for (;;) {
      while (i < src.length && isSpace(src[i])) i++;
      // long comment --[[ ... ]]
      if (src.startsWith("--[[", i)) {
        const end = src.indexOf("]]", i + 4);
        i = end === -1 ? src.length : end + 2;
        continue;
      }
      if (src.startsWith("--", i)) {
        const end = src.indexOf("\n", i);
        i = end === -1 ? src.length : end + 1;
        continue;
      }
      return;
    }
  }

  function fail(msg) {
    const around = src.slice(Math.max(0, i - 60), i + 60).replace(/\n/g, "\\n");
    throw new Error(`${msg} at ${i}: …${around}…`);
  }

  function readString() {
    const quote = src[i++];
    let out = "";
    while (i < src.length) {
      const c = src[i++];
      if (c === "\\") {
        const n = src[i++];
        out += n === "n" ? "\n" : n === "t" ? "\t" : n;
        continue;
      }
      if (c === quote) return out;
      out += c;
    }
    fail("unterminated string");
  }

  /**
   * Numbers in these modules are sometimes small arithmetic expressions —
   * `["hp_lvl"] = 84+1000/17`. Read the whole expression and fold it with a
   * tiny evaluator rather than eval, so nothing from the wiki is ever executed.
   */
  function readNumber() {
    const start = i;
    while (i < src.length && /[0-9.eE+\-*/() \t]/.test(src[i])) {
      // Stop at a separator that ends the value rather than continuing the sum.
      if ((src[i] === " " || src[i] === "\t") && !/[0-9.eE+\-*/() \t]*[-+*/]/.test(peekRestOfLine())) break;
      i++;
    }
    const expr = src.slice(start, i).trim();
    if (!/^[0-9.eE+\-*/() \t]+$/.test(expr)) fail("bad number");
    const n = evalArithmetic(expr);
    if (Number.isNaN(n)) fail("bad number");
    return n;
  }

  function peekRestOfLine() {
    const nl = src.indexOf("\n", i);
    return src.slice(i, nl === -1 ? src.length : nl);
  }

  function readValue() {
    skip();
    const c = src[i];
    if (c === "{") return readTable();
    if (c === '"' || c === "'") return readString();
    if (src.startsWith("true", i)) { i += 4; return true; }
    if (src.startsWith("false", i)) { i += 5; return false; }
    if (src.startsWith("nil", i)) { i += 3; return null; }
    if (/[-+0-9.(]/.test(c)) return readNumber();
    // A bare identifier (a reference to another module) — read it as a string
    // so the seeder can decide what to do rather than blowing up.
    const start = i;
    while (i < src.length && /[A-Za-z0-9_.]/.test(src[i])) i++;
    if (i === start) fail("unexpected character");
    return src.slice(start, i);
  }

  function readTable() {
    if (src[i] !== "{") fail("expected {");
    i++;
    const obj = {};
    let arrayIndex = 1;
    let sawKey = false;

    for (;;) {
      skip();
      if (src[i] === "}") { i++; break; }
      if (src[i] === "," || src[i] === ";") { i++; continue; }

      let key = null;
      if (src[i] === "[") {
        // ["name"] = …  /  [1] = …
        i++;
        skip();
        key = src[i] === '"' || src[i] === "'" ? readString() : readNumber();
        skip();
        if (src[i] !== "]") fail("expected ]");
        i++;
        skip();
        if (src[i] !== "=") fail("expected = after key");
        i++;
        sawKey = true;
      } else {
        // bare `key = value`, or a positional value
        const start = i;
        while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
        const word = src.slice(start, i);
        const save = i;
        skip();
        if (word && src[i] === "=" && src[i + 1] !== "=") {
          i++;
          key = word;
          sawKey = true;
        } else {
          i = start === i ? i : start; // rewind: it's a positional value
          i = start;
          key = arrayIndex++;
          void save;
        }
      }

      obj[key] = readValue();
    }

    // A table with only 1..n integer keys is really an array.
    const keys = Object.keys(obj);
    const isArray = keys.length > 0 && keys.every((k, idx) => Number(k) === idx + 1);
    if (isArray && !sawKeyIsNamed(obj)) return keys.map((k) => obj[k]);
    return obj;
  }

  // `["client_positions"] = {"Middle"}` parses to {1:"Middle"} and must become
  // an array; a table with real string keys must not.
  function sawKeyIsNamed(obj) {
    return Object.keys(obj).some((k) => !/^\d+$/.test(k));
  }

  skip();
  if (src.startsWith("return", i)) i += 6;
  skip();
  return readTable();
}

module.exports = { parseLuaTable };
