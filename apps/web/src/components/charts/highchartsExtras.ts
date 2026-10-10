import Highcharts from "highcharts";
import { restoreLanguage } from "../../app/charts/restoreLanguage";
import "highcharts/highcharts-more";
import "highcharts/modules/dumbbell";
import "highcharts/modules/timeline";
import "highcharts/modules/xrange";
import "highcharts/modules/drilldown";
import "highcharts/modules/heatmap";
import "highcharts/modules/annotations";
import "highcharts/modules/exporting";
import "highcharts/modules/offline-exporting";
import "highcharts/modules/export-data";
import "highcharts/modules/accessibility";

/**
 * The extra Highcharts modules the schedule lab shows off: dumbbells, Pareto,
 * heatmaps (the Jira process),
 * a timeline of events, drill-down, annotations and the export menu. Loaded
 * only with the lab. Exporting stays off on every other chart, and when on it
 * happens in the browser only: nothing is ever sent to Highcharts' export
 * server, so project data does not leave the network.
 */
Highcharts.setOptions({
  exporting: { enabled: false, fallbackToExportServer: false },
});

// Highcharts keeps one language for all its charts: the lab's is put back when the lab is left. setOptions
// merges, so the defaults are restored key by key, and keys the lab added (such as the locale) are removed.
const defaultLang = structuredClone(Highcharts.getOptions().lang ?? {}) as Record<string, unknown>;

export function resetLabLanguage() {
  const lang = Highcharts.getOptions().lang as Record<string, unknown> | undefined;
  if (lang) restoreLanguage(lang, defaultLang);
}

/** Months, numbers and the export menu in the person's language. */
export function setLabLanguage(locale: "ru" | "en") {
  Highcharts.setOptions({
    lang:
      locale === "ru"
        ? {
            locale: "ru-RU",
            decimalPoint: ",",
            thousandsSep: " ",
            contextButtonTitle: "Меню графика",
            viewFullscreen: "На весь экран",
            exitFullscreen: "Выйти из полноэкранного режима",
            printChart: "Печать графика",
            downloadPNG: "Скачать PNG",
            downloadJPEG: "Скачать JPEG",
            downloadSVG: "Скачать SVG",
            downloadCSV: "Скачать CSV",
            downloadXLS: "Скачать Excel",
            viewData: "Показать таблицу данных",
            hideData: "Скрыть таблицу данных",
            resetZoom: "Сбросить масштаб",
            resetZoomTitle: "Вернуть масштаб 1:1",
            mainBreadcrumb: "Все вехи",
            exportData: { categoryHeader: "Категория", categoryDatetimeHeader: "Дата" },
          }
        : {
            locale: "en-GB",
            decimalPoint: ".",
            thousandsSep: ",",
            contextButtonTitle: "Chart menu",
            viewFullscreen: "View in full screen",
            exitFullscreen: "Exit full screen",
            printChart: "Print chart",
            downloadPNG: "Download PNG",
            downloadJPEG: "Download JPEG",
            downloadSVG: "Download SVG",
            downloadCSV: "Download CSV",
            downloadXLS: "Download Excel",
            viewData: "View data table",
            hideData: "Hide data table",
            resetZoom: "Reset zoom",
            resetZoomTitle: "Reset zoom level 1:1",
            mainBreadcrumb: "All milestones",
            exportData: { categoryHeader: "Category", categoryDatetimeHeader: "Date" },
          },
  });
}

export default Highcharts;
