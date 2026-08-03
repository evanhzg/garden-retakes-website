"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from '@/components/I18nProvider';

// Editor for the game plugin's live config.
//
// The form is built from whatever the server's config file actually contains,
// so every setting the plugin has is here and a setting added to the C# later
// shows up without this file changing. Controls are chosen from the value's
// type: booleans get a switch, whole numbers a stepper, known string sets a
// select, everything else a text box.

type FieldKind = "bool" | "int" | "float" | "string" | "enum" | "list";

type FieldTone = "positive" | "negative" | "neutral";

type ConfigField = {
  path: string;
  label: string;
  kind: FieldKind;
  value: unknown;
  tone: FieldTone;
  options?: string[];
};

type Target = { id: string; label: string; hint: string };

type ConfigSection = {
  key: string;
  label: string;
  fields: ConfigField[];
  groups: ConfigSection[];
};

type Change = { path: string; before: unknown; after: unknown };

export default function PluginConfigEditor({ adminKey }: { adminKey?: string }) {
  const { t } = useI18n();
  const [sections, setSections] = useState<ConfigSection[] | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [target, setTarget] = useState<string>("plugin");
  const [path, setPath] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [active, setActive] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ applied: Change[]; detail: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  /** Edited values keyed by dotted path; only these are ever sent. */
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const url = (t: string) => {
    const q = new URLSearchParams({ target: t });
    if (adminKey) q.set("key", adminKey);
    return `/api/admin/plugin-config?${q}`;
  };
  const currentUrl = () => url(target);

  // The parameter used to be called `t`, which shadowed the translator inside
  // this function — so t("…") resolved to the target string and was not
  // callable.
  const load = async (which = target) => {
    setError(null);
    try {
      const res = await fetch(url(which), { cache: "no-store" });
      const json = await res.json();
      if (json.targets) setTargets(json.targets);
      if (!res.ok) {
        setSections(null);
        setError(json.error ?? t("admin.pluginConfig.error.loadConfig"));
        return;
      }
      setSections(json.sections);
      setPath(json.path);
      setCanWrite(Boolean(json.canWrite));
      setActive(json.sections[0]?.key ?? "");
      setDraft({});
    } catch {
      setError(t("admin.pluginConfig.error.network"));
    }
  };

  useEffect(() => {
    load(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const section = sections?.find((s) => s.key === active);

  // Original values, flattened, so the diff can be shown before saving.
  const originals = useMemo(() => {
    const map = new Map<string, ConfigField>();
    const walk = (s: ConfigSection) => {
      s.fields.forEach((f) => map.set(f.path, f));
      s.groups.forEach(walk);
    };
    sections?.forEach(walk);
    return map;
  }, [sections]);

  const pending = useMemo(
    () =>
      Object.entries(draft)
        .filter(([p, v]) => JSON.stringify(originals.get(p)?.value) !== JSON.stringify(v))
        .map(([p, v]) => ({ path: p, before: originals.get(p)?.value, after: v })),
    [draft, originals]
  );

  const set = (p: string, v: unknown) => setDraft((d) => ({ ...d, [p]: v }));
  const valueOf = (f: ConfigField) => (f.path in draft ? draft[f.path] : f.value);

  const save = async (apply: "auto" | "now" | "none") => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const changes = Object.fromEntries(pending.map((c) => [c.path, c.after]));
      const res = await fetch(currentUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes, apply }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? t("admin.pluginConfig.error.saveFailed"));
        return;
      }
      setResult({ applied: json.applied ?? [], detail: json.apply?.detail ?? json.message ?? t("admin.pluginConfig.saved") });
      setConfirming(false);
      await load();
    } catch {
      setError(t("admin.pluginConfig.error.networkWrite"));
    } finally {
      setBusy(false);
    }
  };

  const targetTabs = targets.length > 0 && (
    <div className="cfg-targets" role="tablist" aria-label={t("admin.pluginConfig.aria.configFile")}>
      {targets.map((t_target) => (
        <button
          key={t_target.id}
          role="tab"
          aria-selected={target === t_target.id}
          className={`cfg-target ${target === t_target.id ? "active" : ""}`}
          title={t_target.hint}
          onClick={() => setTarget(t_target.id)}
        >
          {t_target.label}
        </button>
      ))}
    </div>
  );

  if (error && !sections) {
    return (
      <div className="cfg">
        {targetTabs}
        <p className="skin-note skin-note-error" role="alert">
          <span>
            <strong>{t("admin.pluginConfig.status.unavailable")}</strong> {error}
          </span>
        </p>
      </div>
    );
  }

  if (!sections) {
    return (
      <div className="cfg">
        {targetTabs}
        <p className="muted">{t("admin.pluginConfig.status.readingConfig")}</p>
      </div>
    );
  }

  return (
    <div className="cfg">
      {targetTabs}
      <div className="cfg-head">
        <div>
          <span className="pro-section-note">{t("admin.pluginConfig.liveConfigNote")}</span>
          <code className="skin-path">{path}</code>
        </div>
        <div className="cfg-head-actions">
          <button className="btn btn-secondary" onClick={() => load()} disabled={busy}>{t("admin.pluginConfig.btn.reload")}</button>
          {canWrite && (
            <button
              className="btn btn-primary"
              disabled={busy || pending.length === 0}
              onClick={() => setConfirming(true)}
            >
              {pending.length === 0 ? t("admin.pluginConfig.btn.noChanges") : t("admin.pluginConfig.btn.reviewChanges", { count: pending.length })}
            </button>
          )}
        </div>
      </div>

      {!canWrite && (
        <p className="skin-note skin-note-warn">
          <span>
            <strong>{t("admin.pluginConfig.status.readOnly")}</strong> {t("admin.pluginConfig.readOnlyNote")}
          </span>
        </p>
      )}

      <div aria-live="assertive" role="alert">
        {error && (
          <p className="skin-note skin-note-error">
            <span><strong>{t("admin.pluginConfig.status.failed")}</strong> {error}</span>
          </p>
        )}
      </div>

      <div aria-live="polite">
        {result && (
          <p className="skin-note skin-note-ok">
            <span>
              <strong>{t("admin.pluginConfig.savedChanges", { count: result.applied.length })}</strong>{" "}
              {result.detail}
            </span>
          </p>
        )}
      </div>

      <div className="cfg-body">
        <nav className="cfg-nav" aria-label={t("admin.pluginConfig.aria.configSections")}>
          {sections.map((s) => {
            const dirty = pending.some((c) => c.path.startsWith(`${s.key}.`));
            return (
              <button
                key={s.key}
                className={`cfg-nav-item ${active === s.key ? "active" : ""}`}
                onClick={() => setActive(s.key)}
              >
                {s.label}
                {dirty && <span className="cfg-dot" aria-label={t("admin.pluginConfig.aria.unsavedChanges")} />}
              </button>
            );
          })}
        </nav>

        <div className="cfg-fields">
          {section && <SectionFields section={section} valueOf={valueOf} set={set} disabled={!canWrite} depth={0} />}
        </div>
      </div>

      {confirming && (
        <div className="pro-modal" role="dialog" aria-modal="true" aria-labelledby="cfg-confirm" onClick={() => setConfirming(false)}>
          <div className="pro-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 id="cfg-confirm">{t("admin.pluginConfig.applyChanges", { count: pending.length })}</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              {t("admin.pluginConfig.applyWarning")}
            </p>

            <ul className="cfg-diff">
              {pending.map((c) => (
                <li key={c.path}>
                  <code>{c.path}</code>
                  <span className="cfg-diff-before">{JSON.stringify(c.before)}</span>
                  <span aria-hidden>→</span>
                  <span className="cfg-diff-after">{JSON.stringify(c.after)}</span>
                </li>
              ))}
            </ul>

            <p className="skin-note skin-note-warn">
              <span>
                <strong>{t("admin.pluginConfig.effectNote.title")}</strong> {t("admin.pluginConfig.effectNote.desc1")}
                <code>/restart</code> {t("admin.pluginConfig.effectNote.desc2")}
              </span>
            </p>

            <div className="cfg-confirm-actions">
              <button className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={busy}>{t("admin.pluginConfig.btn.cancel")}</button>
              <button className="btn btn-secondary" onClick={() => save("none")} disabled={busy}>{t("admin.pluginConfig.btn.saveOnly")}</button>
              <button className="btn btn-secondary" onClick={() => save("now")} disabled={busy}>
                {t("admin.pluginConfig.btn.saveApplyNow")}
              </button>
              <button className="btn btn-primary" onClick={() => save("auto")} disabled={busy}>
                {busy ? t("admin.pluginConfig.btn.saving") : t("admin.pluginConfig.btn.saveApply")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionFields({
  section,
  valueOf,
  set,
  disabled,
  depth,
}: {
  section: ConfigSection;
  valueOf: (f: ConfigField) => unknown;
  set: (path: string, value: unknown) => void;
  disabled: boolean;
  depth: number;
}) {
  const { t } = useI18n();
  return (
    <>
      {depth > 0 && <h4 className="cfg-group-title">{section.label}</h4>}
      {section.fields.length > 0 && (
        <div className="cfg-grid">
          {section.fields.map((f) => (
            <Field key={f.path} field={f} value={valueOf(f)} set={set} disabled={disabled} />
          ))}
        </div>
      )}
      {section.groups.map((g) => (
        <SectionFields key={g.key} section={g} valueOf={valueOf} set={set} disabled={disabled} depth={depth + 1} />
      ))}
      {section.fields.length === 0 && section.groups.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>{t("admin.pluginConfig.emptySection")}</p>
      )}
    </>
  );
}

function Field({
  field,
  value,
  set,
  disabled,
}: {
  field: ConfigField;
  value: unknown;
  set: (path: string, value: unknown) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const id = `cfg-${field.path.replace(/\./g, "-")}`;
  const dirty = JSON.stringify(value) !== JSON.stringify(field.value);

  return (
    <div className={`cfg-field tone-${field.tone} ${dirty ? "dirty" : ""}`}>
      <label htmlFor={id}>
        {field.label}
        {dirty && <span className="cfg-dot" aria-label={t("admin.pluginConfig.aria.changed")} />}
      </label>

      {field.kind === "bool" ? (
        <label className="cfg-switch">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) => set(field.path, e.target.checked)}
          />
          <span>{value ? t("admin.pluginConfig.on") : t("admin.pluginConfig.off")}</span>
        </label>
      ) : field.kind === "enum" ? (
        <select
          id={id}
          className="input"
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => set(field.path, e.target.value)}
        >
          {field.options?.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : field.kind === "int" || field.kind === "float" ? (
        <input
          id={id}
          className="input"
          type="number"
          step={field.kind === "int" ? 1 : 0.01}
          value={Number(value ?? 0)}
          disabled={disabled}
          onChange={(e) => {
            const n = field.kind === "int" ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
            set(field.path, Number.isNaN(n) ? field.value : n);
          }}
        />
      ) : field.kind === "list" ? (
        <textarea
          id={id}
          className="input"
          rows={3}
          value={(Array.isArray(value) ? value : []).join("\n")}
          disabled={disabled}
          // One entry per line. Numeric lists stay numeric so the write-side
          // type check does not reject them.
          onChange={(e) => {
            const lines = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
            const wasNumeric = Array.isArray(field.value) && field.value.every((v) => typeof v === "number");
            set(field.path, wasNumeric ? lines.map(Number).filter((n) => !Number.isNaN(n)) : lines);
          }}
        />
      ) : (
        <input
          id={id}
          className="input"
          type="text"
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => set(field.path, e.target.value)}
        />
      )}

      <code className="cfg-path">{field.path}</code>
    </div>
  );
}
