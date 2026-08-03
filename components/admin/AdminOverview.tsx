"use client";

import { useEffect, useState } from "react";

// The overview board.
//
// Every other tab answers a question you already had. This one is for the
// question you did not: is anything waiting for me? So the tiles that mean
// "someone is blocked until you act" are the ones that change colour, and the
// rest are context.

type Overview = {
  season: { id: number; name: string | null; players: number } | null;
  counts: {
    players: number;
    activeBans: number;
    pendingDemos: number;
    clips: number;
    unlistedClips: number;
    lineups: number;
    clipRequests: number;
    recentActions: number;
  };
  poll: { id: number; seasonId: number; closesAt: string; open: boolean } | null;
};

type Tile = {
  label: string;
  value: string | number;
  hint: string;
  /** Something is waiting on an admin. */
  attention?: boolean;
  go?: string;
};

export default function AdminOverview({
  adminKey,
  onGo,
}: {
  adminKey: string;
  onGo: (tab: string) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/overview${adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) return setError(j.error ?? "Could not load the overview.");
        setData(j);
      })
      .catch(() => setError("Could not reach the server."));
  }, [adminKey]);

  if (error) {
    return <p className="skin-note skin-note-error"><span>{error}</span></p>;
  }
  if (!data) return <p className="muted">Loading…</p>;

  const c = data.counts;
  const tiles: Tile[] = [
    { label: "Demos waiting", value: c.pendingDemos, hint: "Uploaded, not yet cut", attention: c.pendingDemos > 0, go: "demos" },
    { label: "Clip marks", value: c.clipRequests, hint: "/clip, waiting for the pipeline", attention: c.clipRequests > 0, go: "demos" },
    { label: "Unnamed clips", value: c.unlistedClips, hint: "Unlisted until their owner names them" },
    { label: "Active bans", value: c.activeBans, hint: "Currently in force", go: "players" },
    { label: "Players known", value: c.players.toLocaleString(), hint: "Profiles on record", go: "players" },
    { label: "Clips posted", value: c.clips, hint: "On the feed" },
    { label: "Lineups saved", value: c.lineups, hint: "On the utility page" },
    { label: "Admin actions", value: c.recentActions, hint: "In the last 24 hours", go: "log" },
  ];

  const pollLabel = data.poll
    ? data.poll.open
      ? `Open until ${new Date(data.poll.closesAt).toLocaleString()}`
      : `Closed ${new Date(data.poll.closesAt).toLocaleDateString()}`
    : "No vote has run yet";

  return (
    <div className="adm-overview">
      <div className="adm-cards">
        {tiles.map((t) => (
          <button
            key={t.label}
            className={`adm-card ${t.attention ? "attention" : ""} ${t.go ? "is-link" : ""}`}
            onClick={() => t.go && onGo(t.go)}
            disabled={!t.go}
          >
            <span className="adm-card-v num">{t.value}</span>
            <span className="adm-card-k">{t.label}</span>
            <span className="adm-card-hint">{t.hint}</span>
          </button>
        ))}
      </div>

      <div className="adm-strip">
        <div>
          <span className="adm-strip-k">Season</span>
          <span className="adm-strip-v">
            {data.season ? `${data.season.name ?? `Season ${data.season.id}`} · ${data.season.players} ranked players` : "None active"}
          </span>
        </div>
        <div>
          <span className="adm-strip-k">Season vote</span>
          <span className="adm-strip-v">{pollLabel}</span>
        </div>
      </div>
    </div>
  );
}
