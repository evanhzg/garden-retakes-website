"use client";

// Host-facing Make It Meme setup for the universal lobby: answer mode, timers,
// template packs, and a custom-meme importer. Everything is pushed to the
// server so the whole table sees the setup they're readying up for.

import React, { useState } from "react";
import { translator, MEME, type Lang } from "@/components/games/i18n";

export type MemeOptions = {
  rounds: number;
  captionSeconds: number;
  voteSeconds: number;
  mode: "caption" | "gif";
  packs: Record<string, boolean>;
};
export type CustomTemplate = { url: string; name?: string };

const PACKS: { key: string; label: string }[] = [
  { key: "classic", label: "packClassic" },
  { key: "cs2", label: "packCs2" },
  { key: "wholesome", label: "packWholesome" },
  { key: "chaos", label: "packChaos" },
  { key: "gif", label: "packGif" },
];

const isImageUrl = (u: string) => /^(https?:\/\/|data:image\/)/i.test(u.trim());

export default function MemeOptionsPanel({ options, customTemplates, isHost, lang, onChange }: {
  options: MemeOptions;
  customTemplates: CustomTemplate[];
  isHost: boolean;
  lang: Lang;
  onChange: (payload: { options?: Partial<MemeOptions>; customTemplates?: CustomTemplate[] }) => void;
}) {
  const t = translator(MEME, lang);
  const [importUrl, setImportUrl] = useState("");
  const [importName, setImportName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const packs = options.packs || {};
  const setOpt = (patch: Partial<MemeOptions>) => { if (isHost) onChange({ options: patch }); };
  const setPack = (key: string, on: boolean) => { if (isHost) onChange({ options: { packs: { ...packs, [key]: on } } as any }); };

  const addCustom = () => {
    const url = importUrl.trim();
    if (!isImageUrl(url)) { setErr(t("invalidUrl")); return; }
    setErr(null);
    onChange({ customTemplates: [...customTemplates, { url, name: importName.trim() || "Custom" }] });
    setImportUrl("");
    setImportName("");
  };
  const removeCustom = (i: number) => onChange({ customTemplates: customTemplates.filter((_, idx) => idx !== i) });

  const Stepper = ({ label, value, opts, unit, onPick }: {
    label: string; value: number; opts: number[]; unit?: (n: number) => string; onPick: (n: number) => void;
  }) => (
    <div className="uno-stepper">
      <span className="uno-stepper-label">{label}</span>
      <div className="uno-stepper-opts">
        {opts.map((o) => (
          <button key={o} type="button" className={value === o ? "on" : ""} disabled={!isHost} onClick={() => onPick(o)}>
            {unit ? unit(o) : o}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="uno-rules-panel">
      <div className="picker-header">
        <h3>{t("optionsTitle")}</h3>
        {!isHost && <span className="picker-hint">{t("hostOnly")}</span>}
      </div>

      {/* answer mode */}
      <div className="uno-rules-grid">
        {(["caption", "gif"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`uno-rule-card ${options.mode === m ? "on" : ""}`}
            disabled={!isHost}
            onClick={() => setOpt({ mode: m })}
          >
            <span className="uno-rule-top">
              <span className="uno-rule-name">{m === "caption" ? t("modeCaption") : t("modeGif")}</span>
              <span className={`uno-switch ${options.mode === m ? "on" : ""}`} aria-hidden />
            </span>
            <span className="uno-rule-desc">{m === "caption" ? t("modeCaptionD") : t("modeGifD")}</span>
          </button>
        ))}
      </div>

      {/* timers */}
      <div className="uno-steppers">
        <Stepper label={t("rounds")} value={options.rounds} opts={[3, 5, 7]} onPick={(n) => setOpt({ rounds: n })} />
        <Stepper label={t("captionTime")} value={options.captionSeconds} opts={[45, 60, 90]} unit={(n) => t("seconds", { n })} onPick={(n) => setOpt({ captionSeconds: n })} />
        <Stepper label={t("voteTime")} value={options.voteSeconds} opts={[20, 30, 45]} unit={(n) => t("seconds", { n })} onPick={(n) => setOpt({ voteSeconds: n })} />
      </div>

      {/* caption-mode: packs + custom imports */}
      {options.mode === "caption" && (
        <>
          <div className="picker-header sub"><h3>{t("templatePacks")}</h3></div>
          <div className="uno-extras-grid">
            {PACKS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`uno-extra-card ${packs[p.key] ? "on" : ""}`}
                disabled={!isHost}
                onClick={() => setPack(p.key, !packs[p.key])}
              >
                <span className="uno-extra-name">{t(p.label as any)}</span>
              </button>
            ))}
          </div>

          <div className="picker-header sub">
            <h3>{t("customMemes")}</h3>
            {customTemplates.length > 0 && <span className="picker-hint">{t("customCount", { n: customTemplates.length })}</span>}
          </div>
          <div className="meme-import-hint">{t("customHint")}</div>
          {isHost && (
            <div className="meme-import-row">
              <input
                className="meme-import-input url"
                value={importUrl}
                onChange={(e) => { setImportUrl(e.target.value); setErr(null); }}
                placeholder="https://…  /  data:image/…"
                onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
              />
              <input
                className="meme-import-input name"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Name"
                maxLength={40}
              />
              <button type="button" className="uno-preset-btn" onClick={addCustom} disabled={!importUrl.trim()}>
                {t("addMeme")}
              </button>
            </div>
          )}
          {err && <div className="meme-import-err">{err}</div>}
          {customTemplates.length > 0 && (
            <div className="meme-import-list">
              {customTemplates.map((c, i) => (
                <div key={i} className="meme-import-chip">
                  <img src={c.url} alt="" />
                  <span className="meme-import-name">{c.name || "Custom"}</span>
                  {isHost && (
                    <button type="button" className="meme-import-remove" onClick={() => removeCustom(i)} aria-label={t("remove")}>✕</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
