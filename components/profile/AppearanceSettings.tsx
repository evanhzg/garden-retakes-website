"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { LOCALES } from "@/lib/i18n";
import { useI18n } from "@/components/I18nProvider";

// Theme and language, in settings.
//
// The theme toggle used to live in the header as a single button that cycled
// through states — you could not see what the options were, only what you had.
// Both are preferences, both belong with the other preferences, and both are
// shown as a set so the current choice is visible next to the alternatives.

const THEMES = [
  { id: "light", label: "settings.theme.light", icon: "☀" },
  { id: "dark", label: "settings.theme.dark", icon: "☾" },
  { id: "system", label: "settings.theme.system", icon: "◐" },
];

const ACCENTS = [
  { id: "cyan", label: "settings.accent.cyan", color: "#06b6d4" },
  { id: "orange", label: "settings.accent.orange", color: "#ff4a28" },
  { id: "blue", label: "settings.accent.blue", color: "#3b82f6" },
  { id: "pink", label: "settings.accent.pink", color: "#ec4899" },
  { id: "beige", label: "settings.accent.beige", color: "#d97706" },
];

export default function AppearanceSettings({
  initialAccent = "orange",
  onAccentChange,
}: {
  initialAccent?: string;
  onAccentChange?: (color: string) => void;
}) {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [accent, setAccent] = useState(initialAccent);

  // next-themes only knows the resolved theme after mount; rendering before
  // that marks the wrong option as current for a frame.
  useEffect(() => setMounted(true), []);

  const handleAccentChange = (id: string) => {
    setAccent(id);
    if (onAccentChange) onAccentChange(id);
  };

  return (
    <section className="pro-settings-conn">
      <h3>{t("settings.appearance")}</h3>

      <div className="pref-row">
        <span className="pref-label">{t("settings.theme")}</span>
        <div className="pref-choices" role="group" aria-label={t("settings.theme")}>
          {THEMES.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`pref-choice ${mounted && theme === o.id ? "on" : ""}`}
              aria-pressed={mounted && theme === o.id}
              onClick={() => setTheme(o.id)}
            >
              <span aria-hidden>{o.icon}</span>
              {t(o.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="pref-row">
        <span className="pref-label">{t("settings.language")}</span>
        <div className="pref-choices" role="group" aria-label={t("settings.language")}>
          {LOCALES.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`pref-choice ${locale === l.id ? "on" : ""}`}
              aria-pressed={locale === l.id}
              onClick={() => setLocale(l.id)}
            >
              <img 
                src={`https://flagcdn.com/w40/${l.id === 'en' ? 'gb' : l.id}.png`} 
                alt=""
                style={{ width: "20px", height: "15px", borderRadius: "3px", marginRight: "6px", objectFit: "cover" }} 
                aria-hidden
              />
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <p className="pro-settings-hint">{t("settings.languageHint")}</p>

      <div className="pref-row">
        <span className="pref-label">{t("settings.accent_color")}</span>
        <div className="pref-choices" role="group" aria-label={t("settings.accent_color")}>
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`pref-choice ${accent === a.id ? "on" : ""}`}
              aria-pressed={accent === a.id}
              onClick={() => handleAccentChange(a.id)}
            >
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  backgroundColor: a.color,
                  marginRight: "4px",
                }}
              />
              {t(a.label)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
