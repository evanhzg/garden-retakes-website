"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Clip } from "@/components/feed/ClipCard";
import { useI18n } from '@/components/I18nProvider';
import { CLIP_TAGS } from "@/lib/feedShared";

// Edit or remove a clip.
//
// Open to whoever posted it, the player whose play it is, and moderators.
// Reassigning the SteamID64 is moderator-only, because it hands edit rights to
// whoever it is pointed at.

export default function ClipEditor({
  clip,
  isAdmin,
  onClose,
  onSaved,
  onDeleted,
}: {
  clip: Clip;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<Clip>) => void;
  onDeleted: () => void;
}) {
    const { t } = useI18n();

  const [title, setTitle] = useState(clip.title);
  const [description, setDescription] = useState(clip.description ?? "");
  const [steamId, setSteamId] = useState(clip.steamId);
  const [playerName, setPlayerName] = useState(clip.authorIsUser === false ? clip.author : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [publish, setPublish] = useState(true);
  const [tags, setTags] = useState<string[]>(clip.tags ?? []);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("A clip needs a title.");
    setBusy(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        playerName: playerName.trim(),
        tags,
      };
      // Naming a /clip mark is what publishes it — that is the whole point of
      // the unlisted state, so saving a title takes it out of one.
      if (clip.unlisted && publish) patch.unlisted = false;
      // Only send the owner when it actually changed — the API rejects it from
      // non-moderators, and sending it unchanged would fail for the author.
      if (isAdmin && steamId.trim() !== clip.steamId) patch.steamId = steamId.trim();

      const res = await fetch(`/api/feed/clips/${clip.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "Could not save.");

      onSaved({
        title: title.trim(),
        description: description.trim() || null,
        steamId: (patch.steamId as string) ?? clip.steamId,
        tags,
        ...(clip.unlisted && publish ? { unlisted: false } : {}),
      });
    } catch {
      setError("Network error — nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/feed/clips/${clip.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "Could not remove it.");
      onDeleted();
    } catch {
      setError("Network error — nothing was removed.");
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="pro-modal" role="dialog" aria-modal="true" aria-labelledby="clip-edit" onClick={() => !busy && onClose()}>
      <div className="pro-modal-card" style={{ width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="pro-modal-head">
          <h2 id="clip-edit">{clip.unlisted ? "Name your clip" : "Edit clip"}</h2>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>{t("auto.clipeditor.close")}</button>
        </div>

        <form className="clip-form" onSubmit={save}>
          <div className="field">
            <label htmlFor="edit-title">{t("auto.clipeditor.title")}</label>
            <input id="edit-title" className="input" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="edit-desc">{t("auto.clipeditor.description")}</label>
            <textarea id="edit-desc" className="input" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="edit-player">{t("auto.clipeditor.player_name")}</label>
            <input
              id="edit-player"
              className="input"
              value={playerName}
              maxLength={64}
              placeholder={t("auto.clipeditor.in_game_name")}
              onChange={(e) => setPlayerName(e.target.value)}
            />
            <p className="pro-settings-hint">
              {t("auto.clipeditor.shown_when_this_player_has_no")}
                                      </p>
          </div>

          {isAdmin && (
            <div className="field">
              <label htmlFor="edit-steamid">{t("auto.clipeditor.steamid64")} <span className="muted">{t("auto.clipeditor._moderator")}</span></label>
              <input
                id="edit-steamid"
                className="input num"
                value={steamId}
                maxLength={17}
                onChange={(e) => setSteamId(e.target.value)}
              />
              <p className="pro-settings-hint">{t("auto.clipeditor.whose_play_this_is_changing_it")}</p>
            </div>
          )}

          <div className="field">
            <span className="clip-tagpick-label">{t("auto.clipeditor.tags")}</span>
            <div className="clip-tagpick">
              {CLIP_TAGS.map((t) => {
                const on = tags.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`clip-tag pick ${on ? "on" : ""}`}
                    style={{ ["--tint" as string]: t.colour }}
                    aria-pressed={on}
                    onClick={() => setTags((cur) => (on ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {clip.unlisted && (
            <label className="util-toggle">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              {t("auto.clipeditor.put_it_on_the_feed_when_i_save")}
                                      </label>
          )}

          <div aria-live="assertive" role="alert">
            {error && <p className="skin-note skin-note-error"><span>{error}</span></p>}
          </div>

          <div className="clip-edit-actions">
            {confirmDelete ? (
              <>
                <span className="muted" style={{ fontSize: 13, marginRight: "auto" }}>{t("auto.clipeditor.remove_this_clip_for_good")}</span>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>{t("auto.clipeditor.cancel")}</button>
                <button type="button" className="btn btn-primary" onClick={remove} disabled={busy}>
                  {busy ? "Removing…" : "Yes, remove"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost clip-delete" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  {t("auto.clipeditor.remove_clip")}
                                                      </button>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{t("auto.clipeditor.cancel")}</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
