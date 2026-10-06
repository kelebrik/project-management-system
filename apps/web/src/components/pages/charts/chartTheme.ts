import type { PageTheme } from "@pms/shared";
import type { ChartColors } from "../../../app/pages/chartOption";

/**
 * The colours of the charts for each look of the sheet; the same values as
 * the sheet's CSS variables in my-page.css, so charts match the widgets.
 */
const LIGHT: ChartColors = {
  series: ["#0f766e", "#3b82f6", "#f97316", "#8b5cf6", "#eab308", "#ec4899", "#14b8a6", "#64748b"],
  text: "#17212b",
  muted: "#5b6866",
  grid: "#e8edec",
  surface: "#ffffff",
  rag: { GREEN: "#15803d", AMBER: "#b45309", RED: "#dc2626" },
};

const THEMES: Record<PageTheme, ChartColors> = {
  light: LIGHT,
  brand: LIGHT,
  dark: {
    series: ["#57c8ba", "#60a5fa", "#fb923c", "#a78bfa", "#facc15", "#f472b6", "#2dd4bf", "#94a3b8"],
    text: "#e5edf9",
    muted: "#a6b5cc",
    grid: "#26324a",
    surface: "#162033",
    rag: { GREEN: "#34c46f", AMBER: "#eaa64a", RED: "#f0616a" },
  },
  print: { ...LIGHT, series: ["#1f2937", "#6b7280", "#9ca3af", "#374151", "#4b5563", "#d1d5db", "#111827", "#e5e7eb"], muted: "#444444", grid: "#dddddd" },
};

export function chartColors(theme: PageTheme) {
  return THEMES[theme];
}
