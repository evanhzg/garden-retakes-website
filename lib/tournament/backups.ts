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
