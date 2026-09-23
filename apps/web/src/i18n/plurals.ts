import type { Locale } from "./types";

type PluralForms = Record<"one" | "few" | "many" | "other", string>;
export const pluralMessages = {
  "table.rows": {
    en: { one: "{count} row", few: "{count} rows", many: "{count} rows", other: "{count} rows" },
    ru: { one: "{count} строка", few: "{count} строки", many: "{count} строк", other: "{count} строки" },
  },
  "table.columns": {
    en: { one: "{count} column", few: "{count} columns", many: "{count} columns", other: "{count} columns" },
    ru: { one: "{count} столбец", few: "{count} столбца", many: "{count} столбцов", other: "{count} столбца" },
  },
  "time.days": {
    en: { one: "{count} day", few: "{count} days", many: "{count} days", other: "{count} days" },
    ru: { one: "{count} день", few: "{count} дня", many: "{count} дней", other: "{count} дня" },
  },
  "wbs.items": {
    en: { one: "{count} WBS item", few: "{count} WBS items", many: "{count} WBS items", other: "{count} WBS items" },
    ru: { one: "{count} элемент ИСР", few: "{count} элемента ИСР", many: "{count} элементов ИСР", other: "{count} элемента ИСР" },
  },
} as const satisfies Record<string, Record<Locale, PluralForms>>;
export type PluralKey = keyof typeof pluralMessages;
export function createPluralTranslator(locale: Locale) {
  const rules = new Intl.PluralRules(locale);
  return (key: PluralKey, count: number) => {
    const selected = rules.select(count);
    const category = selected === "one" || selected === "few" || selected === "many" ? selected : "other";
    return pluralMessages[key][locale][category].replace("{count}", String(count));
  };
}
