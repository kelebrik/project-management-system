/**
 * Puts a Highcharts language object back as it was: keys added since are
 * removed, the others take their old values (nested ones too). Highcharts'
 * own setOptions merges and could not remove the locale a page had set.
 */
export function restoreLanguage(lang: Record<string, unknown>, defaults: Record<string, unknown>) {
  for (const key of Object.keys(lang)) if (!(key in defaults)) delete lang[key];
  Object.assign(lang, structuredClone(defaults));
}
