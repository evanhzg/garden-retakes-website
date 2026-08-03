"use client";

import { useEffect, useState } from "react";
import { useI18n } from '@/components/I18nProvider';

type ProfileData = {
  steamId: string;
  steamName: string | null;
  steamAvatar: string | null;
  nameOverride: string | null;
  avatarUrl: string | null;
  bio: string | null;
  country: string | null;
};

type Status = { kind: "idle" | "saving" | "ok" | "error"; message?: string };

export default function ProfileEditor() {
  const { t } = useI18n();
  const [data, setData] = useState<ProfileData | null>(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d: ProfileData) => {
        setData(d);
        setName(d.nameOverride ?? "");
        setAvatarUrl(d.avatarUrl ?? "");
        setBio(d.bio ?? "");
        setCountry(d.country ?? "");
      })
      .catch(() => setStatus({ kind: "error", message: t('profile.error.load') }));
  }, [t]);

  const save = async (payload: Record<string, unknown>) => {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus({ kind: "error", message: json.error ?? t('profile.error.save') });
        return false;
      }
      setStatus({ kind: "ok", message: t('profile.success.saved') });
      return true;
    } catch {
      setStatus({ kind: "error", message: t('common.networkError') });
      return false;
    }
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await save({
      name: name.trim() === "" ? undefined : name,
      avatarUrl,
      bio,
      country,
    });
  };

  const onRevertName = async () => {
    if (await save({ revertName: true, avatarUrl, bio, country })) {
      setName("");
      setData((d) => (d ? { ...d, nameOverride: null } : d));
    }
  };

  if (!data) {
    return <p className="muted">{t('profile.loading')}</p>;
  }

  const previewAvatar = avatarUrl.trim() || data.steamAvatar || "";
  const shownName = name.trim() || data.steamName || data.steamId;

  return (
    <form className="profile-editor" onSubmit={onSave}>
      <div className="profile-preview">
        <div className="profile-preview-avatar">
          {previewAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewAvatar} alt="" />
          ) : (
            <span>{shownName.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div>
          <div className="profile-preview-name">{shownName}</div>
          <div className="hero-sub">{t('profile.steamIdLabel')} {data.steamId}</div>
          {country.trim() && <div className="muted">{country.trim().toUpperCase()}</div>}
        </div>
      </div>

      <label className="field">
        <span className="field-label">{t('profile.displayName.label')}</span>
        <input
          className="input"
          value={name}
          maxLength={32}
          placeholder={data.steamName ?? t('profile.displayName.placeholder')}
          onChange={(e) => setName(e.target.value)}
        />
        <span className="field-hint">
          {t('profile.displayName.hint')}
          {data.nameOverride && (
            <button type="button" className="linklike" onClick={onRevertName}>
              {t('profile.displayName.revert', { steamName: data.steamName ?? "Steam" })}
            </button>
          )}
        </span>
      </label>

      <label className="field">
        <span className="field-label">{t('profile.avatarUrl.label')}</span>
        <input
          className="input"
          value={avatarUrl}
          placeholder={t('profile.avatarUrl.placeholder')}
          onChange={(e) => setAvatarUrl(e.target.value)}
        />
        <span className="field-hint">{t('profile.avatarUrl.hint')}</span>
      </label>

      <label className="field">
        <span className="field-label">{t('profile.bio.label')}</span>
        <textarea
          className="input"
          value={bio}
          maxLength={280}
          rows={3}
          placeholder={t('profile.bio.placeholder')}
          onChange={(e) => setBio(e.target.value)}
        />
        <span className="field-hint">{bio.length}/280</span>
      </label>

      <label className="field">
        <span className="field-label">{t('profile.country.label')}</span>
        <input
          className="input"
          value={country}
          maxLength={2}
          placeholder="FR"
          onChange={(e) => setCountry(e.target.value.toUpperCase())}
          style={{ maxWidth: 120 }}
        />
        <span className="field-hint">{t('profile.country.hint')}</span>
      </label>

      <div className="form-actions">
        <button className="btn" type="submit" disabled={status.kind === "saving"}>
          {status.kind === "saving" ? t('common.saving') : t('profile.saveButton')}
        </button>
        {status.kind === "ok" && <span className="form-msg ok">✓ {status.message}</span>}
        {status.kind === "error" && <span className="form-msg error">⚠ {status.message}</span>}
      </div>
    </form>
  );
}
