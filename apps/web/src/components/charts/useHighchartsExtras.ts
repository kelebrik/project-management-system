import { useEffect, useState } from "react";
import { loadOrReload } from "../../app/staleBuild";

/**
 * Loads the extra Highcharts modules (dumbbells, bubbles, timeline, drill-down,
 * annotations, export menu) and sets the charts' language; true once they are
 * in, for the current language. The language is put back when the page is left or the language changes.
 * Modules that cannot be loaded are thrown at the page's error boundary.
 */
export function useHighchartsExtras(locale: "ru" | "en") {
  // Ready for one language: after a switch the charts wait until Highcharts speaks the new one.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  // The modules could not be loaded: the page says so (its error boundary) instead of waiting for ever.
  const [failed, setFailed] = useState<Error | null>(null);
  useEffect(() => {
    let alive = true;
    let loaded: typeof import("./highchartsExtras") | null = null;
    loadOrReload(() => import("./highchartsExtras")).then(
      (module) => {
        if (!alive) return;
        loaded = module;
        module.setLabLanguage(locale);
        setReadyFor(locale);
      },
      (error: unknown) => {
        if (alive) setFailed(error instanceof Error ? error : new Error(String(error)));
      },
    );
    // Put back at once, never later than the next language is set.
    return () => {
      alive = false;
      loaded?.resetLabLanguage();
    };
  }, [locale]);
  if (failed) throw failed;
  return readyFor === locale;
}
