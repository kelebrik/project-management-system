import type { ReactNode } from "react";
import type { AppView } from "../app/routes";
import type { ProjectDetails } from "../app/domainTypes";
import { date } from "../app/dateUtils";
import { projectHealthLabel, projectStatusLabel } from "../app/labels";

type ScheduleHealth = {
  tone: string;
  label: string;
} | null;

type ProjectTargetSummary = {
  activeGoal: {
    title: string;
  } | null;
  initialTargetDate: Date | null;
  currentTargetDate: Date | null;
  forecastFinishDate: Date | null;
  targetChangeDays: number | null;
  effectiveDelayDays: number | null;
} | null;

type AppTopbarProps = {
  activeView: AppView;
  isProjectView: boolean;
  project: ProjectDetails | null;
  projectTargetSummary: ProjectTargetSummary;
  search: ReactNode;
  scheduleHealth: ScheduleHealth;
  signedDaysLabel: (value: number | null) => string;
  viewTitle: Record<AppView, string>;
};

export function AppTopbar({
  activeView,
  isProjectView,
  project,
  projectTargetSummary,
  search,
  scheduleHealth,
  signedDaysLabel,
  viewTitle,
}: AppTopbarProps) {
  const showProjectTitle = project && isProjectView && activeView !== "project-create";
  const showProjectBadges = project && activeView !== "portfolio";
  const targetChangeDays = projectTargetSummary?.targetChangeDays ?? null;
  const hasCurrentTargetChange = targetChangeDays !== null && targetChangeDays !== 0;
  const initialTargetDate =
    projectTargetSummary?.initialTargetDate ?? project?.initialTargetDate ?? project?.targetDate ?? null;
  const currentTargetDate =
    projectTargetSummary?.currentTargetDate ?? project?.targetDate ?? null;
  const activeGoalTitle = projectTargetSummary?.activeGoal?.title ?? "ближайшая цель";

  return (
    <header
      className={`topbar ${showProjectTitle ? "project-topbar" : ""}`}
    >
      <div className="topbar-main">
        {showProjectTitle ? (
          <h1>{project.name}</h1>
        ) : (
          <h1>{viewTitle[activeView]}</h1>
        )}
      </div>
      <div className="topbar-search">{search}</div>
      {showProjectBadges && (
        <div className="topbar-project">
          <div className="topbar-project-row">
            <span>Статус: {projectStatusLabel(project.status)}</span>
            <span>РП: {project.projectManager}</span>
            <span>Изначальная цель: {date(initialTargetDate)}</span>
          </div>
          {hasCurrentTargetChange && (
            <div className="topbar-project-row">
              <span>
                Актуальная цель: {date(currentTargetDate)} (
                {signedDaysLabel(targetChangeDays)})
              </span>
            </div>
          )}
          <div className="topbar-project-row">
            <b className={`rag ${scheduleHealth?.tone ?? project.rag.toLowerCase()}`}>
              {scheduleHealth?.label ?? projectHealthLabel(project.rag)}
            </b>
            <span>
              Прогноз по цели "{activeGoalTitle}":{" "}
              {date(projectTargetSummary?.forecastFinishDate ?? null)} (
              {signedDaysLabel(projectTargetSummary?.effectiveDelayDays ?? null)})
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
