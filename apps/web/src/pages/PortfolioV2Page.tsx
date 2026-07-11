import { signedDaysUntil } from "../app/dateUtils";
import type { ProjectListItem, RaidItem } from "../app/domainTypes";
import { projectHealthLabel, projectStatusLabel } from "../app/labels";
import type {
  PortfolioGoalTimelineItem,
  PortfolioGoalTimelineModel,
  PortfolioGoalTimelineProjectRow,
} from "../app/portfolioModels";
import type { ProjectSectionView } from "../app/routes";
import { usePageContext } from "./PageContext";

type PortfolioRaidItem = RaidItem & {
  projectId: string;
  projectName: string;
};

function activeRaid(item: RaidItem) {
  return item.status !== "CLOSED" && item.status !== "VALIDATED";
}

function dueLabel(dueDate: string | null) {
  const days = signedDaysUntil(dueDate);
  if (days === null) return "срок не задан";
  if (days < 0) return `просрочено ${Math.abs(days)} дн.`;
  if (days === 0) return "сегодня";
  return `через ${days} дн.`;
}

function dueTone(dueDate: string | null) {
  const days = signedDaysUntil(dueDate);
  if (days === null) return "neutral";
  if (days < 0) return "red";
  if (days <= 14) return "amber";
  return "green";
}

function collectPortfolioRaid(projects: ProjectListItem[]) {
  return projects.flatMap((project) =>
    (project.raidItems ?? []).map((item) => ({
      ...item,
      projectId: project.id,
      projectName: project.name,
    })),
  );
}

export function PortfolioV2Page() {
  const ctx = usePageContext();
  const {
    activeProjects,
    date,
    firstEnabledProjectView,
    openRaidItemFromOverview,
    portfolioGoalTimeline,
    portfolioSummary,
    projects,
    selectProject,
  } = ctx;
  const portfolioTimeline =
    portfolioGoalTimeline as PortfolioGoalTimelineModel;
  const projectItems = ((activeProjects as ProjectListItem[] | undefined) ??
    (projects as ProjectListItem[]).filter((project) => project.status !== "CLOSED"));
  const raidItems = collectPortfolioRaid(projectItems);
  const redRaidItems = raidItems
    .filter(
      (item) =>
        activeRaid(item) &&
        (item.type === "RISK" || item.type === "DEPENDENCY") &&
        item.riskScore >= 15,
    )
    .sort(
      (left, right) =>
        right.riskScore - left.riskScore ||
        (signedDaysUntil(left.dueDate) ?? Number.POSITIVE_INFINITY) -
          (signedDaysUntil(right.dueDate) ?? Number.POSITIVE_INFINITY) ||
        left.title.localeCompare(right.title, "ru"),
    );
  const decisionQueue = raidItems
    .filter((item) => activeRaid(item) && item.decisionRequired)
    .sort(
      (left, right) =>
        (signedDaysUntil(left.dueDate) ?? Number.POSITIVE_INFINITY) -
          (signedDaysUntil(right.dueDate) ?? Number.POSITIVE_INFINITY) ||
        right.riskScore - left.riskScore,
    );
  const decisionItems = decisionQueue.length > 0 ? decisionQueue : redRaidItems;
  const projectRows = projectItems
    .map((project) => {
      const projectRaid = raidItems.filter((item) => item.projectId === project.id);
      const activeProjectRaid = projectRaid.filter(activeRaid);
      const redCount = activeProjectRaid.filter(
        (item) =>
          (item.type === "RISK" || item.type === "DEPENDENCY") &&
          item.riskScore >= 15,
      ).length;
      const decisions = activeProjectRaid.filter(
        (item) => item.decisionRequired,
      ).length;
      const riskScore = activeProjectRaid.reduce(
        (maxScore, item) => Math.max(maxScore, item.riskScore),
        0,
      );
      const scheduleImpact = activeProjectRaid.reduce(
        (maxImpact, item) => Math.max(maxImpact, item.scheduleImpactDays),
        0,
      );
      const nextGoal = portfolioTimeline.projectRows
        .find((row: PortfolioGoalTimelineProjectRow) => row.projectId === project.id)
        ?.items.find((item: PortfolioGoalTimelineItem) => item.dueDate);
      return {
        project,
        redCount,
        decisions,
        riskScore,
        scheduleImpact,
        nextGoal,
      };
    })
    .sort(
      (left, right) =>
        right.redCount - left.redCount ||
        right.riskScore - left.riskScore ||
        right.decisions - left.decisions ||
        right.scheduleImpact - left.scheduleImpact ||
        left.project.name.localeCompare(right.project.name, "ru"),
    );
  const topProject = projectRows[0] ?? null;
  const timelineRows = portfolioTimeline.projectRows
    .filter((row) => row.items.length > 0)
    .slice(0, 5);

  const openProject = (projectId: string) => {
    selectProject(projectId, firstEnabledProjectView as ProjectSectionView);
  };

  const openRaid = (item: PortfolioRaidItem) => {
    openRaidItemFromOverview(item.id, item.type, item.projectId);
  };

  return (
    <section className="v2-page portfolio-v2-page">
      <div className="v2-compact-header">
        <div>
          <h2>Портфель_v2</h2>
          <span>{projectItems.length} активных проектов</span>
        </div>
        <div className="v2-compact-actions">
          <button
            type="button"
            onClick={() => topProject && openProject(topProject.project.id)}
            disabled={!topProject}
          >
            Открыть фокус-проект
          </button>
        </div>
      </div>

      <div className="v2-attention-strip">
        <div className="v2-attention-chip red">
          <strong>{portfolioSummary.redRiskCount + portfolioSummary.blockerCount}</strong>
          <span>красных сигналов</span>
        </div>
        <div className="v2-attention-chip amber">
          <strong>{decisionQueue.length}</strong>
          <span>решений ожидают</span>
        </div>
        <div className="v2-attention-chip blue">
          <strong>{portfolioTimeline.items.length}</strong>
          <span>целей в окне</span>
        </div>
        <div className="v2-attention-chip green">
          <strong>{portfolioSummary.projectCount}</strong>
          <span>активных проектов</span>
        </div>
        <div className="v2-next-focus">
          <span>Следующий фокус</span>
          <b>
            {redRaidItems[0]
              ? `${redRaidItems[0].projectName} · ${redRaidItems[0].title}`
              : topProject?.project.name ?? "Нет критичных сигналов"}
          </b>
        </div>
      </div>

      <div className="v2-portfolio-grid">
        <article className="v2-card v2-risk-projects">
          <div className="v2-card-title">
            <div>
              <h3>Проекты по риску</h3>
            </div>
          </div>
          <div className="v2-risk-list">
            {projectRows.slice(0, 5).map(({ project, redCount, decisions, riskScore, scheduleImpact }) => (
              <button
                type="button"
                className={`v2-risk-project risk-${project.rag.toLowerCase()}`}
                key={project.id}
                onClick={() => openProject(project.id)}
              >
                <span className="v2-risk-score">{riskScore || redCount}</span>
                <span className="v2-risk-main">
                  <b>{project.name}</b>
                  <small>
                    {redCount} красных RAID · {decisions} решений ·{" "}
                    {projectHealthLabel(project.rag)}
                  </small>
                </span>
                <span className="v2-risk-impact">
                  {scheduleImpact > 0 ? `+${scheduleImpact} дн.` : date(project.targetDate)}
                </span>
              </button>
            ))}
          </div>
        </article>

        <article className="v2-card v2-decision-queue">
          <div className="v2-card-title">
            <div>
              <h3>Decision queue</h3>
            </div>
          </div>
          <div className="v2-decision-list">
            {decisionItems.slice(0, 4).map((item) => (
              <button
                type="button"
                className={`v2-decision-card ${dueTone(item.dueDate)}`}
                key={item.id}
                onClick={() => openRaid(item)}
              >
                <span>{dueLabel(item.dueDate)}</span>
                <b>{item.title}</b>
                <small>
                  {item.projectName} · {item.owner || "ответственный не задан"} ·{" "}
                  риск {item.riskScore}
                </small>
              </button>
            ))}
            {decisionItems.length === 0 && (
              <div className="v2-empty">Решений и красных RAID нет.</div>
            )}
          </div>
        </article>

        <article className="v2-card v2-impact-card">
          <div className="v2-card-title">
            <div>
              <h3>Impact on target</h3>
              <p>Ближайшая цель и факторы влияния</p>
            </div>
          </div>
          <div className="v2-target-date">
            <strong>
              {topProject?.nextGoal ? date(topProject.nextGoal.dueDate) : date(topProject?.project.targetDate ?? null)}
            </strong>
            <span>{topProject?.project.name ?? "Нет проекта"}</span>
          </div>
          {redRaidItems.slice(0, 2).map((item) => (
            <button
              type="button"
              className={`v2-impact-row ${item.scheduleImpactDays > 0 ? "red" : "green"}`}
              key={item.id}
              onClick={() => openRaid(item)}
            >
              {item.scheduleImpactDays > 0 ? `+${item.scheduleImpactDays} дн.` : "без сдвига"} · {item.title}
            </button>
          ))}
        </article>
      </div>

      <div className="v2-portfolio-bottom">
        <article className="v2-card v2-timeline-card">
          <div className="v2-card-title">
            <div>
              <h3>Timeline goals</h3>
              <p>Сравнение целей по проектам</p>
            </div>
          </div>
          <div className="v2-timeline">
            <span
              className="v2-timeline-today"
              style={{ left: `${portfolioTimeline.todayOffset}%` }}
            >
              сегодня
            </span>
            {timelineRows.map((row) => (
              <div className="v2-timeline-row" key={row.projectId}>
                <button type="button" onClick={() => openProject(row.projectId)}>
                  <b>{row.projectName}</b>
                  <small>{row.projectCode}</small>
                </button>
                <div className="v2-timeline-track">
                  {row.items.map((item, index) => (
                    <span
                      className={`v2-goal-dot status-${item.status.toLowerCase()}`}
                      key={item.id}
                      style={{ left: `${item.offset}%` }}
                      title={`${item.goalTitle}: ${date(item.dueDate)}`}
                    >
                      {index + 1}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {timelineRows.length === 0 && (
              <div className="v2-empty">Целей в диапазоне шкалы нет.</div>
            )}
          </div>
        </article>

        <article className="v2-card v2-portfolio-table-card">
          <div className="v2-card-title">
            <div>
              <h3>Portfolio table</h3>
              <p>Минимум паспорта, максимум сравнения</p>
            </div>
          </div>
          <div className="v2-portfolio-table">
            <div className="v2-portfolio-table-head">
              <span>Проект</span>
              <span>Риск</span>
              <span>Цель</span>
            </div>
            {projectRows.slice(0, 6).map(({ project, riskScore }) => (
              <button
                type="button"
                className="v2-portfolio-table-row"
                key={project.id}
                onClick={() => openProject(project.id)}
              >
                <span>
                  <b>{project.name}</b>
                  <small>{projectStatusLabel(project.status)}</small>
                </span>
                <em className={`risk-${project.rag.toLowerCase()}`}>
                  {riskScore}
                </em>
                <strong>{date(project.targetDate)}</strong>
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
