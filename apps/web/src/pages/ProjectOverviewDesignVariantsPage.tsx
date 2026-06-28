import {
  AlertTriangle,
  CalendarClock,
  CircleAlert,
  ClipboardList,
  Clock3,
  Flag,
  GitBranch,
  ListFilter,
  Milestone,
  ShieldAlert,
  Target,
  TrendingDown,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { date, shortDate } from "../app/dateUtils";
import type { MilestoneTimelineItem } from "../app/milestoneTimeline";
import { projectHealthLabel, raidTypeLabel } from "../app/labels";
import { usePageContext } from "./PageContext";

type DesignVariant =
  | "status-1"
  | "status-2"
  | "status-3"
  | "schedule-1"
  | "schedule-2"
  | "schedule-3";

type ScheduleMode = "phase" | "all" | "problem";

type Dashboard = ReturnType<typeof useOverviewData>["dashboard"];

const statusVariants: Array<{ id: DesignVariant; label: string }> = [
  { id: "status-1", label: "Вариант 1" },
  { id: "status-2", label: "Вариант 2" },
  { id: "status-3", label: "Вариант 3" },
];

const scheduleVariants: Array<{ id: DesignVariant; label: string }> = [
  { id: "schedule-1", label: "Вариант 1" },
  { id: "schedule-2", label: "Вариант 2" },
  { id: "schedule-3", label: "Вариант 3" },
];

const scheduleModes: Array<{ id: ScheduleMode; label: string }> = [
  { id: "phase", label: "По фазам" },
  { id: "all", label: "Все вехи" },
  { id: "problem", label: "Только проблемные" },
];

function useDesignVariant() {
  const [variant, setVariant] = useState<DesignVariant | null>(() =>
    readDesignVariant(),
  );

  useEffect(() => {
    const syncVariant = () => setVariant(readDesignVariant());
    window.addEventListener("popstate", syncVariant);
    return () => window.removeEventListener("popstate", syncVariant);
  }, []);

  return variant;
}

function readDesignVariant(): DesignVariant | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("design");
  return isDesignVariant(value) ? value : null;
}

function isDesignVariant(value: string | null): value is DesignVariant {
  return (
    value === "status-1" ||
    value === "status-2" ||
    value === "status-3" ||
    value === "schedule-1" ||
    value === "schedule-2" ||
    value === "schedule-3"
  );
}

function updateDesignVariant(variant: DesignVariant) {
  const url = new URL(window.location.href);
  url.searchParams.set("design", variant);
  window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useOverviewDesignVariant() {
  return useDesignVariant();
}

export function ProjectOverviewDesignVariantsPage({
  variant,
}: {
  variant: DesignVariant;
}) {
  const data = useOverviewData();
  if (variant.startsWith("status")) {
    return <StatusDesignRouter data={data} variant={variant} />;
  }
  return <ScheduleDesignRouter data={data} variant={variant} />;
}

function useOverviewData() {
  const ctx = usePageContext();
  const {
    date: formatDate,
    milestoneLabelOffsets,
    milestoneTimeline,
    MilestoneSnakeTimelineSection,
    MilestoneTimelineSection,
    openView,
    overviewDashboard,
    printSectionAsPdf,
    project,
    projectTargetSummary,
    raidTypeLabel: formatRaidType,
    signedDaysLabel,
    startMilestoneLabelDrag,
    toggleWorkspaceFullscreen,
    fullscreenWorkspaceView,
  } = ctx;

  const allMilestones = useMemo(
    () =>
      milestoneTimeline.all.lanes
        .flatMap((lane: { items: MilestoneTimelineItem[] }) => lane.items)
        .sort((left: MilestoneTimelineItem, right: MilestoneTimelineItem) =>
          String(left.milestone.dueDate ?? "").localeCompare(
            String(right.milestone.dueDate ?? ""),
          ),
        ),
    [milestoneTimeline.all.lanes],
  );
  const problemMilestones = useMemo(
    () =>
      allMilestones.filter(
        (entry: MilestoneTimelineItem) =>
          entry.state.tone === "red" ||
          (entry.calendarDaysLeft !== null &&
            entry.calendarDaysLeft <= 21 &&
            entry.milestone.status !== "DONE"),
      ),
    [allMilestones],
  );
  const nextMilestones = useMemo(
    () =>
      allMilestones
        .filter(
          (entry: MilestoneTimelineItem) =>
            entry.calendarDaysLeft === null ||
            entry.calendarDaysLeft >= -7 ||
            entry.milestone.status !== "DONE",
        )
        .slice(0, 7),
    [allMilestones],
  );
  const completedMilestones = allMilestones.filter(
    (entry: MilestoneTimelineItem) => entry.milestone.status === "DONE",
  ).length;
  const openMilestones = allMilestones.length - completedMilestones;
  const overdueMilestones = allMilestones.filter(
    (entry: MilestoneTimelineItem) => entry.state.tone === "red",
  ).length;
  const healthTone =
    overviewDashboard.scheduleVarianceFromStructure > 0 ||
    overviewDashboard.redZoneRisks.length > 0 ||
    overdueMilestones > 0
      ? "red"
      : project?.rag?.toLowerCase?.() ?? "green";
  const varianceValue = overviewDashboard.scheduleVarianceFromStructure;
  const varianceLabel =
    varianceValue > 0
      ? `+${varianceValue} дн.`
      : varianceValue < 0
        ? `${varianceValue} дн.`
        : "0 дн.";
  const activeGoalTitle = projectTargetSummary?.activeGoal?.title ?? "цель проекта";
  const targetDate =
    projectTargetSummary?.currentTargetDate ?? project?.targetDate ?? null;
  const forecastDate = projectTargetSummary?.forecastFinishDate ?? null;
  const effectiveDelayDays = projectTargetSummary?.effectiveDelayDays ?? null;
  const delayLabel =
    effectiveDelayDays === null
      ? project
        ? projectHealthLabel(project.rag)
        : "Статус не рассчитан"
      : effectiveDelayDays < 0
        ? `Опережение ${Math.abs(effectiveDelayDays)} дн.`
        : effectiveDelayDays > 0
          ? `Отставание ${signedDaysLabel(effectiveDelayDays)}`
          : "По плану";
  const scheduleTone =
    effectiveDelayDays !== null
      ? effectiveDelayDays > 0
        ? "red"
        : "green"
      : varianceValue > 0 || overdueMilestones > 0
        ? "red"
        : "green";

  const attentionItems = [
    ...overviewDashboard.redZoneRisks.map((item: any) => ({
      id: `risk-${item.id}`,
      title: item.title,
      meta: `${formatRaidType?.(item.type) ?? raidTypeLabel(item.type)} / score ${item.riskScore}`,
      tone: "red" as const,
      source: "RAID",
    })),
    ...overviewDashboard.openDecisionItems.map((item: any) => ({
      id: `decision-${item.id}`,
      title: item.title,
      meta: `${item.owner || "не назначен"} / срок ${formatDate(item.dueDate)}`,
      tone: "amber" as const,
      source: "Решение",
    })),
    ...overviewDashboard.blockingTickets.map((item: any) => ({
      id: `ticket-${item.id}`,
      title: item.title,
      meta: `${item.status} / ${item.priority}${item.assignee ? ` / ${item.assignee}` : ""}`,
      tone: "blue" as const,
      source: "Jira",
    })),
    ...overviewDashboard.scheduleDelayItems.map(({ item, delay }: any) => ({
      id: `delay-${item.id}`,
      title: `${item.code} ${item.title}`,
      meta: `+${delay} календарных дней / ${item.owner || "не назначен"}`,
      tone: "red" as const,
      source: "Сроки",
    })),
  ].slice(0, 8);

  const kpis = [
    {
      key: "red-risks",
      label: "Красные риски",
      value: overviewDashboard.redZoneRisks.length,
      detail:
        overviewDashboard.redZoneRisks.length > 0
          ? "требуют реакции"
          : "красной зоны нет",
      tone: overviewDashboard.redZoneRisks.length > 0 ? "red" : "green",
      icon: ShieldAlert,
    },
    {
      key: "decisions",
      label: "Решения",
      value: overviewDashboard.decisionItems,
      detail:
        overviewDashboard.decisionItems > 0
          ? "открытые вопросы"
          : "нет открытых решений",
      tone: overviewDashboard.decisionItems > 0 ? "amber" : "green",
      icon: ClipboardList,
    },
    {
      key: "tickets",
      label: "Тикеты под риском",
      value: overviewDashboard.blockingTickets.length,
      detail:
        overviewDashboard.blockingTickets.length > 0
          ? "из Jira-среза"
          : "блокеров нет",
      tone: overviewDashboard.blockingTickets.length > 0 ? "blue" : "green",
      icon: CircleAlert,
    },
    {
      key: "variance",
      label: "Отклонение сроков",
      value: varianceLabel,
      detail:
        varianceValue > 0
          ? "отставание"
          : varianceValue < 0
            ? "опережение"
            : "по базовому плану",
      tone: varianceValue > 0 ? "red" : varianceValue < 0 ? "green" : "neutral",
      icon: CalendarClock,
    },
  ];

  return {
    activeGoalTitle,
    allMilestones,
    attentionItems,
    completedMilestones,
    dashboard: overviewDashboard,
    delayLabel,
    effectiveDelayDays,
    forecastDate,
    fullscreenWorkspaceView,
    healthTone,
    kpis,
    milestoneLabelOffsets,
    milestoneTimeline,
    MilestoneSnakeTimelineSection,
    MilestoneTimelineSection,
    nextMilestones,
    openMilestones,
    openView,
    overdueMilestones,
    printSectionAsPdf,
    problemMilestones,
    project,
    projectTargetSummary,
    scheduleTone,
    startMilestoneLabelDrag,
    targetDate,
    toggleWorkspaceFullscreen,
    varianceLabel,
    varianceValue,
  };
}

function StatusDesignRouter({
  data,
  variant,
}: {
  data: ReturnType<typeof useOverviewData>;
  variant: DesignVariant;
}) {
  if (variant === "status-2") return <StatusDesignBoard data={data} />;
  if (variant === "status-3") return <StatusDesignCommand data={data} />;
  return <StatusDesignExecutive data={data} />;
}

function ScheduleDesignRouter({
  data,
  variant,
}: {
  data: ReturnType<typeof useOverviewData>;
  variant: DesignVariant;
}) {
  if (variant === "schedule-2") return <ScheduleDesignAtlas data={data} />;
  if (variant === "schedule-3") return <ScheduleDesignControl data={data} />;
  return <ScheduleDesignWorkspace data={data} />;
}

function VariantNav({
  active,
  type,
}: {
  active: DesignVariant;
  type: "status" | "schedule";
}) {
  const variants = type === "status" ? statusVariants : scheduleVariants;
  return (
    <div className="design-variant-nav">
      {variants.map((variant) => (
        <button
          className={active === variant.id ? "active" : ""}
          key={variant.id}
          onClick={() => updateDesignVariant(variant.id)}
          type="button"
        >
          {variant.label}
        </button>
      ))}
      <span>{type === "status" ? "Состояние проекта" : "График проекта"}</span>
    </div>
  );
}

function StatusDesignExecutive({
  data,
}: {
  data: ReturnType<typeof useOverviewData>;
}) {
  return (
    <section className="design-page design-page-status executive">
      <VariantNav active="status-1" type="status" />
      <DesignHero data={data} label="Состояние проекта" />
      <KpiStrip kpis={data.kpis} />
      <div className="design-two-columns">
        <AttentionPanel items={data.attentionItems} title="Требует внимания" />
        <MilestonePreview
          milestones={data.nextMilestones}
          title="Ближайшие вехи"
        />
      </div>
    </section>
  );
}

function StatusDesignBoard({
  data,
}: {
  data: ReturnType<typeof useOverviewData>;
}) {
  return (
    <section className="design-page design-page-status board">
      <VariantNav active="status-2" type="status" />
      <div className="status-board-layout">
        <aside className={`status-board-hero ${data.scheduleTone}`}>
          <span>Состояние</span>
          <strong>{data.delayLabel}</strong>
          <p>
            Цель: {data.activeGoalTitle}. Прогноз{" "}
            {date(data.forecastDate)} при целевой дате {date(data.targetDate)}.
          </p>
          <div className="status-board-hero-grid">
            <span>
              <b>{data.openMilestones}</b>
              открытых вех
            </span>
            <span>
              <b>{data.overdueMilestones}</b>
              просрочено
            </span>
          </div>
        </aside>
        <div className="status-board-main">
          <KpiStrip kpis={data.kpis} compact />
          <div className="status-board-columns">
            <AttentionPanel items={data.attentionItems} title="Сейчас в фокусе" />
            <MilestonePreview
              milestones={data.nextMilestones.slice(0, 5)}
              title="Следующие контрольные точки"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusDesignCommand({
  data,
}: {
  data: ReturnType<typeof useOverviewData>;
}) {
  return (
    <section className="design-page design-page-status command">
      <VariantNav active="status-3" type="status" />
      <div className="command-head">
        <div>
          <span>Командный экран</span>
          <h2>{data.project?.name ?? "Проект"}</h2>
        </div>
        <div className={`command-status ${data.healthTone}`}>
          <b>{data.delayLabel}</b>
          <small>Прогноз: {date(data.forecastDate)}</small>
        </div>
      </div>
      <KpiStrip kpis={data.kpis} compact />
      <div className="command-grid">
        <CommandColumn
          icon={<CalendarClock size={18} />}
          items={data.dashboard.scheduleDelayItems.map(({ item, delay }: any) => ({
            id: item.id,
            title: `${item.code} ${item.title}`,
            meta: `+${delay} календарных дней`,
            tone: "red" as const,
          }))}
          title="Сроки"
          empty="Отклонений по срокам нет."
        />
        <CommandColumn
          icon={<ShieldAlert size={18} />}
          items={data.dashboard.redZoneRisks.map((item: any) => ({
            id: item.id,
            title: item.title,
            meta: `score ${item.riskScore}`,
            tone: "red" as const,
          }))}
          title="Риски и проблемы"
          empty="Красной зоны нет."
        />
        <CommandColumn
          icon={<ClipboardList size={18} />}
          items={data.dashboard.openDecisionItems.map((item: any) => ({
            id: item.id,
            title: item.title,
            meta: `${item.owner || "не назначен"} / ${date(item.dueDate)}`,
            tone: "amber" as const,
          }))}
          title="Решения"
          empty="Открытых решений нет."
        />
      </div>
      <MilestonePreview
        milestones={data.nextMilestones}
        title="Ближайшие вехи"
        wide
      />
    </section>
  );
}

function ScheduleDesignWorkspace({
  data,
}: {
  data: ReturnType<typeof useOverviewData>;
}) {
  const [mode, setMode] = useState<ScheduleMode>("phase");
  return (
    <section className="design-page design-page-schedule workspace">
      <VariantNav active="schedule-1" type="schedule" />
      <ScheduleHeader data={data} mode={mode} onModeChange={setMode} />
      <ScheduleModeContent data={data} mode={mode} variant="workspace" />
    </section>
  );
}

function ScheduleDesignAtlas({
  data,
}: {
  data: ReturnType<typeof useOverviewData>;
}) {
  const [mode, setMode] = useState<ScheduleMode>("all");
  return (
    <section className="design-page design-page-schedule atlas">
      <VariantNav active="schedule-2" type="schedule" />
      <div className="schedule-atlas-head">
        <div>
          <span>График проекта</span>
          <h2>Дорожная карта вех</h2>
        </div>
        <ScheduleModeTabs mode={mode} onModeChange={setMode} />
      </div>
      <div className="schedule-atlas-grid">
        <MilestoneRail
          milestones={
            mode === "problem" ? data.problemMilestones : data.nextMilestones
          }
          title={mode === "problem" ? "Проблемные вехи" : "Ближайшие вехи"}
        />
        <ScheduleModeContent data={data} mode={mode} variant="atlas" />
      </div>
    </section>
  );
}

function ScheduleDesignControl({
  data,
}: {
  data: ReturnType<typeof useOverviewData>;
}) {
  const [mode, setMode] = useState<ScheduleMode>("problem");
  return (
    <section className="design-page design-page-schedule control">
      <VariantNav active="schedule-3" type="schedule" />
      <div className="schedule-control-head">
        <div>
          <span>График проекта</span>
          <h2>Контроль отклонений</h2>
        </div>
        <ScheduleModeTabs mode={mode} onModeChange={setMode} />
      </div>
      <div className="schedule-control-summary">
        <MetricTile
          icon={<Target size={18} />}
          label="Целевая дата"
          value={date(data.targetDate)}
        />
        <MetricTile
          icon={<Flag size={18} />}
          label="Прогноз"
          value={date(data.forecastDate)}
        />
        <MetricTile
          icon={<AlertTriangle size={18} />}
          label="Проблемные вехи"
          value={data.problemMilestones.length}
        />
        <MetricTile
          icon={<TrendingDown size={18} />}
          label="Отклонение"
          value={data.varianceLabel}
        />
      </div>
      <ScheduleModeContent data={data} mode={mode} variant="control" />
    </section>
  );
}

function DesignHero({
  data,
  label,
}: {
  data: ReturnType<typeof useOverviewData>;
  label: string;
}) {
  return (
    <div className={`design-hero ${data.healthTone}`}>
      <div>
        <span>{label}</span>
        <h2>{data.project?.name ?? "Проект"}</h2>
        <p>
          {data.activeGoalTitle}: цель {date(data.targetDate)}, прогноз{" "}
          {date(data.forecastDate)}.
        </p>
      </div>
      <div className="design-hero-status">
        <strong>{data.delayLabel}</strong>
        <span>{data.varianceLabel} к базовому плану</span>
      </div>
    </div>
  );
}

function KpiStrip({
  compact = false,
  kpis,
}: {
  compact?: boolean;
  kpis: ReturnType<typeof useOverviewData>["kpis"];
}) {
  return (
    <div className={`design-kpi-strip ${compact ? "compact" : ""}`}>
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <article className={`design-kpi ${kpi.tone}`} key={kpi.key}>
            <span className="design-kpi-icon">
              <Icon size={18} />
            </span>
            <div>
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
              <small>{kpi.detail}</small>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function AttentionPanel({
  items,
  title,
}: {
  items: Array<{
    id: string;
    meta: string;
    source: string;
    title: string;
    tone: "amber" | "blue" | "red";
  }>;
  title: string;
}) {
  return (
    <article className="design-panel attention">
      <PanelTitle icon={<ShieldAlert size={18} />} title={title} />
      <div className="attention-list">
        {items.map((item) => (
          <div className={`attention-row ${item.tone}`} key={item.id}>
            <span>{item.source}</span>
            <b>{item.title}</b>
            <small>{item.meta}</small>
          </div>
        ))}
        {items.length === 0 && (
          <div className="design-empty">Критичных элементов нет.</div>
        )}
      </div>
    </article>
  );
}

function MilestonePreview({
  milestones,
  title,
  wide = false,
}: {
  milestones: MilestoneTimelineItem[];
  title: string;
  wide?: boolean;
}) {
  return (
    <article className={`design-panel milestone-preview ${wide ? "wide" : ""}`}>
      <PanelTitle icon={<Milestone size={18} />} title={title} />
      <div className="milestone-preview-list">
        {milestones.map((entry) => (
          <div className={`milestone-preview-row ${entry.state.tone}`} key={entry.milestone.id}>
            <time>{shortDate(entry.milestone.dueDate)}</time>
            <div>
              <b>{entry.milestone.title}</b>
              <small>
                {entry.state.label}
                {entry.calendarDaysLeft !== null
                  ? ` / ${daysLeftLabel(entry.calendarDaysLeft)}`
                  : ""}
              </small>
            </div>
          </div>
        ))}
        {milestones.length === 0 && (
          <div className="design-empty">Вехи для отображения не найдены.</div>
        )}
      </div>
    </article>
  );
}

function CommandColumn({
  empty,
  icon,
  items,
  title,
}: {
  empty: string;
  icon: React.ReactNode;
  items: Array<{ id: string; meta: string; title: string; tone: "amber" | "red" }>;
  title: string;
}) {
  return (
    <article className="design-panel command-column">
      <PanelTitle icon={icon} title={title} />
      <div className="command-list">
        {items.map((item) => (
          <div className={`command-row ${item.tone}`} key={item.id}>
            <b>{item.title}</b>
            <small>{item.meta}</small>
          </div>
        ))}
        {items.length === 0 && <div className="design-empty">{empty}</div>}
      </div>
    </article>
  );
}

function ScheduleHeader({
  data,
  mode,
  onModeChange,
}: {
  data: ReturnType<typeof useOverviewData>;
  mode: ScheduleMode;
  onModeChange: (mode: ScheduleMode) => void;
}) {
  return (
    <div className="schedule-workspace-head">
      <div>
        <span>График проекта</span>
        <h2>{data.project?.name ?? "Проект"}</h2>
        <p>
          {data.openMilestones} открытых вех, {data.completedMilestones}{" "}
          пройдено, {data.overdueMilestones} просрочено.
        </p>
      </div>
      <ScheduleModeTabs mode={mode} onModeChange={onModeChange} />
    </div>
  );
}

function ScheduleModeTabs({
  mode,
  onModeChange,
}: {
  mode: ScheduleMode;
  onModeChange: (mode: ScheduleMode) => void;
}) {
  return (
    <div className="schedule-mode-tabs" role="tablist" aria-label="Вид графика">
      {scheduleModes.map((item) => (
        <button
          className={mode === item.id ? "active" : ""}
          key={item.id}
          onClick={() => onModeChange(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ScheduleModeContent({
  data,
  mode,
  variant,
}: {
  data: ReturnType<typeof useOverviewData>;
  mode: ScheduleMode;
  variant: "atlas" | "control" | "workspace";
}) {
  if (mode === "problem") {
    return (
      <ProblemMilestoneBoard
        dashboard={data.dashboard}
        milestones={data.problemMilestones}
        variant={variant}
      />
    );
  }
  if (mode === "all") {
    return (
      <div className={`schedule-chart-shell ${variant}`}>
        <data.MilestoneSnakeTimelineSection
          isFullscreen={data.fullscreenWorkspaceView === "overview-milestones-all"}
          labelOffsets={data.milestoneLabelOffsets}
          onLabelPointerDown={data.startMilestoneLabelDrag}
          onOpenStructure={() => data.openView("project-structure")}
          onPrint={() =>
            data.printSectionAsPdf(
              "design-milestones-all",
              `${data.project.code} - все вехи`,
            )
          }
          onToggleFullscreen={() =>
            data.toggleWorkspaceFullscreen("overview-milestones-all")
          }
          sectionId="design-milestones-all"
          timeline={data.milestoneTimeline.all}
          title="Все вехи"
        />
      </div>
    );
  }
  return (
    <div className={`schedule-chart-shell ${variant}`}>
      <data.MilestoneTimelineSection
        isFullscreen={
          data.fullscreenWorkspaceView === "overview-milestones-by-phase"
        }
        labelOffsets={data.milestoneLabelOffsets}
        onLabelPointerDown={data.startMilestoneLabelDrag}
        onOpenStructure={() => data.openView("project-structure")}
        onPrint={() =>
          data.printSectionAsPdf(
            "design-milestones-by-phase",
            `${data.project.code} - вехи по фазам`,
          )
        }
        onToggleFullscreen={() =>
          data.toggleWorkspaceFullscreen("overview-milestones-by-phase")
        }
        sectionId="design-milestones-by-phase"
        timeline={data.milestoneTimeline.byPhase}
        title="Вехи по фазам"
      />
    </div>
  );
}

function ProblemMilestoneBoard({
  dashboard,
  milestones,
  variant,
}: {
  dashboard: Dashboard;
  milestones: MilestoneTimelineItem[];
  variant: "atlas" | "control" | "workspace";
}) {
  return (
    <div className={`problem-board ${variant}`}>
      <article className="design-panel problem-main">
        <PanelTitle icon={<ListFilter size={18} />} title="Проблемные вехи" />
        <div className="problem-table">
          {milestones.map((entry) => (
            <div className={`problem-row ${entry.state.tone}`} key={entry.milestone.id}>
              <time>{shortDate(entry.milestone.dueDate)}</time>
              <b>{entry.milestone.title}</b>
              <span>{entry.state.label}</span>
              <small>
                {entry.calendarDaysLeft !== null
                  ? daysLeftLabel(entry.calendarDaysLeft)
                  : "срок не задан"}
              </small>
            </div>
          ))}
          {milestones.length === 0 && (
            <div className="design-empty">Проблемных вех нет.</div>
          )}
        </div>
      </article>
      <article className="design-panel problem-side">
        <PanelTitle icon={<GitBranch size={18} />} title="Факторы влияния" />
        <div className="problem-factor-list">
          {dashboard.scheduleDelayItems.map(({ item, delay }: any) => (
            <div key={item.id}>
              <b>{item.title}</b>
              <span>+{delay} календарных дней</span>
            </div>
          ))}
          {dashboard.redZoneRisks.map((item: any) => (
            <div key={item.id}>
              <b>{item.title}</b>
              <span>RAID score {item.riskScore}</span>
            </div>
          ))}
          {dashboard.scheduleDelayItems.length === 0 &&
            dashboard.redZoneRisks.length === 0 && (
              <div className="design-empty">Нет факторов в красной зоне.</div>
            )}
        </div>
      </article>
    </div>
  );
}

function MilestoneRail({
  milestones,
  title,
}: {
  milestones: MilestoneTimelineItem[];
  title: string;
}) {
  return (
    <aside className="milestone-rail">
      <PanelTitle icon={<Clock3 size={18} />} title={title} />
      {milestones.map((entry, index) => (
        <div className={`milestone-rail-row ${entry.state.tone}`} key={entry.milestone.id}>
          <span>{index + 1}</span>
          <div>
            <b>{entry.milestone.title}</b>
            <small>{shortDate(entry.milestone.dueDate)}</small>
          </div>
        </div>
      ))}
      {milestones.length === 0 && (
        <div className="design-empty">Вехи для отображения не найдены.</div>
      )}
    </aside>
  );
}

function MetricTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <article className="metric-tile">
      <span>{icon}</span>
      <small>{label}</small>
      <b>{value}</b>
    </article>
  );
}

function PanelTitle({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="design-panel-title">
      <span>{icon}</span>
      <h3>{title}</h3>
    </div>
  );
}

function daysLeftLabel(days: number) {
  if (days < 0) return `просрочено на ${Math.abs(days)} дн.`;
  if (days === 0) return "сегодня";
  return `через ${days} дн.`;
}
