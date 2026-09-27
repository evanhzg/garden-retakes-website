"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Monitor, Moon, Pause, Play, Sparkles, Sun, type LucideIcon } from "lucide-react";
import { LOCALES } from "@/lib/i18n";
import { useI18n } from "@/components/I18nProvider";
import { applyMotion, readMotion, type MotionPref } from "@/components/MotionToggle";

const MOTIONS: { id: MotionPref; label: string; icon: LucideIcon }[] = [
  { id: "system", label: "settings.motion.auto", icon: Sparkles },
  { id: "full", label: "settings.motion.on", icon: Play },
  { id: "off", label: "settings.motion.off", icon: Pause },
];

const THEMES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "light", label: "settings.theme.light", icon: Sun },
  { id: "dark", label: "settings.theme.dark", icon: Moon },
  { id: "system", label: "settings.theme.system", icon: Monitor },
];

const ACCENTS = [
  { id: "cyan", label: "settings.accent.cyan", color: "#06b6d4" },
  { id: "orange", label: "settings.accent.orange", color: "#ff4a28" },
  { id: "blue", label: "settings.accent.blue", color: "#3b82f6" },
  { id: "pink", label: "settings.accent.pink", color: "#ec4899" },
  { id: "beige", label: "settings.accent.beige", color: "#d97706" },
];

/**
 * Theme, language and accent — one labelled row each.
 *
 * No heading of its own: it sits inside the Appearance section of the settings
 * body, which carries the icon, title and explanation for the whole group.
 */
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

  const [motion, setMotion] = useState<MotionPref>("system");

  useEffect(() => {
    setMounted(true);
    setMotion(readMotion());
  }, []);

  // The same three steps MotionToggle takes, so the two can never disagree.
  const chooseMotion = (next: MotionPref) => {
    setMotion(next);
    applyMotion(next);
    try {
      localStorage.setItem("garden_motion", next);
    } catch {
      /* the choice still applies to this page */
    }
    window.dispatchEvent(new CustomEvent("garden:motion", { detail: next }));
  };

  const handleAccentChange = (id: string) => {
    setAccent(id);
    onAccentChange?.(id);
  };

  return (
    <div className="set-rows">
      <div className="set-row">
        <div className="set-row-label">
          <span>{t("settings.theme")}</span>
        </div>
        <div className="set-seg" role="group" aria-label={t("settings.theme")}>
          {THEMES.map((o) => (
            <button
              key={o.id}
              type="button"
              className={mounted && theme === o.id ? "on" : ""}
              aria-pressed={mounted && theme === o.id}
              onClick={() => setTheme(o.id)}
            >
              <o.icon size={14} aria-hidden />
              {t(o.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="set-row">
        <div className="set-row-label">
          <span>{t("settings.language")}</span>
          <small>{t("settings.languageHint")}</small>
        </div>
        <div className="set-seg" role="group" aria-label={t("settings.language")}>
          {LOCALES.map((l) => (
            <button
              key={l.id}
              type="button"
              className={locale === l.id ? "on" : ""}
              aria-pressed={locale === l.id}
              onClick={() => setLocale(l.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="set-flag" src={`https://flagcdn.com/w40/${l.id === "en" ? "gb" : l.id}.png`} alt="" aria-hidden />
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Motion lived in the identity form between Bio and Save, where it
          looked like part of your profile. It is a display preference. */}
      <div className="set-row">
        <div className="set-row-label">
          <span>{t("auto.motiontoggle.motion")}</span>
          <small>{t("settings.motionHint")}</small>
        </div>
        <div className="set-seg" role="group" aria-label={t("auto.motiontoggle.motion_preference")}>
          {MOTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={mounted && motion === m.id ? "on" : ""}
              aria-pressed={mounted && motion === m.id}
              onClick={() => chooseMotion(m.id)}
            >
              <m.icon size={14} aria-hidden />
              {t(m.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="set-row">
        <div className="set-row-label">
          <span>{t("settings.accent_color")}</span>
        </div>
        <div className="set-seg" role="group" aria-label={t("settings.accent_color")}>
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={accent === a.id ? "on" : ""}
              aria-pressed={accent === a.id}
              onClick={() => handleAccentChange(a.id)}
            >
              <span className="set-swatch" style={{ background: a.color }} aria-hidden />
              {t(a.label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
