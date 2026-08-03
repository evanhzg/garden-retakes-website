"use client";

import { useI18n as useI18nContext } from "@/components/I18nProvider";

// Import shim for the client-side translator.
//
// Two i18n conventions arrived in this repo at once. components/I18nProvider is
// the provider actually mounted in the layout and its hook returns the whole
// context ({ locale, setLocale, t }); other components import "@/locales/client"
// and expect the hook to return `t` itself. Rather than rewrite one set of
// imports and risk clobbering in-flight work, this makes the second path real
// and adapts the shape — one provider and one dictionary behind both.

export function useI18n() {
  return useI18nContext().t;
}

/** The full context, for callers that need the locale or the setter. */
export { useI18n as useI18nContext, I18nProvider } from "@/components/I18nProvider";
