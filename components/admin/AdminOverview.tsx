"use client";

import { useEffect, useState } from "react";
import { useI18n } from '@/components/I18nProvider';
import { freezeDate, freezeLeft, isFrozen } from "@/lib/seasonFreeze";

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
  viewerLevel = 0,
}: {
  adminKey: string;
  onGo: (tab: string) => void;
  /** Optional so the board still renders for any caller that does not know it;
      the season controls simply stay hidden rather than failing on click. */
  viewerLevel?: number;
}) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startNote, setStartNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/overview${adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) return setError(j.error ?? t("admin.overview.error_loading"));
        setData(j);
      })
      .catch(() => setError(t("admin.overview.error_server")));
  }, [adminKey, t]);

  /**
   * Close the vote now, which is what starting the next season early means: the
   * freeze is derived from the poll's window and nothing else, so shortening the
   * window is the whole action.
   *
   * Confirmed first, and the confirmation says what happens rather than asking
   * "are you sure?" — the season ending early is a thing the whole server sees,
   * and an admin should be able to read the consequence off the dialog instead
   * of remembering it.
   */
  const startSeason = async () => {
    if (!window.confirm(t("admin.season.start_confirm"))) return;
    setStarting(true);
    setStartNote(null);
    try {
      const res = await fetch(`/api/admin/season/start${adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setStartNote({ ok: false, text: json.error ?? t("admin.season.start_failed") });
        return;
      }
      setStartNote({ ok: true, text: t("admin.season.start_done") });
      // Reflected locally rather than refetched: the one fact that changed is
      // the one this component already holds, and a second round trip would
      // leave the button offering to do again what it has just done.
      setData((d) => (d && d.poll ? { ...d, poll: { ...d.poll, open: false } } : d));
    } catch {
      setStartNote({ ok: false, text: t("admin.season.start_failed") });
    } finally {
      setStarting(false);
    }
  };

  const openVote = async () => {
    if (!window.confirm(t("admin.season.open_vote_confirm"))) return;
    setOpening(true);
    setStartNote(null);
    try {
      const res = await fetch(`/api/admin/vote${adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setStartNote({ ok: false, text: json.error ?? t("admin.season.open_vote_failed") });
        return;
      }
      setStartNote({ ok: true, text: t("admin.season.open_vote_done") });
      // Immediately reflect the vote being open locally.
      setData((d) => (d && d.season ? { ...d, poll: { id: json.pollId, seasonId: d.season.id, closesAt: json.closesAt, open: true } } : d));
    } catch {
      setStartNote({ ok: false, text: t("admin.season.open_vote_failed") });
    } finally {
      setOpening(false);
    }
  };

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

  // An open poll is not just a fact about voting — it is the reason two thirds
  // of the retake control is unavailable, which is a thing an admin should learn
  // here rather than by clicking a dead button two tabs away.
  const frozen = isFrozen(data.poll);
  const freezeAt = data.poll ? freezeDate(data.poll.closesAt, locale) : "";
  const freezeIn = data.poll ? freezeLeft(data.poll.closesAt, t) : "";
  const canStartSeason = viewerLevel >= 3;

  return (
    <div className="adm-overview">
      {frozen && (
        <div className="adm-freeze" role="status">
          <strong>{t("admin.freeze.title")}</strong>
          <span>{t("admin.freeze.body")}</span>
          <span className="adm-freeze-when">{t("admin.freeze.when", { date: freezeAt, left: freezeIn })}</span>
        </div>
      )}

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

        {/* Sits with the season line it acts on, and only while there is
            something to close — a button that would do nothing is worse than no
            button, because it still invites the click. */}
        {canStartSeason && frozen && (
          <div className="adm-strip-actions adm-season-actions">
            <button
              className="btn btn-primary"
              onClick={startSeason}
              disabled={starting}
              title={t("admin.season.start_title")}
            >
              {starting ? t("admin.season.start_busy") : t("admin.season.start")}
            </button>
          </div>
        )}
        
        {canStartSeason && !frozen && data.season && (
          <div className="adm-strip-actions adm-season-actions">
            <button
              className="btn btn-danger"
              onClick={openVote}
              disabled={opening}
              title={t("admin.season.open_vote_title")}
            >
              {opening ? t("admin.season.open_vote_busy") : t("admin.season.open_vote")}
            </button>
          </div>
        )}
      </div>

      <div aria-live="polite">
        {note && <p className="skin-note skin-note-ok"><span>{note}</span></p>}
        {startNote && (
          <p className={`skin-note ${startNote.ok ? "skin-note-ok" : "skin-note-error"}`}>
            <span>{startNote.text}</span>
          </p>
        )}
      </div>
    </div>
  );
}
