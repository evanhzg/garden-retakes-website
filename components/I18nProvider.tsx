"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translate, type Dictionary, type Locale } from "@/lib/i18n";

// Locale for the client tree.
//
// Both dictionaries are bundled rather than fetched: together they are a few
// kilobytes, and a language that arrives a moment after the page does is a
// visible flash of the wrong one.

const DICTS: Record<Locale, Dictionary> = {
  en: en as Dictionary,
  fr: fr as Dictionary,
};

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (k) => translate(DICTS.en, DICTS.en, k),
});

export function I18nProvider({ initial, children }: { initial?: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial ?? DEFAULT_LOCALE);

  // The cookie is the source of truth so the server can read it too; state is
  // just this tab's copy of it.
  useEffect(() => {
    const m = /(?:^|;\s*)garden_locale=(\w+)/.exec(document.cookie);
    if (m && isLocale(m[1]) && m[1] !== locale) setLocaleState(m[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(DICTS[locale], DICTS.en, key, vars),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
