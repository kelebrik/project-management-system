import { useMemo } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { PortfolioChartText } from "./portfolioOptions";

/** The words of the portfolio charts in the interface language. */
export function usePortfolioChartText() {
  const { t: uiText, formatters } = useI18n();
  return useMemo<PortfolioChartText>(
    () => ({
      today: uiText("ui.portfolio.chart.today"),
      baseline: uiText("ui.portfolio.chart.baseline"),
      forecast: uiText("ui.portfolio.chart.forecast"),
      noBaseline: uiText("ui.portfolio.chart.noBaseline"),
      daysLater: (count) => uiText("ui.portfolio.chart.daysLater", { count }),
      daysEarlier: (count) => uiText("ui.portfolio.chart.daysEarlier", { count }),
      onTime: uiText("ui.portfolio.chart.onTime"),
      start: uiText("ui.portfolio.chart.start"),
      target: uiText("ui.portfolio.chart.target"),
      done: (percent) => uiText("ui.portfolio.chart.done", { percent }),
      noWork: uiText("ui.portfolio.chart.noWork"),
      overdue: uiText("ui.portfolio.chart.overdue"),
      daysUntil: uiText("ui.portfolio.chart.daysUntil"),
      score: uiText("ui.portfolio.chart.score"),
      impact: (days) => uiText("ui.portfolio.chart.impact", { days }),
      owner: uiText("ui.portfolio.chart.owner"),
      dueDate: uiText("ui.portfolio.chart.dueDate"),
      date: (day) => formatters.date(day),
      titles: { goals: uiText("ui.portfolio.projectGoals"), progress: uiText("ui.portfolio.progressTitle"), problems: uiText("ui.portfolio.portfolioBlockingIssuesTitle"), risks: uiText("ui.portfolio.portfolioKeyRisksTitle") },
    }),
    [formatters, uiText],
  );
}
