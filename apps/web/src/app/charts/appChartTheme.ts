import { useEffect, useState } from "react";

/**
 * The colours charts take from the application's own theme (light or dark),
 * read from its CSS variables, so a Highcharts picture matches the page it is
 * on. Charts of My page have their own sheet themes instead.
 */
export type AppChartColors = {
  text: string;
  muted: string;
  grid: string;
  surface: string;
  brand: string;
  danger: string;
  warning: string;
  success: string;
  series: string[];
  /** The work status colours (the --status-* tokens), the same as the Gantt's bars and the status cells. */
  status: StatusColors;
};

export type StatusColors = {
  done: string;
  inProgress: string;
  inReview: string;
  atRisk: string;
  blocked: string;
  overdue: string;
  notStarted: string;
  cancelled: string;
  milestone: string;
  goal: string;
};

/** The brandbook's palette (tokens.css), for charts drawn where no page is (tests, export). */
const STATUS: StatusColors = {
  done: "#99ea5e",
  inProgress: "#7fa3c8",
  inReview: "#b5cce3",
  atRisk: "#e8a9a2",
  blocked: "#d2776f",
  overdue: "#ed8654",
  notStarted: "#e0dedf",
  cancelled: "#95888b",
  milestone: "#d5ad8b",
  goal: "#71855a",
};
const STATUS_TOKENS: Record<keyof StatusColors, string> = {
  done: "--status-done",
  inProgress: "--status-in-progress",
  inReview: "--status-in-review",
  atRisk: "--status-at-risk",
  blocked: "--status-blocked",
  overdue: "--status-overdue",
  notStarted: "--status-not-started",
  cancelled: "--status-cancelled",
  milestone: "--status-milestone",
  goal: "--status-goal",
};

// Series in the brand's palette: dusty blue, fresh green, orange, after sunset, leaf, evening ray, brick, powder blue.
const LIGHT_SERIES = ["#7fa3c8", "#86b865", "#ed8654", "#95888b", "#5f7449", "#d5ad8b", "#d2776f", "#b5cce3"];
const DARK_SERIES = ["#95b5d6", "#99ea5e", "#f2b286", "#bdb1b4", "#86b865", "#e0c2a3", "#e0908a", "#cbdbeb"];

export function readAppChartColors(): AppChartColors {
  if (typeof document === "undefined") return { text: "#231c18", muted: "#6b625f", grid: "#e0dedf", surface: "#ffffff", brand: "#71855a", danger: "#b5524a", warning: "#ed8654", success: "#536640", series: LIGHT_SERIES, status: STATUS };
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    text: read("--text", "#231c18"),
    muted: read("--text-muted", "#6b625f"),
    grid: read("--border", "#e0dedf"),
    surface: read("--surface", "#ffffff"),
    brand: read("--brand-500", "#71855a"),
    danger: read("--danger", "#b5524a"),
    warning: read("--warning-alt", "#ed8654"),
    success: read("--success", "#536640"),
    series: dark ? DARK_SERIES : LIGHT_SERIES,
    status: Object.fromEntries(
      (Object.keys(STATUS) as Array<keyof StatusColors>).map((key) => [key, read(STATUS_TOKENS[key], STATUS[key])]),
    ) as StatusColors,
  };
}

/** The application's chart colours, read again when the theme changes. */
export function useAppChartColors() {
  const [colors, setColors] = useState<AppChartColors>(() => readAppChartColors());
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readAppChartColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return colors;
}
