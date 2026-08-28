/**
 * Parsing the plugin's backup listing.
 *
 * The interesting inputs are all hostile by accident: a team called `ct=1`, a
 * team with a quote in it, and the ordinary RCON noise that shares the reply
 * with the lines we want.
 */
import { parseBackups, parseRoundDetail, roundDelta } from "@/lib/tournament/backups";

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

// ------------------------------------------------------- one round in detail

const DETAIL = (round: number, kills: number, items = "weapon_ak47,weapon_hegrenade") =>
  [
    `T: round round=${round} map=de_dust2 t="Greyhaven Bots" tscore=4 ct="Coldwater Bots" ctscore=2`,
    `T: rp round=${round} side=t name="oasey" cash=3200 kills=${kills} deaths=3 assists=2 items="${items}"`,
    `T: rp round=${round} side=ct name="pike" cash=16000 kills=1 deaths=4 assists=0 items=""`,
  ].join("\n");

{
  const d = parseRoundDetail(DETAIL(7, 6));
  check("a round detail parses", d !== null);
  check("its header", d?.round === 7 && d?.t.score === 4 && d?.ct.score === 2);
  check("both players", d?.players.length === 2, String(d?.players.length));

  const oasey = d?.players.find((p) => p.name === "oasey");
  check("side", oasey?.side === "t", oasey?.side);
  check("figures", oasey?.kills === 6 && oasey?.deaths === 3 && oasey?.assists === 2);
  check("cash", oasey?.cash === 3200, String(oasey?.cash));
  check("loadout", oasey?.items.join("|") === "weapon_ak47|weapon_hegrenade", oasey?.items.join("|"));

  const pike = d?.players.find((p) => p.name === "pike");
  check("an empty loadout is no items, not one blank one", pike?.items.length === 0, String(pike?.items.length));
}

{
  check("a reply with no round header is nothing", parseRoundDetail("no backup for round 4") === null);
}

// --------------------------------------------------------- the round's own work

{
  // The files hold running totals; a round is the difference between two.
  const before = parseRoundDetail(DETAIL(6, 4))!;
  const after = parseRoundDetail(DETAIL(7, 6))!;

  const rows = roundDelta(before, after);
  const oasey = rows.find((p) => p.name === "oasey");

  check("kills in the round are the difference", oasey?.kills === 2, String(oasey?.kills));
  check("deaths too", oasey?.deaths === 0, String(oasey?.deaths));
  check("cash is a level, not a difference", oasey?.cash === 3200, String(oasey?.cash));
  check("and so is the loadout", oasey?.items.length === 2);
}

{
  // The first round has nothing before it, so the totals ARE the round.
  const after = parseRoundDetail(DETAIL(1, 3))!;
  const oasey = roundDelta(null, after).find((p) => p.name === "oasey");
  check("the first round is its own totals", oasey?.kills === 3, String(oasey?.kills));
}

{
  // A reconnect can take a player's totals backwards. Negative kills on a
  // scoreboard are worse than none.
  const before = parseRoundDetail(DETAIL(6, 9))!;
  const after = parseRoundDetail(DETAIL(7, 2))!;
  const oasey = roundDelta(before, after).find((p) => p.name === "oasey");
  check("totals that went backwards clamp at zero", oasey?.kills === 0, String(oasey?.kills));
}

{
  // Somebody who joined mid-round has no earlier row to subtract from.
  const before = parseRoundDetail(
    `T: round round=6 map=de_dust2 t="A" tscore=1 ct="B" ctscore=1`,
  )!;
  const after = parseRoundDetail(DETAIL(7, 5))!;
  const oasey = roundDelta(before, after).find((p) => p.name === "oasey");
  check("a player with no earlier row keeps their totals", oasey?.kills === 5, String(oasey?.kills));
}

console.log(fails ? `\n${fails} FAILED` : "\nall good");
process.exit(fails ? 1 : 0);
