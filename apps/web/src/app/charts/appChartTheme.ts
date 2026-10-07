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
};

const LIGHT_SERIES = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#14b8a6", "#eab308", "#ef4444", "#64748b"];
const DARK_SERIES = ["#60a5fa", "#4ade80", "#fb923c", "#c084fc", "#2dd4bf", "#facc15", "#f87171", "#94a3b8"];

export function readAppChartColors(): AppChartColors {
  if (typeof document === "undefined") return { text: "#17212b", muted: "#64716f", grid: "#e5e9e8", surface: "#ffffff", brand: "#0f766e", danger: "#dc2626", warning: "#d97706", success: "#16a34a", series: LIGHT_SERIES };
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    text: read("--text", "#17212b"),
    muted: read("--text-muted", "#64716f"),
    grid: read("--border", "#dfe5e4"),
    surface: read("--surface", "#ffffff"),
    brand: read("--brand-500", "#168f83"),
    danger: read("--danger", "#dc2626"),
    warning: read("--warning-alt", "#f5a623"),
    success: read("--success", "#16a34a"),
    series: dark ? DARK_SERIES : LIGHT_SERIES,
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
