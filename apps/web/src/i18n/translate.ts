import { translations, type Locale, type Translator } from "./types";
export function createTranslator(locale: Locale): Translator {
  return ((key: keyof typeof translations, params?: Record<string, string | number>) => {
    if (!Object.hasOwn(translations, key)) {
      if (import.meta.env?.DEV) console.warn(`Missing translation: ${key}`);
      return String(key);
    }
    const message = translations[key][locale];
    return message.replace(/\{([^{}]+)\}/g, (token, name: string) => params?.[name] == null ? token : String(params[name]));
  }) as Translator;
}
