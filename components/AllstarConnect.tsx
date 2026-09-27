"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

/**
 * Allstar.gg: which account to import clips from, and whether to.
 *
 * No heading or glyph of its own any more — it sits in the Clips section of
 * the settings body, which carries both. The field was a bare browser input
 * (`.text-input` is not a class the site defines), and every string was
 * English on the French site.
 */
export default function AllstarConnect() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [username, setUsername] = useState("");
  const [sync, setSync] = useState(true);
  const [initialSync, setInitialSync] = useState(true);
  const [initialUsername, setInitialUsername] = useState("");

  const load = () => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setUsername(data.allstarUsername || "");
        setInitialUsername(data.allstarUsername || "");
        setSync(data.allstarSync !== false);
        setInitialSync(data.allstarSync !== false);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allstarUsername: username, allstarSync: sync }),
      });
      if (res.ok) {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1800);
      }
      load();
    } finally {
      setBusy(false);
    }
  };

  const hasChanges = username !== initialUsername || sync !== initialSync;

  return (
    <div className="set-rows">
      <div className="set-row">
        <label className="set-row-label" htmlFor="allstar-user">
          <span>{t("allstar.username")}</span>
          <small>{t("allstar.usernameHint")}</small>
        </label>
        <input
          id="allstar-user"
          className="input set-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="s1mple"
          disabled={busy}
          spellCheck={false}
        />
      </div>

      <div className="set-row">
        <div className="set-row-label">
          <span>{t("allstar.autoImport")}</span>
          <small>{t("allstar.autoImportHint")}</small>
        </div>
        <label className="set-switch">
          <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} disabled={busy} />
          <span className="set-switch-ui" aria-hidden />
          <span className="sr-only">{t("allstar.autoImport")}</span>
        </label>
      </div>

      <div className="set-foot">
        <button className="btn btn-primary" onClick={save} disabled={busy || !hasChanges}>
          {busy ? <LoaderCircle size={15} className="set-spin" /> : saved ? <Check size={15} /> : null}
          {busy ? t("settings.saving") : saved ? t("settings.saved") : t("allstar.save")}
        </button>
      </div>
    </div>
  );
}
