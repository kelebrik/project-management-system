import type { ProjectListItem, WbsItem } from "./domainTypes";

export type PortfolioRoadmapTrackId = "HW" | "SW" | "G2M";
export type PortfolioRoadmapRange = 6 | 12 | 24;

type PhaseDefinition = {
  id: string;
  label: string;
  description: string;
  color: string;
  patterns: RegExp[];
  isStructureFallback?: boolean;
};

export type PortfolioRoadmapPhase = Omit<PhaseDefinition, "patterns">;

export type PortfolioRoadmapTrackDefinition = {
  id: PortfolioRoadmapTrackId;
  label: string;
  phases: PortfolioRoadmapPhase[];
};

export type PortfolioRoadmapSegment = {
  id: string;
  phaseId: string;
  code: string;
  label: string;
  legendLabel: string;
  description: string;
  color: string;
  isStructureFallback: boolean;
  startDate: string;
  endDate: string;
  offset: number;
  width: number;
  itemCount: number;
  progress: number;
  row: number;
};

/** A milestone drawn as a labelled marker on the time axis of its own phase. */
export type PortfolioRoadmapMilestone = {
  id: string;
  code: string;
  label: string;
  date: string;
  offset: number;
  isComplete: boolean;
  showLabel: boolean;
};

export type PortfolioRoadmapPhaseRow = {
  id: string;
  code: string;
  label: string;
  color: string;
  segments: PortfolioRoadmapSegment[];
  milestones: PortfolioRoadmapMilestone[];
  laneCount: number;
};

export type PortfolioRoadmapProject = {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectManager: string;
  rag: ProjectListItem["rag"];
  phases: PortfolioRoadmapPhaseRow[];
};

type PortfolioRoadmapWbsItem = Pick<
  WbsItem,
  | "id"
  | "parentId"
  | "code"
  | "title"
  | "type"
  | "status"
  | "startDate"
  | "dueDate"
  | "forecastStartDate"
  | "forecastDueDate"
  | "progress"
  | "sortOrder"
>;

export type PortfolioRoadmapSourceProject = Pick<
  ProjectListItem,
  | "id"
  | "code"
  | "name"
  | "portfolio"
  | "projectManager"
  | "status"
  | "rag"
  | "sortOrder"
> & {
  businessUnit: Pick<ProjectListItem["businessUnit"], "id" | "code" | "name">;
  wbsItems?: PortfolioRoadmapWbsItem[];
};

type PreparedSegment = {
  id: string;
  phaseId: string;
  code: string;
  label: string;
  legendLabel: string;
  description: string;
  color: string;
  isStructureFallback: boolean;
  phaseSortOrder: number;
  sortOrder: number;
  start: Date;
  end: Date;
  itemCount: number;
  progress: number;
};

type PreparedMilestone = {
  id: string;
  phaseId: string;
  code: string;
  label: string;
  date: Date;
  isComplete: boolean;
};

type PreparedPhase = {
  id: string;
  code: string;
  label: string;
  color: string;
  sortOrder: number;
};

export type PreparedPortfolioRoadmapProject = {
  portfolio: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectManager: string;
  rag: ProjectListItem["rag"];
  sortOrder: number;
  phases: PreparedPhase[];
  segments: PreparedSegment[];
  milestones: PreparedMilestone[];
  launchWindows: Array<{ start: Date; end: Date }>;
};

export type PortfolioRoadmapModel = {
  startDate: Date;
  endDate: Date;
  monthCount: number;
  months: Array<{
    key: string;
    label: string;
    isCurrent: boolean;
  }>;
  quarters: Array<{
    key: string;
    label: string;
    startIndex: number;
    monthSpan: number;
  }>;
  todayOffset: number | null;
  groups: Array<{
    name: string;
    projects: PortfolioRoadmapProject[];
  }>;
  projectCount: number;
  mappedProjectCount: number;
  unmappedProjectCount: number;
  launchProjectCount: number;
};



const MONTH_LABELS = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
];
const MIN_SEGMENT_SLOT_PX = 27;
const MIN_RESPONSIVE_MONTH_WIDTH_PX = 40;


/** Below this horizontal gap two captions would overlap, so the later one is dropped. */
const MILESTONE_LABEL_GAP_PERCENT = 9;

/** Row for work that sits outside any phase of the project structure. */
const UNPHASED_ROW_LABEL = "Вне фаз";

const PHASE_COLORS = [
  "#2f6b8f",
  "#3f855e",
  "#8d5b2f",
  "#6a4b8c",
  "#8c2f4a",
  "#2f7d7d",
  "#7a6b2a",
  "#4a5b8c",
] as const;

/**
 * Colour follows the phase name rather than its position, so adding a phase in
 * the middle of a project does not repaint every row after it.
 */
export function portfolioRoadmapPhaseColor(label: string) {
  let hash = 0;
  for (const char of label.trim().toLocaleLowerCase("ru-RU")) {
    hash = (hash * 31 + char.codePointAt(0)!) % 1_000_003;
  }
  return PHASE_COLORS[hash % PHASE_COLORS.length];
}

function normalize(value: string) {
  return value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, count: number) {
  return new Date(value.getFullYear(), value.getMonth() + count, 1);
}

function addDays(value: Date, count: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + count);
}

function isoDay(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function pathForItem(
  item: PortfolioRoadmapWbsItem,
  itemsById: Map<string, PortfolioRoadmapWbsItem>,
  parentIdByItemId: Map<string, string | null>,
) {
  const path = [item];
  const visited = new Set([item.id]);
  let current = item;
  let parentId = parentIdByItemId.get(current.id) ?? null;
  while (parentId) {
    const parent = itemsById.get(parentId);
    if (!parent || visited.has(parent.id)) break;
    path.push(parent);
    visited.add(parent.id);
    current = parent;
    parentId = parentIdByItemId.get(current.id) ?? null;
  }
  return path;
}

function resolvedParentIds(items: PortfolioRoadmapWbsItem[]) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByCode = new Map(items.map((item) => [item.code, item]));
  return new Map(
    items.map((item) => {
      const codeParts = item.code.split(".").filter(Boolean);
      const parentCode = codeParts.length > 1
        ? codeParts.slice(0, -1).join(".")
        : null;
      const parentByCode = parentCode ? itemsByCode.get(parentCode) : null;
      const parentId = parentByCode?.id ?? (
        item.parentId && item.parentId !== item.id && itemsById.has(item.parentId)
          ? item.parentId
          : null
      );
      return [item.id, parentId] as const;
    }),
  );
}





function scheduleForItem(item: PortfolioRoadmapWbsItem) {
  const hasForecast = Boolean(item.forecastStartDate && item.forecastDueDate);
  const start = validDate(hasForecast ? item.forecastStartDate : item.startDate);
  const end = validDate(hasForecast ? item.forecastDueDate : item.dueDate);
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

type ScheduleSummary = {
  start: Date;
  end: Date;
  progress: number;
  progressTotal: number;
  progressWeight: number;
};

function scheduleForGroup(
  item: PortfolioRoadmapWbsItem,
  childrenByParentId: Map<string, PortfolioRoadmapWbsItem[]>,
  cache: Map<string, ScheduleSummary | null>,
  trail = new Set<string>(),
): ScheduleSummary | null {
  if (cache.has(item.id)) return cache.get(item.id) ?? null;
  if (trail.has(item.id)) return null;
  const ownSchedule = scheduleForItem(item);
  if (ownSchedule) {
    const progressWeight = calendarDayWeight(ownSchedule.start, ownSchedule.end);
    const result = {
      ...ownSchedule,
      progress: item.progress,
      progressTotal: item.progress * progressWeight,
      progressWeight,
    };
    cache.set(item.id, result);
    return result;
  }

  const nextTrail = new Set(trail).add(item.id);
  const childSchedules = (childrenByParentId.get(item.id) ?? [])
    .filter((child) => child.status !== "CANCELLED" && !nextTrail.has(child.id))
    .map((child) => scheduleForGroup(child, childrenByParentId, cache, nextTrail))
    .filter((schedule): schedule is ScheduleSummary => schedule !== null);
  if (childSchedules.length === 0) {
    cache.set(item.id, null);
    return null;
  }

  const progressTotal = childSchedules.reduce(
    (total, schedule) => total + schedule.progressTotal,
    0,
  );
  const progressWeight = childSchedules.reduce(
    (total, schedule) => total + schedule.progressWeight,
    0,
  );
  const result = {
    start: new Date(Math.min(...childSchedules.map((schedule) => schedule.start.getTime()))),
    end: new Date(Math.max(...childSchedules.map((schedule) => schedule.end.getTime()))),
    progress: Math.round(progressTotal / progressWeight),
    progressTotal,
    progressWeight,
  };
  cache.set(item.id, result);
  return result;
}

function descendantCountForItem(
  item: PortfolioRoadmapWbsItem,
  childrenByParentId: Map<string, PortfolioRoadmapWbsItem[]>,
  cache: Map<string, number>,
  trail = new Set<string>(),
): number {
  const cached = cache.get(item.id);
  if (cached !== undefined) return cached;
  if (trail.has(item.id)) return 0;

  const nextTrail = new Set(trail).add(item.id);
  let count = 0;
  for (const child of childrenByParentId.get(item.id) ?? []) {
    if (child.status === "CANCELLED" || nextTrail.has(child.id)) continue;
    count += 1 + descendantCountForItem(
      child,
      childrenByParentId,
      cache,
      nextTrail,
    );
  }
  cache.set(item.id, count);
  return count;
}

function portfolioName(project: PortfolioRoadmapSourceProject) {
  return project.portfolio.trim() || project.businessUnit?.name?.trim() || "Без портфеля";
}

export function portfolioRoadmapPortfolioName(project: PortfolioRoadmapSourceProject) {
  return portfolioName(project);
}

function calendarDayWeight(start: Date, end: Date) {
  return Math.max(
    1,
    Math.round((addDays(end, 1).getTime() - start.getTime()) / 86_400_000),
  );
}

export function preparePortfolioRoadmapProjects(
  projects: PortfolioRoadmapSourceProject[],
): PreparedPortfolioRoadmapProject[] {
  return projects
    .filter((project) => project.status !== "CLOSED")
    .map((project) => {
      const wbsItems = project.wbsItems ?? [];
      const itemsById = new Map(wbsItems.map((item) => [item.id, item]));
      const parentIdByItemId = resolvedParentIds(wbsItems);
      const childrenByParentId = new Map<string, PortfolioRoadmapWbsItem[]>();
      for (const item of wbsItems) {
        const parentId = parentIdByItemId.get(item.id);
        if (!parentId) continue;
        const siblings = childrenByParentId.get(parentId);
        if (siblings) siblings.push(item);
        else childrenByParentId.set(parentId, [item]);
      }
      const scheduleCache = new Map<string, ScheduleSummary | null>();
      const descendantCountCache = new Map<string, number>();
      const pathsByItemId = new Map(
        wbsItems.map((item) => [
          item.id,
          pathForItem(item, itemsById, parentIdByItemId),
        ]),
      );
      const launchWindows: Array<{ start: Date; end: Date }> = [];
      for (const item of wbsItems) {
        if (item.status === "CANCELLED") continue;
        const schedule = scheduleForItem(item);
        if (!schedule) continue;
        const path = pathsByItemId.get(item.id)!;
        if (path.some((pathItem) => pathItem.status === "CANCELLED")) continue;
        const phase = path.find((pathItem) => pathItem.type === "PHASE");
        if (phase && isLaunchPhaseTitle(phase.title)) {
          launchWindows.push(schedule);
        }
      }
      // Rows come from the project itself: the phase a work package sits under,
      // rather than a name pattern matched against a fixed list of tracks.
      const owningPhase = (itemId: string) => {
        const path = pathsByItemId.get(itemId);
        return path?.find((pathItem) => pathItem.type === "PHASE") ?? null;
      };
      // Work outside any phase still belongs on the roadmap; it gets a row of its
      // own rather than disappearing.
      const unphasedRow: PreparedPhase = {
        id: `${project.id}:unphased`,
        code: "",
        label: UNPHASED_ROW_LABEL,
        color: portfolioRoadmapPhaseColor(UNPHASED_ROW_LABEL),
        sortOrder: Number.MAX_SAFE_INTEGER,
      };
      let usesUnphasedRow = false;
      const phaseById = new Map<string, PreparedPhase>();
      const rememberPhase = (phase: PortfolioRoadmapWbsItem) => {
        if (phaseById.has(phase.id)) return;
        phaseById.set(phase.id, {
          id: phase.id,
          code: phase.code,
          label: phase.title,
          color: portfolioRoadmapPhaseColor(phase.title),
          sortOrder: phase.sortOrder,
        });
      };

      const segments: PreparedSegment[] = [];
      for (const item of wbsItems) {
        if (item.status === "CANCELLED") continue;
        if (item.type !== "WORK_PACKAGE") continue;
        const path = pathsByItemId.get(item.id)!;
        if (path.some((pathItem) => pathItem.status === "CANCELLED")) continue;
        if (path.slice(1).some((pathItem) => pathItem.type === "WORK_PACKAGE")) {
          continue;
        }
        const schedule = scheduleForGroup(item, childrenByParentId, scheduleCache);
        if (!schedule) continue;
        const phase = owningPhase(item.id);
        if (phase) rememberPhase(phase);
        else usesUnphasedRow = true;
        const row = phase ? phaseById.get(phase.id)! : unphasedRow;
        segments.push({
          id: `${project.id}:${item.id}`,
          phaseId: row.id,
          code: item.code,
          label: item.title,
          legendLabel: row.label,
          description: row.label,
          color: row.color,
          isStructureFallback: !phase,
          phaseSortOrder: row.sortOrder,
          sortOrder: item.sortOrder,
          start: schedule.start,
          end: schedule.end,
          itemCount: 1 + descendantCountForItem(
            item,
            childrenByParentId,
            descendantCountCache,
          ),
          progress: schedule.progress,
        });
      }

      // A milestone is drawn on the axis of the phase that owns it, so the marker
      // keeps its connection to the work it closes.
      const milestones: PreparedMilestone[] = [];
      for (const item of wbsItems) {
        if (item.type !== "MILESTONE") continue;
        if (item.status === "CANCELLED") continue;
        const path = pathsByItemId.get(item.id)!;
        if (path.some((pathItem) => pathItem.status === "CANCELLED")) continue;
        const phase = owningPhase(item.id);
        if (!phase) continue;
        const schedule = scheduleForItem(item);
        if (!schedule) continue;
        rememberPhase(phase);
        milestones.push({
          id: `${project.id}:${item.id}`,
          phaseId: phase.id,
          code: item.code,
          label: item.title,
          date: schedule.start,
          isComplete: item.status === "DONE",
        });
      }

      if (usesUnphasedRow) phaseById.set(unphasedRow.id, unphasedRow);
      const phases = [...phaseById.values()].sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.code.localeCompare(right.code, "ru"),
      );

      return {
        portfolio: portfolioName(project),
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        projectManager: project.projectManager,
        rag: project.rag,
        sortOrder: project.sortOrder,
        phases,
        segments,
        milestones,
        launchWindows,
      };
    })
    .sort(
      (left, right) =>
        left.portfolio.localeCompare(right.portfolio, "ru") ||
        left.sortOrder - right.sortOrder ||
        left.projectName.localeCompare(right.projectName, "ru"),
    );
}

function monthPosition(value: Date, startDate: Date) {
  const monthStart = startOfMonth(value);
  const nextMonth = addMonths(monthStart, 1);
  const wholeMonths =
    (monthStart.getFullYear() - startDate.getFullYear()) * 12 +
    monthStart.getMonth() -
    startDate.getMonth();
  const fraction =
    (value.getTime() - monthStart.getTime()) /
    (nextMonth.getTime() - monthStart.getTime());
  return wholeMonths + fraction;
}

function buildProject(
  project: PreparedPortfolioRoadmapProject,
  startDate: Date,
  endDate: Date,
  range: PortfolioRoadmapRange,
): PortfolioRoadmapProject {
  const minWidthPercent =
    (MIN_SEGMENT_SLOT_PX / (range * MIN_RESPONSIVE_MONTH_WIDTH_PX)) * 100;
  return {
    projectId: project.projectId,
    projectCode: project.projectCode,
    projectName: project.projectName,
    projectManager: project.projectManager,
    rag: project.rag,
    phases: project.phases.map((phase) => {
      const rowEnds: number[] = [];
      const segments = project.segments
        .filter(
          (segment) =>
            segment.phaseId === phase.id &&
            segment.end >= startDate &&
            segment.start < endDate,
        )
        .sort(
          (left, right) =>
            left.start.getTime() - right.start.getTime() ||
            left.sortOrder - right.sortOrder,
        )
        .map((segment) => {
          const clippedStart = segment.start < startDate ? startDate : segment.start;
          const rawEnd = addDays(segment.end, 1);
          const clippedEnd = rawEnd > endDate ? endDate : rawEnd;
          const startPosition = Math.max(0, monthPosition(clippedStart, startDate));
          const endPosition = Math.min(range, monthPosition(clippedEnd, startDate));
          const width = Math.max(
            minWidthPercent,
            ((endPosition - startPosition) / range) * 100,
          );
          const offset = Math.min((startPosition / range) * 100, 100 - width);
          // Touching boundaries round independently; 1e-9 percentage points is far below one day.
          const rowTouchEpsilon = 1e-9;
          let row = rowEnds.findIndex((rowEnd) => rowEnd <= offset + rowTouchEpsilon);
          if (row === -1) row = rowEnds.length;
          rowEnds[row] = offset + width;
          return {
            id: segment.id,
            phaseId: segment.phaseId,
            code: segment.code,
            label: segment.label,
            legendLabel: segment.legendLabel,
            description: segment.description,
            color: segment.color,
            isStructureFallback: segment.isStructureFallback,
            startDate: isoDay(segment.start),
            endDate: isoDay(segment.end),
            offset,
            width,
            itemCount: segment.itemCount,
            progress: segment.progress,
            row,
          };
        });
      const milestones = project.milestones
        .filter(
          (milestone) =>
            milestone.phaseId === phase.id &&
            milestone.date >= startDate &&
            milestone.date < endDate,
        )
        .sort((left, right) => left.date.getTime() - right.date.getTime())
        .reduce<PortfolioRoadmapMilestone[]>((placed, milestone) => {
          const offset = (monthPosition(milestone.date, startDate) / range) * 100;
          const lastLabelled = [...placed].reverse().find((entry) => entry.showLabel);
          placed.push({
            id: milestone.id,
            code: milestone.code,
            label: milestone.label,
            date: isoDay(milestone.date),
            offset,
            isComplete: milestone.isComplete,
            showLabel:
              !lastLabelled || offset - lastLabelled.offset >= MILESTONE_LABEL_GAP_PERCENT,
          });
          return placed;
        }, []);
      // Milestone captions need a strip of their own, otherwise they sit on top
      // of the first row of packages.
      const milestoneRows = milestones.length > 0 ? 1 : 0;
      return {
        id: phase.id,
        code: phase.code,
        label: phase.label,
        color: phase.color,
        segments: segments.map((segment) => ({
          ...segment,
          row: segment.row + milestoneRows,
        })),
        milestones,
        laneCount: Math.max(1, rowEnds.length) + milestoneRows,
      };
    }),
  };
}

/** Phases that represent a launch, however the project happens to name them. */
const LAUNCH_PHASE_PATTERNS = [
  "запуск",
  "go-live",
  "golive",
  "launch",
  "release",
  "вывод на рынок",
  "передача",
  "handover",
];

function isLaunchPhaseTitle(title: string) {
  const normalized = normalize(title);
  return LAUNCH_PHASE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function createPortfolioRoadmap(
  projects: PreparedPortfolioRoadmapProject[],
  range: PortfolioRoadmapRange = 12,
  today = new Date(),
): PortfolioRoadmapModel {
  const startDate = new Date(
    today.getFullYear(),
    Math.floor(today.getMonth() / 3) * 3,
    1,
  );
  const endDate = addMonths(startDate, range);
  const currentMonth = startOfMonth(today).getTime();
  const months = Array.from({ length: range }, (_, index) => {
    const month = addMonths(startDate, index);
    return {
      key: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_LABELS[month.getMonth()]}'${String(month.getFullYear()).slice(-2)}`,
      isCurrent: month.getTime() === currentMonth,
    };
  });
  const quarters = Array.from({ length: Math.ceil(range / 3) }, (_, index) => {
    const quarterStart = addMonths(startDate, index * 3);
    return {
      key: `${quarterStart.getFullYear()}-Q${Math.floor(quarterStart.getMonth() / 3) + 1}`,
      label: `Q${Math.floor(quarterStart.getMonth() / 3) + 1} ${quarterStart.getFullYear()}`,
      startIndex: index * 3,
      monthSpan: Math.min(3, range - index * 3),
    };
  });
  const todayOffset = today >= startDate && today < endDate
    ? (monthPosition(today, startDate) / range) * 100
    : null;
  const roadmapProjects = projects.map((project) => ({
    portfolio: project.portfolio,
    roadmap: buildProject(project, startDate, endDate, range),
  }));
  const groupsByName = new Map<string, PortfolioRoadmapProject[]>();
  for (const entry of roadmapProjects) {
    groupsByName.set(entry.portfolio, [
      ...(groupsByName.get(entry.portfolio) ?? []),
      entry.roadmap,
    ]);
  }
  const groups = Array.from(groupsByName, ([name, groupProjects]) => ({
    name,
    projects: groupProjects,
  }));
  const mappedProjectCount = projects.filter((project) => project.segments.length > 0).length;
  const comparisonToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const nextYear = new Date(
    comparisonToday.getFullYear(),
    comparisonToday.getMonth() + 12,
    comparisonToday.getDate(),
  );
  const launchProjectCount = projects.filter((project) =>
    project.launchWindows.some(
      (window) =>
        window.end >= comparisonToday &&
        window.start <= nextYear,
    ),
  ).length;

  return {
    startDate,
    endDate,
    monthCount: range,
    months,
    quarters,
    todayOffset,
    groups,
    projectCount: roadmapProjects.length,
    mappedProjectCount,
    unmappedProjectCount: roadmapProjects.length - mappedProjectCount,
    launchProjectCount,
  };
}

export function portfolioRoadmapDateLabel(value: string) {
  const parsed = validDate(value);
  return parsed
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(parsed)
    : value;
}
