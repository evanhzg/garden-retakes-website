// Translation, without a framework.
//
// The site had no translation layer at all — every string was written inline in
// English. This adds the smallest thing that can carry a second language:
//
//   • a dictionary per locale, keyed by a stable id;
//   • a `t()` that falls back to English, then to the key, so a missing
//     translation shows the English rather than blanking the interface;
//   • the chosen locale in a cookie, so it survives a reload and is readable on
//     the server for anything rendered there.
//
// French entries live in locales/fr.json and are filled in separately. Anything
// absent is not an error: it renders in English until it is translated, which
// means a half-finished translation is still shippable.

export const LOCALES = [
  { id: "en", label: "English", flag: "🇬🇧" },
  { id: "fr", label: "Français", flag: "🇫🇷" },
] as const;

export type Locale = (typeof LOCALES)[number]["id"];

export const DEFAULT_LOCALE: Locale = "en";

export const isLocale = (v: string): v is Locale => LOCALES.some((l) => l.id === v);

/** Cookie name, shared by the client switcher and the server reader. */
export const LOCALE_COOKIE = "garden_locale";

export type Dictionary = Record<string, string>;

/**
 * Look a key up, with `{name}` style interpolation.
 *
 * Falling back through English to the key itself is deliberate: an untranslated
 * string should read as English, and an unknown key should read as the key so
 * it is obvious in review rather than invisible.
 */
export function translate(
  dict: Dictionary,
  fallback: Dictionary,
  key: string,
  vars?: Record<string, string | number>
): string {
  const raw = dict[key] ?? fallback[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

/** Pick the best locale from a cookie value, then an Accept-Language header. */
export function resolveLocale(cookie?: string | null, acceptLanguage?: string | null): Locale {
  if (cookie && isLocale(cookie)) return cookie;
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().slice(0, 2).toLowerCase();
  return first && isLocale(first) ? first : DEFAULT_LOCALE;
}
