import Link from "next/link";
import AvatarImage from "@/components/AvatarImage";
import type { LadderRow } from "@/components/home/LadderRows";
import { getT } from "@/lib/serverI18n";

// The top three, and a way to the rest.
//
// The full ladder moved to /stats, where the rest of the numbers are. What a
// landing page needs from it is different: not a table to read, but proof that
// there is a real one, with names and faces on it.

export default function Podium({ rows, seasonName }: { rows: LadderRow[]; seasonName: string }) {
  const t = getT();
  if (rows.length === 0) return null;
  const top = rows.slice(0, 3);

  return (
    <section className="home-block">
      <header className="home-block-head">
        <span className="kicker">{seasonName}</span>
        <h2>{t("home.podium.kicker")}</h2>
        <Link href="/stats" className="btn btn-secondary">{t("home.podium.full")}</Link>
      </header>

      <ol className="podium">
        {top.map((r, i) => (
          <li key={r.steamId} className="podium-slot" data-rank={i + 1}>
            <span className="podium-rank num">{i + 1}</span>
            <AvatarImage steamId={r.steamId} src={r.avatar} alt={r.name} className="avatar avatar-lg" />
            <Link href={`/players/${r.steamId}`} className="podium-name">{r.name}</Link>
            <span className="podium-elo num">{r.elo}</span>
            <span className="podium-sub num">
              {r.kd !== null ? `${r.kd.toFixed(2)} K/D` : ""}
              {r.adr !== null ? ` · ${r.adr.toFixed(0)} ADR` : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
