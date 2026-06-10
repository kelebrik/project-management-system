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
          <span>Статус: {projectStatusLabel(project.status)}</span>
          <span>РП: {project.projectManager}</span>
          <span>
            Цель:{" "}
            {projectTargetSummary?.activeGoal
              ? `${projectTargetSummary.activeGoal.title}: `
              : ""}
            {date(projectTargetSummary?.currentTargetDate ?? project.targetDate)} (
            {signedDaysLabel(projectTargetSummary?.targetChangeDays ?? null)})
          </span>
          <span>
            Прогноз: {date(projectTargetSummary?.forecastFinishDate ?? null)} (
            {signedDaysLabel(projectTargetSummary?.effectiveDelayDays ?? null)})
          </span>
          <b className={`rag ${scheduleHealth?.tone ?? project.rag.toLowerCase()}`}>
            {scheduleHealth?.label ?? projectHealthLabel(project.rag)}
          </b>
        </div>
      )}
    </header>
  );
}
