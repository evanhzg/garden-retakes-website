import Link from "next/link";
import {
  HALF_LENGTH, KILL_REWARD, LOSS_LADDER, MAX_ROUNDS, MAX_MONEY, ROUND_THRESHOLDS,
  STARTING_MONEY, SURVIVAL_BONUS, DEFUSE_REWARD, EXPLODE_REWARD, WIN_REWARD,
  UTILITY_CAPS, GRENADE_CARRY_LIMIT, allocate, label, priceOf, roundKindFor, settle,
} from "@/lib/retakeEconomy";
import { ROLES, SNIPER_ONLY_WEAPONS } from "@/lib/competitive";
import "./economy.css";

export const dynamic = "force-static";

export const metadata = {
  title: "How the retakes economy works",
  description: "Money, round types, utility limits and what the allocator buys you — the actual numbers.",
  robots: { index: false, follow: false },
};

// The economy, explained with the numbers it actually runs on.
//
// Everything on this page is computed from lib/retakeEconomy at build time
// rather than written out — a tuning change moves the page with it, and the
// alternative is a document that slowly becomes fiction.

const MONEY = (n: number) => `$${n.toLocaleString("en-US")}`;

/** A worked example: eight rounds of a CT losing then recovering. */
function walkthrough() {
  const prefs = {
    role: "anchor" as const,
    primary: { full: "weapon_m4a1_silencer", half: "weapon_mp9" },
    secondary: "weapon_usp_silencer",
    utility: ["weapon_flashbang", "weapon_flashbang", "weapon_smokegrenade", "weapon_hegrenade"],
    kitFirst: true,
  };
  const rows = [];
  let money = STARTING_MONEY;
  let streak = 0;
  const results = [false, false, false, false, true, true, false, true];

  for (let r = 1; r <= results.length; r++) {
    const kind = roundKindFor(money, r);
    const l = allocate("CT", kind, money, prefs);
    const won = results[r - 1];
    rows.push({
      round: r, kind, won, had: money,
      bought: l.primary ? label(l.primary) : "pistol only",
      armour: l.armour, kit: l.kit, util: l.utility.length, left: l.left,
    });
    money = settle(l.left, won, streak, { kills: won ? [{ weaponClass: "rifle" }] : [] });
    streak = won ? 0 : streak + 1;
  }
  return rows;
}

export default function EconomyPage() {
  const rows = walkthrough();

  return (
    <div className="ec">
      <section className="ec-hero">
        <span className="ec-kicker">Competitive retakes</span>
        <h1>The economy</h1>
        <p className="muted">
          There is no buy menu. You cannot forget to buy, and you cannot get it wrong. What you
          <em> can</em> do is decide what matters to you — and the money decides how much of it you get.
        </p>
      </section>

      <section className="ec-panel ec-why">
        <h2>Why a retake mode has an economy at all</h2>
        <p>
          Ordinary retakes hand out a rifle every round. That is right for a warm-up and wrong the
          moment the result is worth a rating: with free rifles there is nothing to play for beyond
          the round in front of you, no reason to save, and no such thing as a bad buy.
        </p>
        <p>
          So this mode keeps money between rounds. It is <strong>hidden</strong> — the allocator
          spends it for you, along the preferences you set on your{" "}
          <Link href="/loadout">loadout page</Link>. What you notice is that some rounds you
          have an AK and a full bag, and some rounds you have an MP9 and one flash, and that this
          follows from how the last few rounds went.
        </p>
      </section>

      <section className="ec-panel">
        <h2>What a round pays</h2>
        <div className="ec-tiles">
          <Tile v={MONEY(STARTING_MONEY)} k="Starting money" note="Both pistol rounds" />
          <Tile v={MONEY(WIN_REWARD)} k="Round win" />
          <Tile v={MONEY(SURVIVAL_BONUS)} k="Survived" note="On top of the round" />
          <Tile v={MONEY(DEFUSE_REWARD)} k="Defused" note="CT" />
          <Tile v={MONEY(EXPLODE_REWARD)} k="Bomb exploded" note="T" />
          <Tile v={MONEY(MAX_MONEY)} k="Carry limit" />
        </div>

        <h3>Losing pays, and pays more the longer it goes on</h3>
        <p className="muted ec-note">
          Without a ladder, a team that drops two rounds never buys again and the match is decided by
          round three. This is the mechanism that lets a losing team come back with a full buy — which
          is what makes saving a decision rather than a formality.
        </p>
        <ol className="ec-ladder">
          {LOSS_LADDER.map((v, i) => (
            <li key={i}>
              <span className="ec-ladder-n">{i + 1}{i === LOSS_LADDER.length - 1 ? "+" : ""}</span>
              <span className="ec-ladder-bar" style={{ width: `${(v / LOSS_LADDER[LOSS_LADDER.length - 1]) * 100}%` }} />
              <span className="ec-ladder-v">{MONEY(v)}</span>
            </li>
          ))}
        </ol>

        <h3>Kills</h3>
        <div className="ec-chips">
          {Object.entries(KILL_REWARD).filter(([k]) => k !== "default").map(([k, v]) => (
            <span key={k} className="ec-chip"><b>{MONEY(v)}</b> {k}</span>
          ))}
        </div>
        <p className="muted ec-note">
          The scale is CS&rsquo;s own, so it reads as familiar: an SMG kill pays double a rifle kill,
          which is what makes a half buy a real choice rather than a punishment.
        </p>
      </section>

      <section className="ec-panel">
        <h2>What kind of round it is</h2>
        <p className="muted ec-note">
          Decided from your team&rsquo;s <em>average</em> money, not yours. A retake is won or lost
          together — one person with an AK in a team of MP9s is a lost round with an expensive corpse
          in it. The thresholds are derived from what a buy costs, not picked: a CT full buy is a rifle
          ({MONEY(priceOf("weapon_m4a1_silencer"))}) plus helmet ({MONEY(priceOf("item_assaultsuit"))})
          plus a kit ({MONEY(priceOf("item_defuser"))}) plus two flashes and a smoke.
        </p>
        <div className="ec-rounds">
          <RoundCard name="Pistol" range={`Round 1 and ${HALF_LENGTH + 1}`} body="Money is reset. Nobody has a rifle and nobody is meant to." />
          <RoundCard name="Eco" range={`Under ${MONEY(ROUND_THRESHOLDS.eco)}`} body="Saving, whether you meant to or not. Pistols and whatever utility fits." />
          <RoundCard name="Half buy" range={`${MONEY(ROUND_THRESHOLDS.eco)} – ${MONEY(ROUND_THRESHOLDS.full)}`} body="An SMG, armour, a grenade or two. SMG kills pay 600, so this can fund the next round." />
          <RoundCard name="Full buy" range={`${MONEY(ROUND_THRESHOLDS.full)}+`} body="Rifle, armour, kit and a usable bag of utility." />
        </div>
      </section>

      <section className="ec-panel">
        <h2>Utility is not symmetrical</h2>
        <p className="muted ec-note">
          A retake starts with the bomb already down. Terrorists are holding a site they have taken;
          Counter-Terrorists are coming to take it back. The side that has to break a hold carries the
          tools for it, and the side that has to stall carries the tools for that. Nobody carries more
          than {GRENADE_CARRY_LIMIT} grenades.
        </p>
        <div className="ec-sides">
          <SideCard side="T" title="Terrorists — holding" caps={UTILITY_CAPS.T} />
          <SideCard side="CT" title="Counter-Terrorists — retaking" caps={UTILITY_CAPS.CT} />
        </div>
        <p className="muted ec-note">
          <strong>Terrorists carry no HE.</strong> On a site the size of a retake, an HE thrown onto a
          defended plant is close to free damage on people who cannot leave it — every round opened the
          same way, so it is gone.
        </p>
      </section>

      <section className="ec-panel">
        <h2>The order your money is spent in</h2>
        <ol className="ec-order">
          <li><b>Primary</b><span>Your preference for this round type. If you cannot afford it, you drop a tier rather than to nothing.</span></li>
          <li><b>Sidearm</b><span>The default pistol is free and always there. A preferred one is a purchase.</span></li>
          <li><b>Armour</b><span>Helmet if it fits, vest if not. A player with four grenades and no vest loses the duel that would have let them throw one.</span></li>
          <li><b>Kit and utility</b><span>This is the one you control. See below.</span></li>
        </ol>

        <div className="ec-kit">
          <h3>Kit or utility — you choose</h3>
          <p className="muted ec-note">
            A defuse kit is ten seconds of the round. When money is tight you cannot have both, so your
            loadout page decides which goes first. Someone who would rather hold two flashes and let a
            team-mate carry the kit can say so.
          </p>
          <div className="ec-kit-compare">
            <KitCase title="Kit first" money={3600} kitFirst />
            <KitCase title="Utility first" money={3600} kitFirst={false} />
          </div>
        </div>
      </section>

      <section className="ec-panel">
        <h2>Roles, and who gets the AWP</h2>
        <p className="muted ec-note">
          Four roles, one per player, and no two players on a team may take the same one — two entries
          is not a plan. A retake is four seconds of contact between two or three people, so the seven
          roles a five-man match needs describe jobs that do not exist here.
        </p>
        <div className="ec-chips">
          {ROLES.map((r) => <span key={r.id} className="ec-chip">{r.id}</span>)}
        </div>
        <p className="muted ec-note">
          The <b>{SNIPER_ONLY_WEAPONS.map((w) => label(w)).join(" and the ")}</b> belong to the sniper.
          One AWP in a 3v3 retake decides the round on its own, so it is attached to a role somebody has
          to claim rather than to whoever set the preference first. Ask for one without the role and you
          get your fallback rifle instead.
        </p>
      </section>

      <section className="ec-panel">
        <h2>Eight rounds, worked through</h2>
        <p className="muted ec-note">
          One Counter-Terrorist who prefers the M4A1-S, two flashes, a smoke and an HE, and takes the
          kit before utility. Four losses, two wins, a loss and a win.
        </p>
        <div className="ec-table-scroll">
          <table className="ec-table">
            <thead>
              <tr><th>Round</th><th>Type</th><th>Had</th><th>Bought</th><th>Armour</th><th>Kit</th><th>Utility</th><th>Left</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.round} className={r.won ? "won" : "lost"}>
                  <td>{r.round}</td>
                  <td><span className={`ec-kind ${r.kind}`}>{r.kind}</span></td>
                  <td className="num">{MONEY(r.had)}</td>
                  <td>{r.bought}</td>
                  <td>{r.armour === "none" ? "—" : r.armour}</td>
                  <td>{r.kit ? "yes" : "—"}</td>
                  <td className="num">{r.util}</td>
                  <td className="num">{MONEY(r.left)}</td>
                  <td className="ec-wl">{r.won ? "W" : "L"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted ec-note">
          Read the middle of it: three straight losses put them on an eco, the loss ladder brings them
          back to a half buy by round four, and the two wins after that fund a full buy. That swing is
          the whole point.
        </p>
      </section>

      <section className="ec-panel ec-links">
        <Link className="btn btn-primary" href="/loadout">Set your loadout</Link>
        <Link className="btn btn-secondary" href="/lobby">Queue a match</Link>
      </section>

      <p className="ec-foot muted">
        Every number on this page is read from the same module the server runs, at build time. If the
        economy is tuned, this page changes with it.
      </p>
    </div>
  );
}

function Tile({ v, k, note }: { v: string; k: string; note?: string }) {
  return (
    <div className="ec-tile">
      <span className="ec-tile-v">{v}</span>
      <span className="ec-tile-k">{k}</span>
      {note && <span className="ec-tile-n">{note}</span>}
    </div>
  );
}

function RoundCard({ name, range, body }: { name: string; range: string; body: string }) {
  return (
    <div className="ec-round">
      <h4>{name}</h4>
      <span className="ec-round-range">{range}</span>
      <p>{body}</p>
    </div>
  );
}

function SideCard({ side, title, caps }: { side: "T" | "CT"; title: string; caps: Record<string, number> }) {
  return (
    <div className={`ec-side ${side.toLowerCase()}`}>
      <h4>{title}</h4>
      <ul>
        {Object.entries(caps).map(([item, cap]) => (
          <li key={item} className={cap === 0 ? "none" : ""}>
            <span className="ec-side-name">{label(item)}</span>
            <span className="ec-pips">
              {cap === 0
                ? <span className="ec-none">none</span>
                : Array.from({ length: cap }).map((_, i) => <span key={i} className="ec-pip" />)}
            </span>
            <span className="ec-side-cost">{cap === 0 ? "" : MONEY(priceOf(item))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KitCase({ title, money, kitFirst }: { title: string; money: number; kitFirst: boolean }) {
  const l = allocate("CT", "half", money, {
    role: "support",
    primary: { half: "weapon_mp9" },
    secondary: "weapon_usp_silencer",
    utility: ["weapon_flashbang", "weapon_flashbang", "weapon_smokegrenade", "weapon_hegrenade"],
    kitFirst,
  });
  return (
    <div className="ec-kitcase">
      <h4>{title}</h4>
      <p className="muted">{MONEY(money)} on a half buy</p>
      <ul>
        <li>{label(l.primary ?? "")} + {l.armour}</li>
        <li>{l.kit ? "Defuse kit" : "No defuse kit"}</li>
        <li>{l.utility.length ? l.utility.map(label).join(", ") : "No utility"}</li>
      </ul>
    </div>
  );
}
