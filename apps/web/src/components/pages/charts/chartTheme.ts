import type { PageTheme } from "@pms/shared";
import type { ChartColors } from "../../../app/pages/chartOption";

/**
 * The colours of the charts for each look of the sheet; the same values as
 * the sheet's CSS variables in my-page.css, so charts match the widgets.
 */
const LIGHT: ChartColors = {
  series: ["#71855a", "#7fa3c8", "#ed8654", "#95888b", "#d5ad8b", "#d2776f", "#86b865", "#b5cce3"],
  text: "#231c18",
  muted: "#6b625f",
  grid: "#e0dedf",
  surface: "#ffffff",
  rag: { GREEN: "#5f7449", AMBER: "#b85f30", RED: "#b5524a" },
};

const THEMES: Record<PageTheme, ChartColors> = {
  light: LIGHT,
  brand: LIGHT,
  dark: {
    series: ["#99ea5e", "#95b5d6", "#f2b286", "#bdb1b4", "#e0c2a3", "#e0908a", "#c2e39a", "#cbdbeb"],
    text: "#fafafa",
    muted: "#cbc6c4",
    grid: "#353534",
    surface: "#242423",
    rag: { GREEN: "#99ea5e", AMBER: "#ed8654", RED: "#e0908a" },
  },
  print: { ...LIGHT, series: ["#2c2c2b", "#857d7a", "#a9a2a0", "#4e4643", "#545453", "#e0dedf", "#231c18", "#efebe6"], muted: "#4e4643", grid: "#e0dedf" },
};

export function chartColors(theme: PageTheme) {
  return THEMES[theme];
}
