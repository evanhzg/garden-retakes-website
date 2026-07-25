"use client";

// Host-facing HASAMEME setup for the lobby: answer mode, timers, template packs
// and a custom-meme importer. Everything is pushed to the server so the whole
// table sees the setup they're readying up for.

import React, { useState } from "react";
import { translator, MEME, type Lang } from "@/components/games/i18n";
import { SetupTabs, SetupSection, Stepper, ChoiceRow, PackGrid, type Chip, type Tab } from "@/components/games/setup/SetupUI";

export type MemeOptions = {
  rounds: number;
  captionSeconds: number;
  voteSeconds: number;
  mode: "caption" | "gif";
  packs: Record<string, boolean>;
};
export type CustomTemplate = { url: string; name?: string };

const PACKS: { key: string; label: string; glyph: string }[] = [
  { key: "classic", label: "packClassic", glyph: "🗿" },
  { key: "cs2", label: "packCs2", glyph: "🔫" },
  { key: "wholesome", label: "packWholesome", glyph: "🥰" },
  { key: "chaos", label: "packChaos", glyph: "🌀" },
  { key: "gif", label: "packGif", glyph: "🎞" },
];

const isImageUrl = (u: string) => /^(https?:\/\/|data:image\/)/i.test(u.trim());

export function summarizeMeme(options: Partial<MemeOptions> = {}, customs: CustomTemplate[] = [], lang: Lang): Chip[] {
  const t = translator(MEME, lang);
  const chips: Chip[] = [
    { label: options.mode === "gif" ? `🎞 ${t("modeGif")}` : `✍ ${t("modeCaption")}`, tone: "on" },
    { label: `🔁 ${options.rounds ?? 5} ${t("rounds")}`, tone: "info" },
    { label: `⏱ ${t("seconds", { n: options.captionSeconds ?? 60 })} / ${t("seconds", { n: options.voteSeconds ?? 30 })}`, tone: "info" },
  ];
  if (options.mode !== "gif") {
    const on = PACKS.filter((p) => options.packs?.[p.key]);
    for (const p of on) chips.push({ label: t(p.label as any), tone: "on" });
    if (customs.length) chips.push({ label: `📎 ${t("customCount", { n: customs.length })}`, tone: "on" });
  }
  return chips;
}

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

  const tabs: Tab[] = [
    {
      id: "game",
      label: t("optionsTitle"),
      icon: "😂",
      node: (
        <>
          <ChoiceRow
            label={t("answerMode")}
            value={options.mode}
            disabled={!isHost}
            onPick={(m) => setOpt({ mode: m })}
            options={[
              { value: "caption", label: t("modeCaption"), desc: t("modeCaptionD"), glyph: "✍" },
              { value: "gif", label: t("modeGif"), desc: t("modeGifD"), glyph: "🎞" },
            ]}
          />
          <div className="setup-steppers">
            <Stepper label={t("rounds")} value={options.rounds} options={[3, 5, 7]} disabled={!isHost} onPick={(n) => setOpt({ rounds: n })} />
            <Stepper label={t("captionTime")} value={options.captionSeconds} options={[45, 60, 90]} unit={(n) => t("seconds", { n })} disabled={!isHost} onPick={(n) => setOpt({ captionSeconds: n })} />
            <Stepper label={t("voteTime")} value={options.voteSeconds} options={[20, 30, 45]} unit={(n) => t("seconds", { n })} disabled={!isHost} onPick={(n) => setOpt({ voteSeconds: n })} />
          </div>
        </>
      ),
    },
  ];

  // Templates only matter when players are captioning something.
  if (options.mode === "caption") {
    tabs.push({
      id: "templates",
      label: t("templatePacks"),
      icon: "🖼",
      badge: String(PACKS.filter((p) => packs[p.key]).length + customTemplates.length),
      node: (
        <>
          <PackGrid
            label={t("templatePacks")}
            packs={PACKS.map((p) => ({ key: p.key, label: t(p.label as any), glyph: p.glyph }))}
            values={packs}
            disabled={!isHost}
            onToggle={setPack}
          />

          <SetupSection
            title={t("customMemes")}
            hint={customTemplates.length ? t("customCount", { n: customTemplates.length }) : t("customHint")}
          >
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
                <button type="button" className="setup-preset" onClick={addCustom} disabled={!importUrl.trim()}>
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
          </SetupSection>
        </>
      ),
    });
  }

  return <SetupTabs tabs={tabs} />;
}
