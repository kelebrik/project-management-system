import { useEffect, useState } from "react";

/**
 * Loads the extra Highcharts modules (dumbbells, bubbles, timeline, drill-down,
 * annotations, export menu) and sets the charts' language; true once they are
 * in, for the current language. The language is put back when the page is left or the language changes.
 */
export function useHighchartsExtras(locale: "ru" | "en") {
  // Ready for one language: after a switch the charts wait until Highcharts speaks the new one.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let loaded: typeof import("./highchartsExtras") | null = null;
    void import("./highchartsExtras").then((module) => {
      if (!alive) return;
      loaded = module;
      module.setLabLanguage(locale);
      setReadyFor(locale);
    });
    // Put back at once, never later than the next language is set.
    return () => {
      alive = false;
      loaded?.resetLabLanguage();
    };
  }, [locale]);
  return readyFor === locale;
}
