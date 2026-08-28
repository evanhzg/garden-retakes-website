/**
 * Parsing the plugin's backup listing.
 *
 * The interesting inputs are all hostile by accident: a team called `ct=1`, a
 * team with a quote in it, and the ordinary RCON noise that shares the reply
 * with the lines we want.
 */
import { parseBackups } from "@/lib/tournament/backups";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const LINE = (round: number, t = "Greyhaven Bots", ct = "Coldwater Bots") =>
  `backup round=${round} map=de_dust2 t="${t}" tscore=4 tcash=4000 tplayers=3 ` +
  `ct="${ct}" ctscore=2 ctcash=16000 ctplayers=3`;

{
  const rows = parseBackups(LINE(7));
  check("one backup becomes one row", rows.length === 1, String(rows.length));

  const r = rows[0];
  check("round", r?.round === 7, String(r?.round));
  check("map", r?.map === "de_dust2", r?.map);
  check("T team name survives its space", r?.t.team === "Greyhaven Bots", r?.t.team);
  check("CT team name", r?.ct.team === "Coldwater Bots", r?.ct.team);
  check("scores", r?.t.score === 4 && r?.ct.score === 2, `${r?.t.score}-${r?.ct.score}`);
  check("economy", r?.t.cash === 4000 && r?.ct.cash === 16000, `${r?.t.cash}/${r?.ct.cash}`);
  check("players", r?.t.players === 3 && r?.ct.players === 3);
}

{
  // The reply carries the plugin's prefix and whatever else is on the console.
  const reply = [
    "Executing console command",
    `T: ${LINE(1)}`,
    `T: ${LINE(2)}`,
    "some other line entirely",
  ].join("\n");

  const rows = parseBackups(reply);
  check("prefixed lines are found and noise is not", rows.length === 2, String(rows.length));
  check("newest first", rows[0]?.round === 2 && rows[1]?.round === 1);
}

{
  // A team name that looks like the rest of the format. A per-field regex finds
  // the wrong CT here; the scan does not, because the name is inside quotes and
  // is taken whole.
  //
  // The plugin strips quotes out of names before it writes this line — a quote
  // would close the field early and everything after it would be read as more
  // fields — so a name with an inner quote never reaches here. What CAN reach
  // here is everything else, including the format's own syntax.
  const rows = parseBackups(LINE(3, "ct=Fake ctscore=99"));
  check("a team name cannot forge another field", rows[0]?.ct.score === 2, String(rows[0]?.ct.score));
  check("...and is kept whole", rows[0]?.t.team === "ct=Fake ctscore=99", rows[0]?.t.team);
  check("...and the real CT team still lands", rows[0]?.ct.team === "Coldwater Bots", rows[0]?.ct.team);
}

{
  const rows = parseBackups("no backups yet");
  check("an empty listing is no rows", rows.length === 0, String(rows.length));
}

{
  const rows = parseBackups("");
  check("an empty reply is no rows", rows.length === 0);
}

{
  const rows = parseBackups("backup round=4 unreadable");
  check("an unreadable backup still lists its round", rows.length === 1 && rows[0].round === 4);
  check("...with empty facts rather than wrong ones", rows[0]?.t.team === "" && rows[0]?.t.score === 0);
}

console.log(fails ? `\n${fails} FAILED` : "\nall good");
process.exit(fails ? 1 : 0);
