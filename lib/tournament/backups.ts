/**
 * Reading the plugin's backup listing.
 *
 * `css_backups` answers one line per restorable round, carrying the facts an
 * admin chooses on — the score, the sides and the money at that point. The
 * plugin reads those out of the engine's own save files; this turns its reply
 * into rows.
 *
 * A line, as the plugin writes it:
 *
 *   backup round=7 map=de_dust2 t="Greyhaven Bots" tscore=4 tcash=4000 tplayers=3 \
 *     ct="Coldwater Bots" ctscore=2 ctcash=16000 ctplayers=3
 *
 * Import-free and parsed rather than eval'd, because this text arrives over
 * RCON from a game server and a team name is whatever somebody typed into the
 * website — quotes, equals signs and all.
 */

export type BackupRow = {
  round: number;
  map: string;
  t: { team: string; score: number; cash: number; players: number };
  ct: { team: string; score: number; cash: number; players: number };
};

/**
 * Pulls `key=value` and `key="value with spaces"` out of one line.
 *
 * Written as a scan rather than one regex per field so a team name containing
 * `ct=` cannot make the parser find a second CT team. Quoted values are taken
 * whole and everything else runs to the next space.
 */
function fields(line: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;

  while (i < line.length) {
    while (i < line.length && line[i] === " ") i++;

    const eq = line.indexOf("=", i);
    if (eq < 0) break;

    const key = line.slice(i, eq);

    // A key cannot contain a space; if it does, this is not a field and the
    // scan has drifted into a value. Skip to the next space and try again.
    if (key.includes(" ") || key.length === 0) {
      const space = line.indexOf(" ", i);
      if (space < 0) break;
      i = space + 1;
      continue;
    }

    let value: string;
    if (line[eq + 1] === '"') {
      const close = line.indexOf('"', eq + 2);
      if (close < 0) break;
      value = line.slice(eq + 2, close);
      i = close + 1;
    } else {
      const space = line.indexOf(" ", eq + 1);
      value = space < 0 ? line.slice(eq + 1) : line.slice(eq + 1, space);
      i = space < 0 ? line.length : space + 1;
    }

    out.set(key, value);
  }

  return out;
}

const num = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export function parseBackups(reply: string): BackupRow[] {
  const rows: BackupRow[] = [];

  for (const raw of (reply || "").split("\n")) {
    const line = raw.trim();

    // The plugin prefixes its replies; the marker is what makes a backup line a
    // backup line rather than any other chatter on the same connection.
    const at = line.indexOf("backup round=");
    if (at < 0) continue;

    const f = fields(line.slice(at + "backup ".length));
    const round = num(f.get("round"));
    if (round <= 0 && !f.has("map")) continue;

    rows.push({
      round,
      map: f.get("map") ?? "",
      t: {
        team: f.get("t") ?? "",
        score: num(f.get("tscore")),
        cash: num(f.get("tcash")),
        players: num(f.get("tplayers")),
      },
      ct: {
        team: f.get("ct") ?? "",
        score: num(f.get("ctscore")),
        cash: num(f.get("ctcash")),
        players: num(f.get("ctplayers")),
      },
    });
  }

  // Newest first: an admin restoring after a crash almost always wants the last
  // good round, and making them scroll past round 1 to reach it is the wrong
  // way round.
  return rows.sort((a, b) => b.round - a.round);
}

/** One player, as the round detail holds them. */
export type RoundPlayer = {
  name: string;
  side: "t" | "ct";
  cash: number;
  /** Running totals to the END of this round, not the round's own. */
  kills: number;
  deaths: number;
  assists: number;
  /** What they took into the round. */
  items: string[];
};

export type RoundDetail = {
  round: number;
  map: string;
  t: { team: string; score: number };
  ct: { team: string; score: number };
  players: RoundPlayer[];
};

/**
 * Reads `css_roundinfo`, which answers one header line and one line per player.
 *
 * Same scanner as the listing above, for the same reason: a player can be
 * called anything, including things that look like the format.
 */
export function parseRoundDetail(reply: string): RoundDetail | null {
  let head: RoundDetail | null = null;

  for (const raw of (reply || "").split("\n")) {
    const line = raw.trim();

    const at = line.indexOf("round round=");
    if (at >= 0) {
      const f = fields(line.slice(at + "round ".length));
      head = {
        round: num(f.get("round")),
        map: f.get("map") ?? "",
        t: { team: f.get("t") ?? "", score: num(f.get("tscore")) },
        ct: { team: f.get("ct") ?? "", score: num(f.get("ctscore")) },
        players: [],
      };
      continue;
    }

    const pat = line.indexOf("rp round=");
    if (pat < 0 || !head) continue;

    const f = fields(line.slice(pat + "rp ".length));
    const items = (f.get("items") ?? "").split(",").filter(Boolean);

    head.players.push({
      name: f.get("name") ?? "",
      side: f.get("side") === "t" ? "t" : "ct",
      cash: num(f.get("cash")),
      kills: num(f.get("kills")),
      deaths: num(f.get("deaths")),
      assists: num(f.get("assists")),
      items,
    });
  }

  return head;
}

/**
 * What actually happened in a round, from the two backups either side of it.
 *
 * The files hold running totals, so the round itself is a subtraction. Written
 * here rather than in the component because it is arithmetic and because
 * getting the direction wrong shows up as every player having negative kills,
 * which is the kind of thing a test catches in a second and an eye does not.
 *
 * `before` is the backup taken AT the start of the round — its totals are what
 * everybody had going in.
 */
export function roundDelta(
  before: RoundDetail | null,
  after: RoundDetail,
): RoundPlayer[] {
  if (!before) return after.players;

  const was = new Map(before.players.map((p) => [p.name, p]));

  return after.players.map((p) => {
    const b = was.get(p.name);
    if (!b) return p;

    return {
      ...p,
      // Clamped at zero: a player who reconnected can have totals that went
      // backwards, and a scoreboard showing -2 kills is worse than one showing
      // none.
      kills: Math.max(0, p.kills - b.kills),
      deaths: Math.max(0, p.deaths - b.deaths),
      assists: Math.max(0, p.assists - b.assists),
    };
  });
}
