import { useMemo } from "react";
import { useAppChartColors } from "../../app/charts/appChartTheme";
import { PROGRESS_ROW, PROGRESS_TOP, drawableProgressProjects, portfolioProgressOption, type PortfolioProgressProject } from "../../app/charts/portfolioOptions";
import { usePortfolioChartText } from "../../app/charts/usePortfolioChartText";
import type { ProjectListItem } from "../../app/domainTypes";
import { compactPassportRows } from "../../app/projectPassportRows";
import { createProjectWorkProgress } from "../../app/projectWorkProgress";
import { useLatest } from "../../app/useLatest";
import { useI18n } from "../../i18n/I18nProvider";
import { HighchartsLabChart } from "../charts/HighchartsLabChart";
import { useHighchartsExtras } from "../charts/useHighchartsExtras";

type ProjectProgressBoardProps = {
  /** In the order to draw them. */
  projects: ProjectListItem[];
  /** A click on a bar or a project name. */
  onOpenProject: (projectId: string) => void;
  onOpenPassport: (projectId: string) => void;
};

/**
 * Each project from its start to its target with the share of work done, and
 * its passport fields beside it row for row; projects without valid dates are
 * listed below the chart so none goes missing.
 */
export function ProjectProgressBoard({ projects, onOpenProject, onOpenPassport }: ProjectProgressBoardProps) {
  const { t: uiText, locale, labels } = useI18n();
  const colors = useAppChartColors();
  const chartsReady = useHighchartsExtras(locale);
  const chartText = usePortfolioChartText();
  const openProject = useLatest(onOpenProject);
  const progressProjects = useMemo<PortfolioProgressProject[]>(
    () => projects.map((project) => {
      const progress = createProjectWorkProgress(project.wbsItems ?? []);
      return { id: project.id, code: project.code, name: project.name, rag: project.rag, startDate: project.startDate, targetDate: project.targetDate, completedPercent: progress.totalDays > 0 ? progress.completedPercent : null };
    }),
    [projects],
  );
  const drawable = useMemo(() => drawableProgressProjects(progressProjects), [progressProjects]);
  const undrawable = useMemo(() => {
    const drawn = new Set(drawable.map((entry) => entry.id));
    return progressProjects.filter((entry) => !drawn.has(entry.id));
  }, [drawable, progressProjects]);
  const passports = useMemo(() => {
    const byId = new Map(projects.map((project) => [project.id, project]));
    return drawable.map((entry) => ({ entry, fields: compactPassportRows(byId.get(entry.id)!, uiText, labels) }));
  }, [drawable, labels, projects, uiText]);
  const today = new Date().toISOString().slice(0, 10);
  const options = useMemo(
    () => (chartsReady ? portfolioProgressOption({ projects: progressProjects, today, colors, text: chartText, onPick: openProject }) : null),
    [chartText, chartsReady, colors, openProject, progressProjects, today],
  );

  return (
    <>
      <div className="portfolio-progress-layout">
        {options ? <div className="portfolio-chart"><HighchartsLabChart label={uiText("ui.portfolio.progressTitle")} options={options} /></div> : null}
        {options && (
          <div className="portfolio-progress-passports" style={{ paddingTop: PROGRESS_TOP }}>
            {passports.map(({ entry, fields }) => (
              <button
                aria-label={uiText("ui.portfolio.openPassport", { project: `${entry.code} · ${entry.name}` })}
                className="portfolio-progress-passport"
                key={entry.id}
                onClick={() => onOpenPassport(entry.id)}
                style={{ height: PROGRESS_ROW }}
                type="button"
              >
                <b className="portfolio-progress-code">{entry.code}</b>
                {fields.map((field) => (
                  <span key={field.id}>
                    <em title={field.field}>{field.field}</em>
                    <strong>{field.description}</strong>
                  </span>
                ))}
                {fields.length === 0 && (
                  <span>
                    <em>{uiText("registry.charter")}</em>
                    <strong>{uiText("registry.noCharter")}</strong>
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {undrawable.length > 0 && (
        <div className="portfolio-progress-undated">
          <p>{uiText("ui.portfolio.progressUndated")}</p>
          {undrawable.map((entry) => (
            <button key={entry.id} type="button" onClick={() => onOpenPassport(entry.id)}>
              <b>{entry.code}</b> {entry.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
