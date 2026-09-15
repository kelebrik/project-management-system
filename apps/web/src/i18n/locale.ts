import type { Locale } from "./types";
export const LANGUAGE_STORAGE_KEY = "pms-language";
const configuredDefault = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_DEFAULT_LOCALE;
/** Build-time deployment default; an individual saved choice always wins. */
export const DEFAULT_LOCALE: Locale = isLocale(configuredDefault)
  ? configuredDefault
  : (typeof window !== "undefined" && window.location.hostname.endsWith("sberdevices.ru") ? "ru" : "en");
export const intlLocale = (locale: Locale) => locale === "ru" ? "ru-RU" : "en-GB";
export function isLocale(value: unknown): value is Locale { return value === "en" || value === "ru"; }
export function readLocale(storage?: Pick<Storage, "getItem">, fallback: Locale = DEFAULT_LOCALE): Locale {
  try {
    const value = storage?.getItem(LANGUAGE_STORAGE_KEY);
    return isLocale(value) ? value : fallback;
  } catch { return fallback; }
}
export function writeLocale(storage: Pick<Storage, "setItem"> | undefined, locale: Locale) {
  try { storage?.setItem(LANGUAGE_STORAGE_KEY, locale); } catch { /* Persistence is optional. */ }
}
