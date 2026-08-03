"use client";
import { useI18n } from '@/components/I18nProvider';

import { useCallback, useEffect, useRef, useState } from "react";

type Analysis = {
  version: number;
  entryCount: number;
  materials: string[];
  primaryMaterial: string | null;
  textures: string[];
  models: string[];
  roots: string[];
  hasAddonInfo: boolean;
  warnings: string[];
};

type Skin = {
  file: string;
  label: string;
  bytes: number;
  sha256: string;
  uploadedAt: string;
  uploadedBy: { steamId: string | null; name: string };
  analysis: Analysis;
  server: { path: string; deployedAt: string | null; error: string | null } | null;
  downloadUrl: string;
};

const fmtBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

export default function SkinManager({
  adminKey,
  canUpload,
}: {
  adminKey?: string;
  canUpload: boolean;
}) {
    const { t } = useI18n();

  const [skins, setSkins] = useState<Skin[]>([]);
  const [remoteDir, setRemoteDir] = useState("");
  const [serverConfigured, setServerConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  const [picked, setPicked] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; skin: Skin } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const withKey = useCallback(
    (path: string) => (adminKey ? `${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(adminKey)}` : path),
    [adminKey]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(withKey("/api/admin/skins"), { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setSkins(json.skins ?? []);
        setRemoteDir(json.remoteDir ?? "");
        setServerConfigured(Boolean(json.gameServerConfigured));
      } else {
        setError(json.error ?? "Could not load the installed skins.");
      }
    } catch {
      setError("Could not reach the server to load installed skins.");
    } finally {
      setLoading(false);
    }
  }, [withKey]);

  useEffect(() => {
    load();
  }, [load]);

  // Reject the obvious mistakes in the browser so a 200 MB wrong file never
  // makes the round trip; the route re-checks everything regardless.
  const choose = (file: File | null) => {
    setResult(null);
    if (!file) {
      setPicked(null);
      return;
    }
    if (!/\.vpk$/i.test(file.name)) {
      setError(`${file.name} is not a .vpk. Pack the addon first, then upload the packed archive.`);
      setPicked(null);
      return;
    }
    setError(null);
    setPicked(file);
    if (!label) setLabel(file.name.replace(/\.vpk$/i, "").replace(/[_-]+/g, " "));
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) {
      setError("Choose a .vpk to upload.");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", picked);
      body.append("label", label);
      const res = await fetch(withKey("/api/admin/skins"), { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");

      setResult({ message: json.message, skin: json.skin });
      setPicked(null);
      setLabel("");
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (skin: Skin) => {
    if (!window.confirm(`Remove ${skin.file} from the site and the game server?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withKey(`/api/admin/skins/${encodeURIComponent(skin.file)}`), {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed.");
      setResult(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  return (
    <>
      <section className="panel">
        <h2>{t("auto.skinmanager.upload_a_skin_vpk")}</h2>

        {!serverConfigured && (
          <p className="skin-note skin-note-warn">
            <span>
              <strong>{t("auto.skinmanager.no_game_server_configured")}</strong> {t("auto.skinmanager.gameserver_ftp_host_is_unset_s")}
                                      </span>
          </p>
        )}

        {!canUpload ? (
          <p className="skin-note skin-note-warn">
            <span>
              <strong>{t("auto.skinmanager.read_only")}</strong> {t("auto.skinmanager.uploading_writes_into_the_game")}
                                      </span>
          </p>
        ) : (
          <form onSubmit={upload}>
            <label className={`skin-drop${dragging ? " is-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                choose(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                name="file"
                accept=".vpk"
                onChange={(e) => choose(e.target.files?.[0] ?? null)}
              />
              <span className="skin-drop-title">
                {picked ? picked.name : "Drop a .vpk here, or choose a file"}
              </span>
              <span className="skin-drop-hint">
                {picked
                  ? `${fmtBytes(picked.size)} — ready to upload`
                  : "One packed addon archive. The contents are read and shown before anything is sent to the server."}
              </span>
            </label>

            <div className="field" style={{ marginTop: "var(--space-4)", maxWidth: 420 }}>
              <label htmlFor="skin-label">{t("auto.skinmanager.display_name")}</label>
              <input
                id="skin-label"
                className="input"
                value={label}
                placeholder={t("auto.skinmanager.ak_47_garden")}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="submit" disabled={busy || !picked}>
                {busy ? "Uploading…" : "Upload and deploy"}
              </button>
              {picked && !busy && (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    setPicked(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  {t("auto.skinmanager.clear")}
                                                      </button>
              )}
              {remoteDir && (
                <span className="skin-drop-hint">
                  {t("auto.skinmanager.target")} <code>{remoteDir}/</code> {t("auto.skinmanager.on_the_game_server")}
                                                      </span>
              )}
            </div>
          </form>
        )}

        {/* Outcome. Errors are assertive because they interrupt the task; the
            success readout is polite so it doesn't cut across the upload. */}
        <div aria-live="assertive" role="alert">
          {error && (
            <p className="skin-note skin-note-error" style={{ marginTop: "var(--space-4)" }}>
              <span>
                <strong>{t("auto.skinmanager.failed")}</strong> {error}
              </span>
            </p>
          )}
        </div>

        <div aria-live="polite">
          {result && <UploadResult message={result.message} skin={result.skin} onCopy={copy} />}
        </div>
      </section>

      <section className="panel">
        <h2>{t("auto.skinmanager.installed_skins")}</h2>
        {loading ? (
          <p className="muted">{t("auto.skinmanager.loading")}</p>
        ) : skins.length === 0 ? (
          <div className="empty-hint">
            <p style={{ margin: 0 }}>{t("auto.skinmanager.nothing_uploaded_yet")}</p>
          </div>
        ) : (
          <ul className="skin-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {skins.map((s) => (
              <li key={s.file} className="skin-item">
                <span className="skin-vpk-placeholder" aria-hidden>
                  {t("auto.skinmanager.vpk")}
                                        </span>

                <div style={{ minWidth: 0 }}>
                  <div className="skin-item-name">{s.label}</div>
                  <div className="skin-item-meta">
                    <span>{s.file}</span>
                    <span>{fmtBytes(s.bytes)}</span>
                    <span>{fmtDate(s.uploadedAt)}</span>
                    <span>{t("auto.skinmanager.by")} {s.uploadedBy.name}</span>
                  </div>

                  <p style={{ margin: "var(--space-2) 0 0", fontSize: 13 }}>
                    {s.server?.deployedAt ? (
                      <span className="tag tag-accent">{t("auto.skinmanager.on_the_server")} {s.server.path}</span>
                    ) : (
                      <span className="tag tag-neutral">
                        {t("auto.skinmanager.not_on_the_server")}{s.server?.error ? ` — ${s.server.error}` : ""}
                      </span>
                    )}
                  </p>

                  {s.analysis.primaryMaterial && (
                    <div style={{ marginTop: "var(--space-2)" }}>
                      <code className="skin-path">{s.analysis.primaryMaterial}</code>
                    </div>
                  )}
                </div>

                <div className="skin-item-actions">
                  {s.analysis.primaryMaterial && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => copy(s.analysis.primaryMaterial as string)}
                    >
                      {t("auto.skinmanager.copy_path")}
                                                    </button>
                  )}
                  <a className="btn btn-secondary" href={s.downloadUrl} download>
                    {t("auto.skinmanager.download")}
                                              </a>
                  {canUpload && (
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => remove(s)}>
                      {t("auto.skinmanager.remove")}
                                                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** What the server found inside the VPK, shown straight after an upload. */
function UploadResult({
  message,
  skin,
  onCopy,
}: {
  message: string;
  skin: Skin;
  onCopy: (text: string) => void;
}) {
    const { t } = useI18n();

  const a = skin.analysis;
  const deployed = Boolean(skin.server?.deployedAt);

  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <p className={`skin-note ${deployed ? "skin-note-ok" : "skin-note-warn"}`}>
        <span>
          <strong>{deployed ? "Uploaded." : "Stored, not deployed."}</strong> {message}
        </span>
      </p>

      <dl className="skin-kv" style={{ marginTop: "var(--space-4)" }}>
        <dt>{t("auto.skinmanager.format")}</dt>
        <dd>
          {t("auto.skinmanager.vpk_v")}{a.version} · {a.entryCount} {a.entryCount === 1 ? "entry" : "entries"} · {fmtBytes(skin.bytes)}
        </dd>

        <dt>{t("auto.skinmanager.root_folders")}</dt>
        <dd>{a.roots.length ? a.roots.join(", ") : "—"}</dd>

        <dt>{t("auto.skinmanager.materials")}</dt>
        <dd>
          {a.materials.length} · {a.textures.length} {t("auto.skinmanager.texture")}{a.textures.length === 1 ? "" : "s"} ·{" "}
          {a.models.length} {t("auto.skinmanager.model")}{a.models.length === 1 ? "" : "s"}
        </dd>

        {a.primaryMaterial && (
          <>
            <dt>{t("auto.skinmanager.paint_material")}</dt>
            <dd>
              <code className="skin-path">{a.primaryMaterial}</code>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 4 }}
                onClick={() => onCopy(a.primaryMaterial as string)}
              >
                {t("auto.skinmanager.copy_path")}
                                            </button>
            </dd>
          </>
        )}

        <dt>{t("auto.skinmanager.sha_256")}</dt>
        <dd>
          <code className="skin-path">{skin.sha256}</code>
        </dd>
      </dl>

      {a.warnings.length > 0 && (
        <div style={{ marginTop: "var(--space-4)" }}>
          {a.warnings.map((w) => (
            <p key={w} className="skin-note skin-note-warn">
              <span>
                <strong>{t("auto.skinmanager.check")}</strong> {w}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
