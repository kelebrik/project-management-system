import { createJiraMetadata } from "./jiraMetadata";
import { createFormatters } from "./formatters";
import { createDomainLabels } from "./domainLabels";
import { createPluralTranslator } from "./plurals";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createTranslator } from "./translate";
import { DEFAULT_LOCALE, isLocale, LANGUAGE_STORAGE_KEY, readLocale, writeLocale } from "./locale";
import type { Locale, Translator } from "./types";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translator;
  tCount: ReturnType<typeof createPluralTranslator>;
  formatters: ReturnType<typeof createFormatters>;
  labels: ReturnType<typeof createDomainLabels>;
  jira: ReturnType<typeof createJiraMetadata>;
};
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, updateLocale] = useState<Locale>(() => {
    if (initialLocale) return initialLocale;
    try { return readLocale(window.localStorage); } catch { return DEFAULT_LOCALE; }
  });
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    updateLocale(next);
    try { writeLocale(window.localStorage, next); } catch { /* Storage may be blocked. */ }
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) {
        updateLocale(isLocale(event.newValue) ? event.newValue : DEFAULT_LOCALE);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    t: createTranslator(locale),
    tCount: createPluralTranslator(locale),
    formatters: createFormatters(locale),
    labels: createDomainLabels(locale),
    jira: createJiraMetadata(locale),
  }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}
