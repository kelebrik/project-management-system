import { createTranslator } from "./translate";
import { createPluralTranslator } from "./plurals";
import { intlLocale } from "./locale";
import type { Locale } from "./types";

export function createFormatters(locale: Locale) {
  const tag = intlLocale(locale);
  const t = createTranslator(locale);
  const tCount = createPluralTranslator(locale);
  const format = (value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }) => {
    if (!value) return t("common.notSet");
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat(tag, options).format(parsed);
  };
  const dateOptions = { day: "2-digit", month: "2-digit", year: "numeric" } as const;
  return {
    formatDate: format,
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(tag, options).format(value),
    date: (value: string | Date | null | undefined) => format(value, dateOptions),
    dateTime: (value: string | null | undefined) => format(value, { ...dateOptions, hour: "2-digit", minute: "2-digit" }),
    shortDate: (value: string | null | undefined) => format(value, { ...dateOptions, year: "2-digit" }),
    monthLabel: (value: Date) => format(value, { month: "short", year: "numeric" }),
    MONTH_LABELS: Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(tag, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, month, 1)))).map((name) => name[0].toLocaleUpperCase(tag) + name.slice(1)),
    WEEKDAY_LABELS: Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + day)))),
    fileSize: (value: number | null | undefined) => {
      const bytes = value ?? 0;
      const unit = bytes < 1024 ? 0 : bytes < 1024 * 1024 ? 1 : 2;
      const amount = unit === 0 ? bytes : unit === 1 ? Math.round(bytes / 1024) : bytes / 1024 / 1024;
      return `${new Intl.NumberFormat(tag, { maximumFractionDigits: unit === 2 ? 1 : 0 }).format(amount)} ${(locale === "ru" ? ["Б", "КБ", "МБ"] : ["B", "KB", "MB"])[unit]}`;
    },
    signedDaysLabel: (value: number | null) => value === null ? t("common.notCalculated") : locale === "ru" ? `${value > 0 ? "+" : ""}${value} дн.` : `${value > 0 ? "+" : value < 0 ? "−" : ""}${tCount("time.days", Math.abs(value))}`,
  };
}
