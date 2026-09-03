import type { ProjectListItem, WbsItem } from "./domainTypes";

export type PortfolioRoadmapTrackId = "HW" | "SW" | "G2M";
export type PortfolioRoadmapRange = 12 | 24 | 36;

type PhaseDefinition = {
  id: string;
  label: string;
  description: string;
  color: string;
  patterns: RegExp[];
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
  label: string;
  description: string;
  color: string;
  startDate: string;
  endDate: string;
  offset: number;
  width: number;
  itemCount: number;
  progress: number;
  row: number;
};

export type PortfolioRoadmapProject = {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectManager: string;
  rag: ProjectListItem["rag"];
  tracks: Array<{
    id: PortfolioRoadmapTrackId;
    label: string;
    segments: PortfolioRoadmapSegment[];
    laneCount: number;
  }>;
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
  trackId: PortfolioRoadmapTrackId;
  phase: PhaseDefinition;
  phaseIndex: number;
  start: Date;
  end: Date;
  itemCount: number;
  progress: number;
  progressTotal: number;
  progressWeight: number;
};

type ClassifiedCandidate = {
  itemId: string;
  parentId: string | null;
  phaseKey: string;
  segment: PreparedSegment;
};

export type PreparedPortfolioRoadmapProject = {
  portfolio: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectManager: string;
  rag: ProjectListItem["rag"];
  sortOrder: number;
  segments: PreparedSegment[];
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

const TRACK_PHASES: Record<PortfolioRoadmapTrackId, PhaseDefinition[]> = {
  HW: [
    {
      id: "hw-concept",
      label: "Concept",
      description: "Фиксация продуктовой и технической концепции.",
      color: "#e0e0e0",
      patterns: [/concept/i, /концепт/i, /концепц/i],
    },
    {
      id: "hw-requirements",
      label: "Req",
      description: "Фиксация требований к аппаратной части.",
      color: "#c6ddf7",
      patterns: [/prod\.?\s*req/i, /requirement/i, /требован/i, /\bprd\b/i, /\brfq\b/i, /документац/i],
    },
    {
      id: "hw-design",
      label: "Design",
      description: "Фиксация конструкции, промышленного дизайна и CMF.",
      color: "#add8d1",
      patterns: [/design/i, /дизайн/i, /\bcmf\b/i, /проектирован/i, /architecture/i, /архитект/i],
    },
    {
      id: "hw-es",
      label: "ES",
      description: "Инженерный образец и фиксация архитектуры.",
      color: "#fccc93",
      patterns: [/engineering sample/i, /eng\.?\s*sample/i, /\bhw\s*es\d*\b/i, /\bes\d+\b/i, /образц/i, /prototype/i, /прототип/i],
    },
    {
      id: "hw-evt",
      label: "EVT",
      description: "Engineering Validation Test.",
      color: "#fccc93",
      patterns: [/\bevt\d*\b/i, /eng\.?\s*valid/i],
    },
    {
      id: "hw-dvt",
      label: "DVT",
      description: "Design Validation Test.",
      color: "#f79e60",
      patterns: [/\bdvt\d*\b/i, /des\.?\s*valid/i],
    },
    {
      id: "hw-pvt",
      label: "PVT",
      description: "Production Validation Test.",
      color: "#f9d866",
      patterns: [/\bpvt\b/i, /prod\.?\s*valid/i],
    },
    {
      id: "hw-mp",
      label: "MP",
      description: "Готовность к массовому производству.",
      color: "#add8d1",
      patterns: [/mass production/i, /массов.*производ/i, /серийн.*производ/i, /готов.*производ/i, /(^|[^a-z])mp([^a-z]|$)/i],
    },
    {
      id: "hw-launch",
      label: "Launch",
      description: "Коммерческий запуск продукта.",
      color: "#449e59",
      patterns: [/mp\s*launch/i, /commercial launch/i, /launch/i, /старт продаж/i, /выход.*рын/i],
    },
    {
      id: "hw-run-change",
      label: "Run-Chg",
      description: "Доработки существующего продукта по замечаниям рынка.",
      color: "#ead1dc",
      patterns: [/run[\s-]*ch/i, /доработ/i, /sustain/i],
    },
  ],
  SW: [
    {
      id: "sw-feasibility",
      label: "Feasibility",
      description: "Оценка реализуемости.",
      color: "#e0e0e0",
      patterns: [/feasibility/i, /реализуемост/i, /технико.*эконом/i],
    },
    {
      id: "sw-specification",
      label: "Specification",
      description: "Описание и фиксация требований.",
      color: "#d8edfc",
      patterns: [/specification/i, /\bspec\b/i, /prod\.?\s*req/i, /требован/i, /feature list/i],
    },
    {
      id: "sw-architecture",
      label: "Architecture",
      description: "Архитектура программного решения.",
      color: "#c6ccf2",
      patterns: [/architecture/i, /\barchy\b/i, /\bsw[\s-]*arch/i, /архитект/i],
    },
    {
      id: "sw-bring-up",
      label: "Bring-up",
      description: "Старт прошивки на образце и запуск базовой периферии.",
      color: "#fccc93",
      patterns: [/bring[\s-]*up/i, /ожив/i, /первая сборка/i, /старт.*(?:staros|homeos|прошив)/i],
    },
    {
      id: "sw-alpha",
      label: "Alpha",
      description: "Неполный набор функций на EVT-образцах и внутренний догфудинг.",
      color: "#fcddb2",
      patterns: [/\balpha\b/i, /\bальфа\b/i],
    },
    {
      id: "sw-beta",
      label: "Beta",
      description: "Feature-complete, бета на устройствах и подготовка релиза.",
      color: "#cceac6",
      patterns: [/\bbeta\b/i, /\bбета\b/i, /регрессион/i, /регресс/i],
    },
    {
      id: "sw-rc",
      label: "MP FW - RC",
      description: "Кандидат MP-прошивки проверен на PVT-устройствах.",
      color: "#fced9e",
      patterns: [/release candidate/i, /\bfw[\s-]*rc\b/i, /\bsw\s*rc\b/i, /кандидат.*прошив/i, /подготовка.*\brc\b/i],
    },
    {
      id: "sw-mp-ota",
      label: "MP FW + 1st OTA",
      description: "Заводская MP-прошивка и стабилизация первого OTA.",
      color: "#cceac6",
      patterns: [/mp\s*fw.*ota/i, /1st\s*ota/i, /перв.*ota/i, /релиз по/i, /релиз программ/i, /заводск.*(?:прошив|сборк)/i],
    },
    {
      id: "sw-launch",
      label: "Launch",
      description: "Получение первого OTA пользователями и переход в поддержку.",
      color: "#449e59",
      patterns: [/launch/i, /получение.*ota/i, /переход.*поддерж/i],
    },
  ],
  G2M: [
    {
      id: "g2m-vision",
      label: "Product Vision, Positioning & Design Concept",
      description: "Стратегия, целевая аудитория, нейминг и дизайн-концепция продукта и упаковки.",
      color: "#d9ead3",
      patterns: [/product vision/i, /positioning/i, /design concept/i, /позиционирован/i, /целевая аудит/i, /нейминг/i],
    },
    {
      id: "g2m-plan",
      label: "Integrated GTM Plan Development",
      description: "Сводный план сроков и ресурсов на основании вех HW и SW.",
      color: "#b6d7a8",
      patterns: [/integrated.*(?:gtm|g2m).*plan/i, /gtm[\s-]*plan/i, /сводн.*план/i],
    },
    {
      id: "g2m-strategy",
      label: "Marketing & Commercial Strategy",
      description: "План продвижения и дистрибуции, каналы, продажи и ценообразование.",
      color: "#b7e0ad",
      patterns: [/marketing.*commercial strategy/i, /маркетингов.*стратег/i, /план продвижен/i, /ценообразован/i],
    },
    {
      id: "g2m-content",
      label: "Content Creation & Approval",
      description: "Состав и согласование инструкций, лендингов, рендеров, видео, POS-материалов и мерча.",
      color: "#93c47d",
      patterns: [/content creation/i, /контент/i, /артефакт/i, /pos[\s-]*материал/i],
    },
    {
      id: "g2m-assets",
      label: "Marketing & Support Asset Production",
      description: "Производство рыночных и support-материалов, сертификация и маркировка.",
      color: "#f7ccd8",
      patterns: [/support asset/i, /asset production/i, /сертификац/i, /маркировк/i, /материал.*поддерж/i],
    },
    {
      id: "g2m-training",
      label: "Training and Demo Activities",
      description: "Обучение полей и поддержки, туториалы и демонстрации.",
      color: "#ea9999",
      patterns: [/training/i, /demo activit/i, /обучен/i, /туториал/i, /демо/i],
    },
    {
      id: "g2m-pre-launch",
      label: "Pre-Launch Alignment & Announcement Planning",
      description: "Финальная калибровка стратегии, дата анонса и чек-листы готовности.",
      color: "#ed6b72",
      patterns: [/pre[\s-]*launch/i, /announcement planning/i, /дата анонс/i, /чек[\s-]*лист.*готов/i, /sales[\s-]*rdy/i],
    },
    {
      id: "g2m-launch",
      label: "Market Launch & Start of Sales",
      description: "Анонс, старт продаж, рекламной кампании и поддержки.",
      color: "#34a853",
      patterns: [/market launch/i, /start of sales/i, /go[\s-]*live/i, /mp\s*launch/i, /старт продаж/i, /запуск.*(?:продаж|реклам)/i],
    },
    {
      id: "g2m-post-launch",
      label: "Post-Launch Analysis, Retrospective & Handover",
      description: "Продажи, PR и отзывы, ретроспектива и передача продукта в поддержку.",
      color: "#fff2cc",
      patterns: [/post[\s-]*launch/i, /retrospective/i, /handover/i, /ретроспектив/i, /передач.*поддерж/i, /lessons learned/i],
    },
  ],
};

const TRACK_LABELS: Record<PortfolioRoadmapTrackId, string> = {
  HW: "HW",
  SW: "SW",
  G2M: "G2M",
};

const TRACK_IDS: PortfolioRoadmapTrackId[] = ["HW", "SW", "G2M"];

const TRACK_PATTERNS: Record<PortfolioRoadmapTrackId, RegExp[]> = {
  HW: [/аппарат/i, /hardware/i, /(^|[^a-z])hw([^a-z]|$)/i, /желез/i, /\bpcba\b/i],
  SW: [/программ/i, /software/i, /(^|[^a-z])sw([^a-z]|$)/i, /firmware/i, /прошив/i, /\bota\b/i, /staros/i, /homeos/i],
  G2M: [
    /\bg2m\b/i,
    /\bgtm\b/i,
    /go[\s-]*to[\s-]*market/i,
    /market launch/i,
    /start of sales/i,
    /pre[\s-]*launch/i,
    /post[\s-]*launch/i,
    /announcement planning/i,
    /handover/i,
    /старт продаж/i,
    /вывод.*рын/i,
    /маркет/i,
    /коммерчес/i,
    /дистрибуц/i,
  ],
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
const MIN_SEGMENT_TARGET_PX = 24;
const MIN_RESPONSIVE_MONTH_WIDTH_PX = 78;

export const PORTFOLIO_ROADMAP_TRACKS: PortfolioRoadmapTrackDefinition[] =
  TRACK_IDS.map((id) => ({
    id,
    label: TRACK_LABELS[id],
    phases: TRACK_PHASES[id].map((phase) => ({
      id: phase.id,
      label: phase.label,
      description: phase.description,
      color: phase.color,
    })),
  }));

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
) {
  const path = [item];
  const visited = new Set([item.id]);
  let current = item;
  while (current.parentId) {
    const parent = itemsById.get(current.parentId);
    if (!parent || visited.has(parent.id)) break;
    path.push(parent);
    visited.add(parent.id);
    current = parent;
  }
  return path;
}

function matchingTrack(title: string) {
  const normalized = normalize(title);
  return TRACK_IDS.find((trackId) =>
    TRACK_PATTERNS[trackId].some((pattern) => pattern.test(normalized)),
  ) ?? null;
}

function trackForPath(path: PortfolioRoadmapWbsItem[]) {
  for (const item of path.slice(1)) {
    const track = matchingTrack(item.title);
    if (track) return track;
  }
  return matchingTrack(path[0]?.title ?? "");
}

function phaseForPath(
  trackId: PortfolioRoadmapTrackId,
  path: PortfolioRoadmapWbsItem[],
) {
  const phases = TRACK_PHASES[trackId];
  for (const item of path) {
    const title = normalize(item.title);
    for (let index = phases.length - 1; index >= 0; index -= 1) {
      if (phases[index].patterns.some((pattern) => pattern.test(title))) {
        return { phase: phases[index], index };
      }
    }
  }
  return null;
}

function scheduleForItem(item: PortfolioRoadmapWbsItem) {
  const hasForecast = Boolean(item.forecastStartDate && item.forecastDueDate);
  const start = validDate(hasForecast ? item.forecastStartDate : item.startDate);
  const end = validDate(hasForecast ? item.forecastDueDate : item.dueDate);
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
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

function mergeConnectedSegments(segments: PreparedSegment[]) {
  const merged: PreparedSegment[] = [];
  for (const segment of [...segments].sort((left, right) =>
    left.start.getTime() - right.start.getTime(),
  )) {
    const previous = merged.at(-1);
    if (!previous || segment.start > addDays(previous.end, 1)) {
      merged.push({ ...segment });
      continue;
    }
    previous.progressTotal += segment.progressTotal;
    previous.progressWeight += segment.progressWeight;
    previous.progress = Math.round(previous.progressTotal / previous.progressWeight);
    if (segment.end > previous.end) previous.end = segment.end;
    previous.itemCount += segment.itemCount;
  }
  return merged.map((segment, index) => ({
    ...segment,
    id: `${segment.id}:${index}`,
  }));
}

export function preparePortfolioRoadmapProjects(
  projects: PortfolioRoadmapSourceProject[],
): PreparedPortfolioRoadmapProject[] {
  return projects
    .filter((project) => project.status !== "CLOSED")
    .map((project) => {
      const wbsItems = project.wbsItems ?? [];
      const itemsById = new Map(wbsItems.map((item) => [item.id, item]));
      const candidates: ClassifiedCandidate[] = [];
      const segmentsByPhase = new Map<string, PreparedSegment[]>();
      for (const item of wbsItems) {
        if (item.status === "CANCELLED") continue;
        const schedule = scheduleForItem(item);
        if (!schedule) continue;
        const path = pathForItem(item, itemsById);
        const trackId = trackForPath(path);
        if (!trackId) continue;
        const phaseMatch = phaseForPath(trackId, path);
        if (!phaseMatch) continue;
        const key = `${trackId}:${phaseMatch.phase.id}`;
        const progressWeight = calendarDayWeight(schedule.start, schedule.end);
        candidates.push({
          itemId: item.id,
          parentId: item.parentId,
          phaseKey: key,
          segment: {
            id: `${project.id}:${key}:${item.id}`,
            trackId,
            phase: phaseMatch.phase,
            phaseIndex: phaseMatch.index,
            start: schedule.start,
            end: schedule.end,
            itemCount: 1,
            progress: item.progress,
            progressTotal: item.progress * progressWeight,
            progressWeight,
          },
        });
      }
      const candidateByItemId = new Map(
        candidates.map((candidate) => [candidate.itemId, candidate]),
      );
      const supersededItemIds = new Set<string>();
      for (const candidate of candidates) {
        const visited = new Set([candidate.itemId]);
        let parentId = candidate.parentId;
        while (parentId && !visited.has(parentId)) {
          visited.add(parentId);
          const parentCandidate = candidateByItemId.get(parentId);
          if (parentCandidate?.phaseKey === candidate.phaseKey) {
            supersededItemIds.add(parentCandidate.itemId);
          }
          parentId = itemsById.get(parentId)?.parentId ?? null;
        }
      }
      for (const candidate of candidates) {
        if (supersededItemIds.has(candidate.itemId)) continue;
        const phaseSegments = segmentsByPhase.get(candidate.phaseKey) ?? [];
        phaseSegments.push(candidate.segment);
        segmentsByPhase.set(candidate.phaseKey, phaseSegments);
      }
      return {
        portfolio: portfolioName(project),
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        projectManager: project.projectManager,
        rag: project.rag,
        sortOrder: project.sortOrder,
        segments: Array.from(segmentsByPhase.values()).flatMap(mergeConnectedSegments),
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
    (MIN_SEGMENT_TARGET_PX / (range * MIN_RESPONSIVE_MONTH_WIDTH_PX)) * 100;
  return {
    projectId: project.projectId,
    projectCode: project.projectCode,
    projectName: project.projectName,
    projectManager: project.projectManager,
    rag: project.rag,
    tracks: TRACK_IDS.map((trackId) => {
      const rowEnds: Date[] = [];
      const segments = project.segments
        .filter(
          (segment) =>
            segment.trackId === trackId &&
            segment.end >= startDate &&
            segment.start < endDate,
        )
        .sort(
          (left, right) =>
            left.start.getTime() - right.start.getTime() ||
            left.phaseIndex - right.phaseIndex,
        )
        .map((segment) => {
          const clippedStart = segment.start < startDate ? startDate : segment.start;
          const rawEnd = addDays(segment.end, 1);
          const clippedEnd = rawEnd > endDate ? endDate : rawEnd;
          let row = rowEnds.findIndex((rowEnd) => rowEnd < segment.start);
          if (row === -1) row = rowEnds.length;
          rowEnds[row] = segment.end;
          const startPosition = Math.max(0, monthPosition(clippedStart, startDate));
          const endPosition = Math.min(range, monthPosition(clippedEnd, startDate));
          const width = Math.max(
            minWidthPercent,
            ((endPosition - startPosition) / range) * 100,
          );
          const offset = Math.min((startPosition / range) * 100, 100 - width);
          return {
            id: segment.id,
            phaseId: segment.phase.id,
            label: segment.phase.label,
            description: segment.phase.description,
            color: segment.phase.color,
            startDate: isoDay(segment.start),
            endDate: isoDay(segment.end),
            offset,
            width,
            itemCount: segment.itemCount,
            progress: segment.progress,
            row,
          };
        });
      return {
        id: trackId,
        label: TRACK_LABELS[trackId],
        segments,
        laneCount: Math.max(1, rowEnds.length),
      };
    }),
  };
}

const LAUNCH_PHASE_IDS = new Set(["hw-launch", "sw-launch", "g2m-launch"]);

export function createPortfolioRoadmap(
  projects: PreparedPortfolioRoadmapProject[],
  range: PortfolioRoadmapRange = 36,
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
    project.segments.some(
      (segment) =>
        LAUNCH_PHASE_IDS.has(segment.phase.id) &&
        segment.end >= comparisonToday &&
        segment.start <= nextYear,
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
