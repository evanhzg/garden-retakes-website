// The game plugin's live config, read and written over FTP.
//
// CounterStrikeSharp keeps a plugin's config at
//   configs/plugins/<plugin>/<plugin>.json
// relative to the csgo directory, which is where the FTP account is rooted —
// the same root deploy.mjs writes /addons/counterstrikesharp/plugins under.
//
// The form is generated from the *live file* rather than from a schema mirrored
// off the C# classes. That is deliberate: BaseConfigs has eight sections and
// grows, and a hand-kept mirror would silently drift the first time a setting
// was added to the plugin. Inferring the control from the value that is
// actually there means the editor covers every setting the server has, always.

import { Client } from "basic-ftp";
import { Readable, Writable } from "node:stream";

/**
 * The config files the editor can reach, all under the same FTP root.
 *
 * The plugin config is the one CounterStrikeSharp itself loads; rankings and
 * allocator keep their own files inside the plugin folder because they are
 * ports of separate plugins that owned their own config (see GardenSettings).
 */
export const CONFIG_TARGETS = {
  plugin: {
    label: "Plugin",
    hint: "Game modes, queue, teams, bomb — the config CounterStrikeSharp loads.",
    path: process.env.GAMESERVER_PLUGIN_CONFIG || "/addons/counterstrikesharp/configs/plugins/R5e-games/R5e-games.json",
  },
  rankings: {
    label: "Ranking & points",
    hint: "ELO, rating weights, clutch and competitive scoring — how points are given and taken.",
    path: process.env.GAMESERVER_RANKINGS_CONFIG || "/addons/counterstrikesharp/plugins/R5e-games/config/rankings.json",
  },
  allocator: {
    label: "Allocator",
    hint: "Weapon and utility allocation.",
    path: process.env.GAMESERVER_ALLOCATOR_CONFIG || "/addons/counterstrikesharp/plugins/R5e-games/config/config.json",
  },
} as const;

export type ConfigTarget = keyof typeof CONFIG_TARGETS;

export const isConfigTarget = (v: string): v is ConfigTarget => v in CONFIG_TARGETS;

/** Back-compat alias for the plugin config path. */
export const CONFIG_PATH = CONFIG_TARGETS.plugin.path;

export type FieldKind = "bool" | "int" | "float" | "string" | "enum" | "list";

/**
 * Whether a setting reads as a reward, a penalty or neither.
 *
 * Purely presentational, and inferred from the name — the ranking config is
 * dozens of near-identical numbers, and "which of these takes points away"
 * should not require reading each label twice.
 */
export type FieldTone = "positive" | "negative" | "neutral";

const POSITIVE = /(win|won|gain|reward|bonus|award|add|increase|up|success|survive|plant|defus|clutch|mvp|streak)/i;
const NEGATIVE = /(loss|lose|lost|penalt|deduct|punish|decrease|down|afk|leave|abandon|teamkill|tk|suicide|forfeit|ban|kick)/i;

function toneOf(path: string): FieldTone {
  const leaf = path.split(".").slice(-1)[0];
  if (NEGATIVE.test(leaf)) return "negative";
  if (POSITIVE.test(leaf)) return "positive";
  return "neutral";
}

export type ConfigField = {
  /** Dotted path into the config object, e.g. "GameSettings.ShouldForceEven". */
  path: string;
  label: string;
  kind: FieldKind;
  value: unknown;
  tone: FieldTone;
  /** Only for kind "enum". */
  options?: string[];
};

export type ConfigSection = {
  key: string;
  label: string;
  fields: ConfigField[];
  /** Nested groups, e.g. GardenSettings.Duels. */
  groups: ConfigSection[];
};

/**
 * String fields with a known, small set of valid values.
 *
 * Everything else is inferred, so this only exists to turn a free-text box into
 * a select where a typo would be a silent misconfiguration. Matched on the
 * dotted path's tail so it survives sections moving.
 */
const ENUMS: Record<string, string[]> = {
  "SmallServer.Mode": ["auto", "on", "off"],
  "Mode": ["auto", "on", "off"],
  "GameMode": ["retakes", "executes", "practice", "duels", "competitive"],
  "DefaultMode": ["retakes", "executes", "practice", "duels", "competitive"],
};

/** "ShouldForceEven" → "Should force even" — config keys are PascalCase. */
function humanise(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function enumFor(path: string): string[] | undefined {
  const tail = path.split(".").slice(-2).join(".");
  const leaf = path.split(".").slice(-1)[0];
  return ENUMS[tail] ?? ENUMS[leaf];
}

function kindOf(path: string, value: unknown): FieldKind | null {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "string") return enumFor(path) ? "enum" : "string";
  // Arrays of primitives are editable as a list; arrays of objects are not —
  // those are structures (spawn definitions, weapon tables) that belong in the
  // file, and pretending otherwise in a web form invites corruption.
  if (Array.isArray(value)) {
    return value.every((v) => typeof v === "string" || typeof v === "number") ? "list" : null;
  }
  return null;
}

/** Walk the parsed config into sections of typed fields. */
export function describe(config: Record<string, unknown>): ConfigSection[] {
  const build = (key: string, obj: Record<string, unknown>, prefix: string): ConfigSection => {
    const fields: ConfigField[] = [];
    const groups: ConfigSection[] = [];

    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        groups.push(build(k, v as Record<string, unknown>, path));
        continue;
      }
      const kind = kindOf(path, v);
      if (!kind) continue; // Unsupported shape — left to the file.
      fields.push({ path, label: humanise(k), kind, value: v, tone: toneOf(path), options: enumFor(path) });
    }

    return { key, label: humanise(key.replace(/Settings$/, "")), fields, groups };
  };

  return Object.entries(config)
    .filter(([, v]) => v !== null && typeof v === "object" && !Array.isArray(v))
    .map(([k, v]) => build(k, v as Record<string, unknown>, k));
}

// ─────────────────────────────────────────────────────────────── read / write

function ftpConfig() {
  return {
    host: process.env.GAMESERVER_FTP_HOST || "",
    port: Number(process.env.GAMESERVER_FTP_PORT || 21),
    user: process.env.GAMESERVER_FTP_USER || "",
    password: process.env.GAMESERVER_FTP_PASSWORD || "",
    secure: /^(1|true|yes)$/i.test(process.env.GAMESERVER_FTP_SECURE || ""),
  };
}

export const gameServerConfigured = () => Boolean(process.env.GAMESERVER_FTP_HOST);

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const cfg = ftpConfig();
  if (!cfg.host) throw new Error("No game server configured (GAMESERVER_FTP_HOST).");
  const client = new Client(30000);
  // Force IPv4 for the data channel. On a dual-stack host the client offers
  // EPSV and some servers answer it in a way basic-ftp then turns into a bare
  // command — which surfaces as "Command needs an argument" against a path
  // that is perfectly valid. Reads of all three configs succeed over IPv4.
  client.ftp.ipFamily = 4;
  try {
    await client.access(cfg);
    return await fn(client);
  } finally {
    client.close();
  }
}

/**
 * Where a config lives, and where it lives if that is wrong.
 *
 * The env override exists so a differently-laid-out server can be pointed at,
 * but a stale override is indistinguishable from a broken FTP server from the
 * outside: both come back as a failed read. So the shipped default is kept as
 * a second candidate and tried after it — and the error, if both fail, names
 * every path tried rather than just the last.
 */
function remoteCandidates(target: ConfigTarget): string[] {
  const t = CONFIG_TARGETS[target];
  const configured = t?.path?.trim();
  const fallback = DEFAULT_PATHS[target];
  const list = [configured, fallback].filter((p): p is string => Boolean(p));
  if (list.length === 0) {
    throw new Error(`No path configured for the ${target} config.`);
  }
  return Array.from(new Set(list));
}

/** Where each config sits in a stock install. */
const DEFAULT_PATHS: Record<ConfigTarget, string> = {
  plugin: "/addons/counterstrikesharp/configs/plugins/R5e-games/R5e-games.json",
  rankings: "/addons/counterstrikesharp/plugins/R5e-games/config/rankings.json",
  allocator: "/addons/counterstrikesharp/plugins/R5e-games/config/config.json",
};

/** The path a read actually succeeded on, so a write goes back to the same file. */
const resolved = new Map<ConfigTarget, string>();

/** Read the live config file as text. */
export async function readConfigText(target: ConfigTarget = "plugin"): Promise<string> {
  const candidates = remoteCandidates(target);
  return withClient(async (client) => {
    const failures: string[] = [];
    for (const remote of candidates) {
      const chunks: Buffer[] = [];
      const sink = new Writable({
        write(chunk, _enc, cb) {
          chunks.push(Buffer.from(chunk));
          cb();
        },
      });
      try {
        await client.downloadTo(sink, remote);
        resolved.set(target, remote);
        return Buffer.concat(chunks).toString("utf8");
      } catch (e) {
        failures.push(`${remote} — ${e instanceof Error ? e.message : String(e)}`);
      }

      // Some servers answer an absolute path in RETR with "501 command needs
      // an argument" and only accept a bare filename after a CWD. Same file,
      // different dialect, so it is worth a second attempt before giving up.
      try {
        const dir = remote.slice(0, remote.lastIndexOf("/")) || "/";
        const file = remote.slice(remote.lastIndexOf("/") + 1);
        await client.cd(dir);
        const chunks2: Buffer[] = [];
        const sink2 = new Writable({
          write(chunk, _enc, cb) {
            chunks2.push(Buffer.from(chunk));
            cb();
          },
        });
        await client.downloadTo(sink2, file);
        resolved.set(target, remote);
        return Buffer.concat(chunks2).toString("utf8");
      } catch (e) {
        failures.push(`cd+get — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    throw new Error(failures.join("; "));
  });
}

export async function writeConfigText(text: string, target: ConfigTarget = "plugin"): Promise<void> {
  // Whatever the last successful read used, so an edit cannot land in a
  // different file from the one that was shown.
  const remote = resolved.get(target) ?? remoteCandidates(target)[0];
  await withClient(async (client) => {
    await client.uploadFrom(Readable.from([text]), remote);
  });
}

// ─────────────────────────────────────────────────────────────────── editing

export const getPath = (obj: Record<string, unknown>, path: string): unknown =>
  path.split(".").reduce<unknown>((cur, k) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined), obj);

// ───────────────────────────────────────────────────────────────────── JSONC
//
// The live config is JSONC, not JSON — CounterStrikeSharp tolerates `//`
// comments and the file on the server opens with one, which is what made
// JSON.parse fail with `Unexpected token '/'`.
//
// Stripping the comments to parse would be easy; the problem is writing back.
// Serialising the parsed object would silently delete every comment and all the
// hand formatting in a file the server owner maintains by hand. So the parser
// also records the source span of every value, and a write splices the new
// value into the original text. Comments, key order and indentation survive
// untouched, and only the bytes that actually changed move.

export type Spans = Map<string, [number, number]>;

export function parseJsonc(text: string): { value: Record<string, unknown>; spans: Spans } {
  const spans: Spans = new Map();
  let i = 0;

  const skip = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i += 1;
      if (text[i] === "/" && text[i + 1] === "/") {
        while (i < text.length && text[i] !== "\n") i += 1;
        continue;
      }
      if (text[i] === "/" && text[i + 1] === "*") {
        i += 2;
        while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
        i += 2;
        continue;
      }
      return;
    }
  };

  const fail = (msg: string): never => {
    throw new Error(`${msg} at offset ${i}`);
  };

  function readString(): string {
    if (text[i] !== '"') fail("expected a string");
    const start = i;
    i += 1;
    while (i < text.length) {
      if (text[i] === "\\") {
        i += 2;
        continue;
      }
      if (text[i] === '"') {
        i += 1;
        return JSON.parse(text.slice(start, i)) as string;
      }
      i += 1;
    }
    return fail("unterminated string");
  }

  function readValue(path: string): unknown {
    skip();
    const start = i;
    let value: unknown;

    const c = text[i];
    if (c === "{") value = readObject(path);
    else if (c === "[") value = readArray(path);
    else if (c === '"') value = readString();
    else if (text.startsWith("true", i)) (i += 4), (value = true);
    else if (text.startsWith("false", i)) (i += 5), (value = false);
    else if (text.startsWith("null", i)) (i += 4), (value = null);
    else {
      const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
      if (!m) fail("unexpected token");
      i += m![0].length;
      value = Number(m![0]);
    }

    if (path) spans.set(path, [start, i]);
    return value;
  }

  function readObject(path: string): Record<string, unknown> {
    i += 1; // {
    const out: Record<string, unknown> = {};
    skip();
    if (text[i] === "}") {
      i += 1;
      return out;
    }
    for (;;) {
      skip();
      const key = readString();
      skip();
      if (text[i] !== ":") fail("expected ':'");
      i += 1;
      out[key] = readValue(path ? `${path}.${key}` : key);
      skip();
      if (text[i] === ",") {
        i += 1;
        skip();
        // Trailing comma before the closing brace.
        if (text[i] === "}") {
          i += 1;
          return out;
        }
        continue;
      }
      if (text[i] === "}") {
        i += 1;
        return out;
      }
      fail("expected ',' or '}'");
    }
  }

  function readArray(path: string): unknown[] {
    i += 1; // [
    const out: unknown[] = [];
    skip();
    if (text[i] === "]") {
      i += 1;
      return out;
    }
    for (;;) {
      // Array elements are not addressable as paths — the editor only ever
      // replaces a whole list.
      out.push(readValue(""));
      skip();
      if (text[i] === ",") {
        i += 1;
        skip();
        if (text[i] === "]") {
          i += 1;
          return out;
        }
        continue;
      }
      if (text[i] === "]") {
        i += 1;
        return out;
      }
      fail("expected ',' or ']'");
    }
  }

  skip();
  const value = readValue("") as Record<string, unknown>;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("config root is not an object");
  }
  return { value, spans };
}

/**
 * Leading whitespace of the line the value sits on, so a rewritten list lines
 * up with its siblings. Deliberately *not* the value's column — a list that
 * opens after `"Key": ` would otherwise be indented to the end of the key.
 */
function indentAt(text: string, offset: number): string {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
}

function render(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const inner = `${indent}  `;
    return `[\n${value.map((v) => `${inner}${JSON.stringify(v)}`).join(",\n")}\n${indent}]`;
  }
  return JSON.stringify(value);
}

/**
 * Splice new values into the original text.
 *
 * Applied back-to-front so each span's offsets are still valid when its turn
 * comes — patching forwards would shift everything after the first edit.
 */
export function patchJsonc(text: string, spans: Spans, changes: Record<string, unknown>): string {
  const edits = Object.entries(changes)
    .map(([path, value]) => ({ span: spans.get(path), value }))
    .filter((e): e is { span: [number, number]; value: unknown } => Boolean(e.span))
    .sort((a, b) => b.span[0] - a.span[0]);

  let out = text;
  for (const { span, value } of edits) {
    out = out.slice(0, span[0]) + render(value, indentAt(out, span[0])) + out.slice(span[1]);
  }
  return out;
}

/**
 * Apply one change, refusing anything that would change the *shape* of the
 * config: the path must already exist and the new value must be the same
 * primitive type. The website can therefore only ever retune settings the
 * plugin already has — it can never invent structure the C# will fail to parse
 * and it can never turn a number into a string.
 */
export function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): { ok: true; before: unknown } | { ok: false; error: string } {
  const keys = path.split(".");
  const leaf = keys.pop();
  if (!leaf) return { ok: false, error: `bad path "${path}"` };

  let parent: Record<string, unknown> = obj;
  for (const k of keys) {
    const next = parent[k];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return { ok: false, error: `unknown section "${path}"` };
    }
    parent = next as Record<string, unknown>;
  }

  if (!(leaf in parent)) return { ok: false, error: `unknown setting "${path}"` };

  const before = parent[leaf];
  const wasArray = Array.isArray(before);
  const isArray = Array.isArray(value);

  if (wasArray !== isArray || (!wasArray && typeof before !== typeof value)) {
    return { ok: false, error: `"${path}" is ${wasArray ? "a list" : typeof before}, refusing to change its type` };
  }
  if (typeof before === "number" && Number.isInteger(before) && !Number.isInteger(value as number)) {
    return { ok: false, error: `"${path}" is a whole number` };
  }

  parent[leaf] = value;
  return { ok: true, before };
}
