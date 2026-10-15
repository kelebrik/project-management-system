/**
 * Dates as Intl writes them, without the "г." Russian adds after a year written
 * next to a month ("окт. 2026", "15 октября 2026", not "… 2026 г."): only the
 * mark right after the year goes, the rest of the text stays as it was.
 */
export function formatWithoutYearMark(formatter: Intl.DateTimeFormat, date: Date | number) {
  return formatter
    .formatToParts(date)
    .map((part, index, parts) => (part.type === "literal" && parts[index - 1]?.type === "year" ? part.value.replace(/^\s*г\./u, "") : part.value))
    .join("")
    .trim();
}

/** An Intl date formatter whose text has no "г." after the year. */
export function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const formatter = new Intl.DateTimeFormat(locale, options);
  return { format: (date: Date | number) => formatWithoutYearMark(formatter, date) };
}
