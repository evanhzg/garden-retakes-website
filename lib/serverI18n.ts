import "server-only";
import { cookies, headers } from "next/headers";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import { LOCALE_COOKIE, resolveLocale, translate, type Dictionary, type Locale } from "@/lib/i18n";

// The same lookup, for server components.
//
// The client provider is a hook, and a server component cannot call one — so
// pages that render on the server need their own way in. It reads the same
// cookie and the same dictionaries, so the two can never disagree about what a
// key means.

const DICTS: Record<Locale, Dictionary> = { en: en as Dictionary, fr: fr as Dictionary };

export function serverLocale(): Locale {
  return resolveLocale(cookies().get(LOCALE_COOKIE)?.value, headers().get("accept-language"));
}

export function getT() {
  const locale = serverLocale();
  return (key: string, vars?: Record<string, string | number>) =>
    translate(DICTS[locale], DICTS.en, key, vars);
}
