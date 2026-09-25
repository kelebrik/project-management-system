import type { AppView } from "../app/routes";
import type { ProjectDetails } from "../app/domainTypes";
import { useI18n } from "../i18n/I18nProvider";


type ScheduleHealth = {
  tone: string;
  label: string;
} | null;

type ProjectTargetSummary = {
  activeGoal: {
    title: string;
    baselineTargetDate: Date | null;
    currentTargetDate: Date | null;
    targetDate: Date | null;
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
  scheduleHealth: ScheduleHealth;
  signedDaysLabel: (value: number | null) => string;
  viewTitle: Record<AppView, string>;
};

export function AppTopbar({
  activeView,
  isProjectView,
  project,
  projectTargetSummary,
  scheduleHealth,
  signedDaysLabel,
  viewTitle,
}: AppTopbarProps) {
  const { t, tCount, formatters: { date }, labels: { projectHealthLabel, projectStatusLabel } } = useI18n();
  // These pages are named by their section tab; a second title only repeats it.
  if (activeView === "reports" || activeView === "leave-schedule" || activeView === "workload") return null;
  const showProjectTitle = project && isProjectView && activeView !== "project-create";
  const showProjectBadges = Boolean(project && showProjectTitle);
  const targetChangeDays = projectTargetSummary?.targetChangeDays ?? null;
  const initialTargetDate =
    projectTargetSummary?.initialTargetDate ?? project?.initialTargetDate ?? project?.targetDate ?? null;
  const currentTargetDate =
    projectTargetSummary?.currentTargetDate ?? project?.targetDate ?? null;
  const activeGoal = projectTargetSummary?.activeGoal ?? null;
  const activeGoalTitle = activeGoal?.title ?? t("topbar.nearest");
  const effectiveDelayDays = projectTargetSummary?.effectiveDelayDays ?? null;
  const hasActiveGoalTargetPair = Boolean(
    activeGoal?.baselineTargetDate && activeGoal.currentTargetDate,
  );
  const hasProjectTargetChange = targetChangeDays !== null && targetChangeDays !== 0;
  const displayedTargetDate = hasActiveGoalTargetPair
    ? activeGoal?.baselineTargetDate
    : hasProjectTargetChange
      ? initialTargetDate
      : activeGoal?.targetDate ?? initialTargetDate ?? currentTargetDate;
  const delayTone =
    effectiveDelayDays === null
      ? scheduleHealth?.tone ?? project?.rag.toLowerCase() ?? "green"
      : effectiveDelayDays > 0
        ? "red"
        : "green";
  const delayLabel =
    effectiveDelayDays === null
      ? scheduleHealth?.label ?? (project ? projectHealthLabel(project.rag) : t("topbar.notCalculated"))
      : effectiveDelayDays < 0
        ? t("topbar.ahead", { days: tCount("time.days", Math.abs(effectiveDelayDays)) })
        : t("topbar.delay", { days: signedDaysLabel(effectiveDelayDays) });

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
      {showProjectBadges && (
        <div className="topbar-project topbar-project-compact">
          <span>{t("topbar.status")} {projectStatusLabel(project.status)}</span>
          <span>{t("topbar.pm")} {project.projectManager}</span>
          <span>{t("topbar.target")} {date(displayedTargetDate)}</span>
          <b className={`rag ${delayTone}`}>{delayLabel}</b>
          <span className="topbar-project-forecast">
            {t("topbar.forecast", { goal: activeGoalTitle, date: date(projectTargetSummary?.forecastFinishDate ?? null) })}
          </span>
        </div>
      )}
    </header>
  );
}
