"use client";

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
        <h2>Upload a skin VPK</h2>

        {!serverConfigured && (
          <p className="skin-note skin-note-warn">
            <span>
              <strong>No game server configured.</strong> GAMESERVER_FTP_HOST is unset, so uploads are stored
              and hosted for download but not pushed to the server.
            </span>
          </p>
        )}

        {!canUpload ? (
          <p className="skin-note skin-note-warn">
            <span>
              <strong>Read-only.</strong> Uploading writes into the game server&rsquo;s content directory, so it
              needs the Admin role. You can see what is installed below.
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
              <label htmlFor="skin-label">Display name</label>
              <input
                id="skin-label"
                className="input"
                value={label}
                placeholder="AK-47 | Garden"
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
                  Clear
                </button>
              )}
              {remoteDir && (
                <span className="skin-drop-hint">
                  Target: <code>{remoteDir}/</code> on the game server
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
                <strong>Failed.</strong> {error}
              </span>
            </p>
          )}
        </div>

        <div aria-live="polite">
          {result && <UploadResult message={result.message} skin={result.skin} onCopy={copy} />}
        </div>
      </section>

      <section className="panel">
        <h2>Installed skins</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : skins.length === 0 ? (
          <div className="empty-hint">
            <p style={{ margin: 0 }}>Nothing uploaded yet.</p>
          </div>
        ) : (
          <ul className="skin-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {skins.map((s) => (
              <li key={s.file} className="skin-item">
                <span className="skin-vpk-placeholder" aria-hidden>
                  VPK
                </span>

                <div style={{ minWidth: 0 }}>
                  <div className="skin-item-name">{s.label}</div>
                  <div className="skin-item-meta">
                    <span>{s.file}</span>
                    <span>{fmtBytes(s.bytes)}</span>
                    <span>{fmtDate(s.uploadedAt)}</span>
                    <span>by {s.uploadedBy.name}</span>
                  </div>

                  <p style={{ margin: "var(--space-2) 0 0", fontSize: 13 }}>
                    {s.server?.deployedAt ? (
                      <span className="tag tag-accent">On the server — {s.server.path}</span>
                    ) : (
                      <span className="tag tag-neutral">
                        Not on the server{s.server?.error ? ` — ${s.server.error}` : ""}
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
                      Copy path
                    </button>
                  )}
                  <a className="btn btn-secondary" href={s.downloadUrl} download>
                    Download
                  </a>
                  {canUpload && (
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => remove(s)}>
                      Remove
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
        <dt>Format</dt>
        <dd>
          VPK v{a.version} · {a.entryCount} {a.entryCount === 1 ? "entry" : "entries"} · {fmtBytes(skin.bytes)}
        </dd>

        <dt>Root folders</dt>
        <dd>{a.roots.length ? a.roots.join(", ") : "—"}</dd>

        <dt>Materials</dt>
        <dd>
          {a.materials.length} · {a.textures.length} texture{a.textures.length === 1 ? "" : "s"} ·{" "}
          {a.models.length} model{a.models.length === 1 ? "" : "s"}
        </dd>

        {a.primaryMaterial && (
          <>
            <dt>Paint material</dt>
            <dd>
              <code className="skin-path">{a.primaryMaterial}</code>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 4 }}
                onClick={() => onCopy(a.primaryMaterial as string)}
              >
                Copy path
              </button>
            </dd>
          </>
        )}

        <dt>SHA-256</dt>
        <dd>
          <code className="skin-path">{skin.sha256}</code>
        </dd>
      </dl>

      {a.warnings.length > 0 && (
        <div style={{ marginTop: "var(--space-4)" }}>
          {a.warnings.map((w) => (
            <p key={w} className="skin-note skin-note-warn">
              <span>
                <strong>Check:</strong> {w}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
