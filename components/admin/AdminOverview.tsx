"use client";

import { useEffect, useState } from "react";
import { useI18n } from '@/components/I18nProvider';

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
  const { t } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/overview${adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) return setError(j.error ?? t("admin.overview.error_loading"));
        setData(j);
      })
      .catch(() => setError(t("admin.overview.error_server")));
  }, [adminKey, t]);

  if (error) {
    return <p className="skin-note skin-note-error"><span>{error}</span></p>;
  }
  if (!data) return <p className="muted">{t("admin.overview.loading")}</p>;

  const c = data.counts;
  const tiles: Tile[] = [
    { label: t("admin.overview.demos_waiting"), value: c.pendingDemos, hint: t("admin.overview.demos_waiting_hint"), attention: c.pendingDemos > 0, go: "demos" },
    { label: t("admin.overview.clip_marks"), value: c.clipRequests, hint: t("admin.overview.clip_marks_hint"), attention: c.clipRequests > 0, go: "demos" },
    { label: t("admin.overview.unnamed_clips"), value: c.unlistedClips, hint: t("admin.overview.unnamed_clips_hint") },
    { label: t("admin.overview.active_bans"), value: c.activeBans, hint: t("admin.overview.active_bans_hint"), go: "players" },
    { label: t("admin.overview.players_known"), value: c.players.toLocaleString(), hint: t("admin.overview.players_known_hint"), go: "players" },
    { label: t("admin.overview.clips_posted"), value: c.clips, hint: t("admin.overview.clips_posted_hint") },
    { label: t("admin.overview.lineups_saved"), value: c.lineups, hint: t("admin.overview.lineups_saved_hint") },
    { label: t("admin.overview.admin_actions"), value: c.recentActions, hint: t("admin.overview.admin_actions_hint"), go: "log" },
  ];

  const pollLabel = data.poll
    ? data.poll.open
      ? t("admin.overview.poll_open", { date: new Date(data.poll.closesAt).toLocaleString() })
      : t("admin.overview.poll_closed", { date: new Date(data.poll.closesAt).toLocaleDateString() })
    : t("admin.overview.poll_none");

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
          <span className="adm-strip-k">{t("admin.overview.season")}</span>
          <span className="adm-strip-v">
            {data.season ? t("admin.overview.season_info", { name: data.season.name ?? t("admin.overview.season_id", { id: data.season.id }), players: data.season.players }) : t("admin.overview.season_none")}
          </span>
        </div>
        <div>
          <span className="adm-strip-k">{t("admin.overview.season_vote")}</span>
          <span className="adm-strip-v">{pollLabel}</span>
        </div>
      </div>

      <div aria-live="polite">
        {note && <p className="skin-note skin-note-ok"><span>{note}</span></p>}
      </div>
    </div>
  );
}
