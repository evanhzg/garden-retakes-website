"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import "./live.css";

// Every match at once, for a stream.
//
// Built to be read at a glance from across a room rather than studied: big
// numbers, team names, and nothing that needs a second look. Six matches is the
// design target, and the grid holds its shape from one up to twelve.

type LiveMatch = {
  id: number;
  matchKey: string;
  tournament: string;
  state: string;
  bestOf: number;
  teamA: { name: string; tag: string | null } | null;
  teamB: { name: string; tag: string | null } | null;
  mapsA: number;
  mapsB: number;
  map: string | null;
  roundsA: number;
  roundsB: number;
  gotv: string | null;
};

export default function LiveWall({ slug }: { slug?: string }) {
  const { t } = useI18n();
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/tournament/live${slug ? `?t=${slug}` : ""}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));

        const data = await res.json();
        if (!alive) return;

        setMatches(data.matches ?? []);
        setStale(false);
      } catch {
        // Says so rather than freezing on a score that may have moved. A wall
        // showing an old number confidently is worse than one admitting it.
        if (alive) setStale(true);
      }
    };

    load();
    const timer = setInterval(load, 3000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [slug]);

  if (matches.length === 0) {
    return <p className="muted">{stale ? t("live.stale") : t("live.nothing")}</p>;
  }

  return (
    <>
      {stale && <p className="lw-stale">{t("live.stale")}</p>}

      <div className="lw">
        {matches.map((m) => (
          <article key={m.id} className={`lw-card ${m.state === "live" ? "live" : ""}`}>
            <header className="lw-head">
              <span className="lw-map">{m.map ?? "—"}</span>
              {m.bestOf > 1 && <span className="lw-bo">BO{m.bestOf}</span>}
              {m.state !== "live" && <span className="lw-warm">{t("live.warmup")}</span>}
            </header>

            <div className="lw-teams">
              <Team
                name={m.teamA?.name ?? "—"}
                rounds={m.roundsA}
                maps={m.mapsA}
                bestOf={m.bestOf}
                leading={m.roundsA > m.roundsB}
              />
              <Team
                name={m.teamB?.name ?? "—"}
                rounds={m.roundsB}
                maps={m.mapsB}
                bestOf={m.bestOf}
                leading={m.roundsB > m.roundsA}
              />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function Team({
  name,
  rounds,
  maps,
  bestOf,
  leading,
}: {
  name: string;
  rounds: number;
  maps: number;
  bestOf: number;
  leading: boolean;
}) {
  return (
    <div className={`lw-team ${leading ? "leading" : ""}`}>
      <span className="lw-name">{name}</span>
      {/* Maps won only when there are maps to win. On a BO1 it is always 0-0
          until the match ends, which is a number that means nothing. */}
      {bestOf > 1 && <span className="lw-maps">{maps}</span>}
      <span className="lw-rounds">{rounds}</span>
    </div>
  );
}
