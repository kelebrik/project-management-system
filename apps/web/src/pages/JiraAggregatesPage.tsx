import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_ANALYTICS_GROUPS_BY_SOURCE,
  JIRA_ANALYTICS_METRICS_BY_SOURCE,
  jiraAnalyticsAggregateDraftSchema,
  jiraAnalyticsFieldKind,
  jiraAnalyticsOperatorsFor,
  jiraAnalyticsSourceUsesPeriod,
  type JiraAnalyticsAggregateDraft,
  type JiraAnalyticsDataQuality,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsFilter,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsFilterOperator,
  type JiraAnalyticsGroupBy,
  type JiraAnalyticsMetric,
  type JiraAnalyticsPeriodMode,
  type JiraAnalyticsResultRecord,
  type JiraAnalyticsSource,
} from "@pms/shared";
import { Copy, Database, Download, Eye, History, Plus, RotateCcw, Save, Scale, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../api/client";
import type { JiraAnalyticsFacets } from "../app/domainTypes";
import {
  JIRA_ANALYTICS_FILTER_LABELS,
  JIRA_ANALYTICS_GROUP_LABELS,
  JIRA_ANALYTICS_METRIC_LABELS,
  JIRA_ANALYTICS_OPERATOR_LABELS,
  JIRA_ANALYTICS_SOURCE_LABELS,
  formatJiraAnalyticsMetric,
} from "../app/jiraAnalytics";
import { usePageContext } from "./PageContext";

type AggregateDefinition = JiraAnalyticsAggregateDraft & {
  id: string;
  projectId: string;
  fingerprint: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type AggregateCatalog = {
  definitions: AggregateDefinition[];
  dashboard: {
    stored: boolean;
    version: number | null;
    configHash: string;
    conversionId: string | null;
    attempt: number | null;
    sourceConfigHash: string | null;
    originalConfigHash: string | null;
    originalConfigStored: boolean | null;
    convertedConfigHash: string | null;
    convertedAt: string | null;
    rolledBackAt: string | null;
    rollbackState: "AVAILABLE" | "USED" | "CLOSED" | null;
    rollbackFinalizedAt: string | null;
    rollbackAvailableUntil: "AVAILABLE_UNTIL_LEGACY_RETIREMENT" | null;
  };
};

type DashboardOperationResult = {
  dryRun?: boolean;
  conversionId?: string | null;
  attempt?: number;
  sourceStored?: boolean;
  sourceConfigHash?: string;
  effectiveConfigHash?: string;
  planHash?: string;
  rollbackState?: "AVAILABLE" | "USED" | "CLOSED" | null;
  rollbackAvailableUntil?: "AVAILABLE_UNTIL_LEGACY_RETIREMENT" | null;
  beforeHash?: string;
  afterHash?: string;
  sourceWidgets?: number;
  reconciliation?: DashboardReconciliationResult;
  items?: Array<{
    name: string;
    action: "REUSE" | "WOULD_CREATE" | "CREATED";
  }>;
};

type JiraAsOfReconstruction = {
  mode: "AS_OF";
  provenance: "RECONSTRUCTED";
  basis: "OBSERVED_VERSIONS";
  asOf: string;
  tickets: number;
  ticketsWithoutObservation: number;
  ticketsRetiredAfterAsOf: number;
  versionRowsScanned: number;
  earliestObservationAt: string | null;
  stalenessHours: { p50: number; p95: number; max: number } | null;
  beforeHistoryStart: boolean;
  historyWriteGap: {
    includesAsOf: boolean;
    runs: number;
    firstAt: string | null;
    lastAt: string | null;
  };
  quality: "AVAILABLE" | "UNAVAILABLE_HISTORY_WRITE_GAP";
};

type JiraAnalyticsPreviewResult = JiraAnalyticsEvaluationResult & {
  reconstruction?: JiraAsOfReconstruction;
};

type DashboardReconciliationResult = {
  status: "MATCH" | "MISMATCH";
  evaluatedAt: string;
  legacyEngine: "V1_INLINE_WIDGETS";
  managedEngine: "V2_REFERENCED_AGGREGATES";
  legacyConfigHash: string;
  managedConfigHash: string;
  comparedWidgets: number;
  matchedWidgets: number;
  mismatchedWidgets: number;
  caveat: string;
  widgets: Array<{
    widgetId: string;
    title: string;
    status: "MATCH" | "MISMATCH";
    semanticMatch: boolean;
    valueMatch: boolean;
    totalRecordsMatch: boolean;
    groupsMatch: boolean;
    qualityMatch: boolean;
    orderedRecordSampleMatch: boolean;
    recordSampleSize: number;
    legacy: { status: "OK" | "UNAVAILABLE" | "MISSING"; value: number | null; totalRecords: number | null; error: string | null };
    managed: { status: "OK" | "UNAVAILABLE" | "MISSING"; value: number | null; totalRecords: number | null; error: string | null };
  }>;
};

const EMPTY_DRAFT: JiraAnalyticsAggregateDraft = {
  name: "Новый агрегат",
  description: "",
  source: "issues",
  metric: "count",
  groupBy: "none",
  scope: "active",
  filterLogic: "and",
  filters: [],
  periodMode: "NONE",
  periodDays: null,
  timeZone: "Europe/Moscow",
  sortOrder: 0,
};

const SOURCE_DETAILS: Record<JiraAnalyticsSource, {
  row: string;
  description: string;
  lineage: string;
}> = {
  issues: {
    row: "Одна строка на тикет",
    description: "Текущее состояние тикета или восстановленный снимок на выбранную дату.",
    lineage: "Снимки Jira",
  },
  transitions: {
    row: "Одна строка на переход статуса",
    description: "Переходы и длительность завершённого периода в предыдущем статусе.",
    lineage: "Changelog Jira",
  },
  development: {
    row: "Одна строка на событие разработки",
    description: "Наблюдённые коммиты и merge request, связанные с тикетом.",
    lineage: "Development-связи Jira",
  },
  criticalBugs: {
    row: "Одна строка на SLA-интервал",
    description: "Интервал Critical/Blocker от контрольной точки до Resolution или текущего момента.",
    lineage: "Снимки и changelog Jira",
  },
};

const FIELD_KIND_LABELS = {
  text: "Текст",
  number: "Число",
  boolean: "Признак",
  date: "Дата",
} as const;

function newFilter(field: JiraAnalyticsFilterField): JiraAnalyticsFilter {
  return {
    id: `filter-${crypto.randomUUID()}`,
    field,
    operator: jiraAnalyticsOperatorsFor(field)[0],
    value: field === "hasDevelopment" ? "true" : "",
  };
}

function localDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const qualityStatusLabels: Record<JiraAnalyticsDataQuality["status"], string> = {
  COMPLETE: "Полное покрытие источника",
  PARTIAL: "Частичное покрытие источника",
  NO_DATA: "Нет данных",
  UNAVAILABLE: "Недоступно",
};

const qualityWarningLabels: Record<JiraAnalyticsDataQuality["warnings"][number]["code"], string> = {
  NO_SOURCE_POPULATION: "В выбранной области нет тикетов для источника",
  INCOMPLETE_TRANSITION_HISTORY: "Неполная история переходов",
  INCOMPLETE_DEVELOPMENT_DATA: "Не проверена активность разработки",
  INCOMPLETE_CRITICAL_SLA: "Не определена контрольная точка SLA",
  MISSING_HISTORICAL_OBSERVATION: "В проекте есть тикеты без исторического снимка; они не входят в покрытие выбранной области",
  BEFORE_HISTORY_START: "Дата раньше начала наблюдений",
  HISTORY_WRITE_GAP: "На дату был отключён сбор истории",
};

function QualitySummary({ quality }: { quality: JiraAnalyticsDataQuality }) {
  return (
    <section className={`jira-aggregate-quality ${quality.status.toLowerCase()}`}>
      <header>
        <strong>{qualityStatusLabels[quality.status]}</strong>
        <span>{quality.basis === "CURRENT_PROJECTION" ? "Текущая проекция" : "Наблюдённые версии"}</span>
      </header>
      <dl>
        <div><dt>Покрытие источника</dt><dd>{quality.coveragePercent === null ? "-" : `${quality.coveragePercent.toLocaleString("ru-RU")}%`}</dd></div>
        <div><dt>Полных записей</dt><dd>{quality.complete.toLocaleString("ru-RU")} / {quality.population.toLocaleString("ru-RU")}</dd></div>
        <div><dt>Последнее наблюдение</dt><dd>{quality.latestObservedAt ? new Date(quality.latestObservedAt).toLocaleString("ru-RU") : "-"}</dd></div>
      </dl>
      {quality.warnings.length > 0 && (
        <ul>{quality.warnings.map((warning) => (
          <li key={warning.code}>{qualityWarningLabels[warning.code]}{warning.count > 0 ? `: ${warning.count.toLocaleString("ru-RU")}` : ""}</li>
        ))}</ul>
      )}
    </section>
  );
}

function PreviewRecords({ records }: { records: JiraAnalyticsResultRecord[] }) {
  if (records.length === 0) return null;
  return (
    <div className="jira-aggregate-preview-records">
      <table>
        <thead><tr><th>Тикет</th><th>Статус</th><th>Исполнитель</th><th>Значение</th></tr></thead>
        <tbody>{records.map((record) => (
          <tr key={record.id}>
            <td><a href={record.issue.issueUrl} target="_blank" rel="noreferrer">{record.issue.issueKey}</a></td>
            <td>{record.issue.status || "-"}</td>
            <td>{record.issue.assignee || "-"}</td>
            <td>{record.durationHours === null ? record.eventAt ? new Date(record.eventAt).toLocaleDateString("ru-RU") : "-" : `${record.durationHours.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function draftForSource(current: JiraAnalyticsAggregateDraft, source: JiraAnalyticsSource) {
  return {
    ...current,
    source,
    metric: JIRA_ANALYTICS_METRICS_BY_SOURCE[source][0],
    groupBy: JIRA_ANALYTICS_GROUPS_BY_SOURCE[source][0],
    filters: [],
    periodMode: jiraAnalyticsSourceUsesPeriod(source) ? "DASHBOARD" as const : "NONE" as const,
    periodDays: null,
  } satisfies JiraAnalyticsAggregateDraft;
}

function Preview({ result, metric, view = "result" }: {
  result: JiraAnalyticsPreviewResult | null;
  metric: JiraAnalyticsMetric;
  view?: "result" | "records";
}) {
  if (!result) return <div className="jira-aggregate-preview-empty">Предпросмотр не запускался</div>;
  const remainder100 = result.totalRecords % 100;
  const remainder10 = result.totalRecords % 10;
  const recordsLabel = remainder10 === 1 && remainder100 !== 11
    ? "запись"
    : remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)
      ? "записи"
      : "записей";
  return (
    <div className="jira-aggregate-preview">
      {result.reconstruction && (
        <div className={`jira-aggregate-reconstruction ${result.reconstruction.beforeHistoryStart || result.reconstruction.ticketsWithoutObservation > 0 ? "warning" : ""}`}>
          <div><History size={16} /><strong>Срез по наблюдённой истории</strong></div>
          <dl>
            <div><dt>Состояние на</dt><dd>{new Date(result.reconstruction.asOf).toLocaleString("ru-RU")}</dd></div>
            <div><dt>Тикетов</dt><dd>{result.reconstruction.tickets.toLocaleString("ru-RU")}</dd></div>
            <div><dt>Без снимка</dt><dd>{result.reconstruction.ticketsWithoutObservation.toLocaleString("ru-RU")}</dd></div>
            <div><dt>Версий прочитано</dt><dd>{result.reconstruction.versionRowsScanned.toLocaleString("ru-RU")}</dd></div>
            {result.reconstruction.stalenessHours && (
              <div><dt>Задержка P95 / max</dt><dd>{result.reconstruction.stalenessHours.p95.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} / {result.reconstruction.stalenessHours.max.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч</dd></div>
            )}
          </dl>
          {result.reconstruction.beforeHistoryStart && <p>На выбранную дату нет наблюдённых снимков по тикетам в области. Значение не является подтверждённым нулём.</p>}
          {!result.reconstruction.beforeHistoryStart && result.reconstruction.ticketsWithoutObservation > 0 && <p>Для части тикетов на выбранную дату ещё нет наблюдённого снимка.</p>}
        </div>
      )}
      <QualitySummary quality={result.quality} />
      {view === "result" ? (
        <>
          <div className="jira-aggregate-preview-number">
            <strong>{formatJiraAnalyticsMetric(metric, result.value)}</strong>
            <span>{result.totalRecords.toLocaleString("ru-RU")} {recordsLabel}</span>
          </div>
          <dl>
            <div><dt>Рассчитано</dt><dd>{new Date(result.evaluatedAt).toLocaleString("ru-RU")}</dd></div>
            <div><dt>Период</dt><dd>{result.effective.periodDays ? `${result.effective.periodDays} дней` : "Не применяется"}</dd></div>
            <div><dt>Часовой пояс</dt><dd>{result.effective.timeZone}</dd></div>
          </dl>
          {result.groups.length > 0 && (
            <div className="jira-aggregate-preview-groups">
              {result.groups.slice(0, 8).map((group) => (
                <div key={group.key}>
                  <span>{group.label}</span>
                  <b>{formatJiraAnalyticsMetric(metric, group.value)}</b>
                  <small>{group.recordCount}</small>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="jira-aggregate-records-caption">
            Отобранные строки: {result.totalRecords.toLocaleString("ru-RU")}. В предпросмотре показана первая страница.
          </p>
          <PreviewRecords records={result.records} />
        </>
      )}
    </div>
  );
}

export function JiraAggregatesPage() {
  const { currentUser, isClosedProject, project, refreshProject, setError, setNotice } = usePageContext();
  const isSystemAdmin = currentUser?.role === "ADMIN";
  const canEdit = isSystemAdmin && !isClosedProject;
  const [catalog, setCatalog] = useState<AggregateCatalog | null>(null);
  const [facetState, setFacetState] = useState<{
    projectId: string;
    data: JiraAnalyticsFacets;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<JiraAnalyticsAggregateDraft>(EMPTY_DRAFT);
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);
  const [preview, setPreview] = useState<JiraAnalyticsPreviewResult | null>(null);
  const [previewView, setPreviewView] = useState<"result" | "records">("result");
  const [periodDays, setPeriodDays] = useState<30 | 90 | 180 | 365>(90);
  const [assignee, setAssignee] = useState("");
  const [asOf, setAsOf] = useState("");
  const [maxAsOf] = useState(() => localDateTimeValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [operationResult, setOperationResult] = useState<DashboardOperationResult | null>(null);
  const [reconciliation, setReconciliation] = useState<DashboardReconciliationResult | null>(null);
  const loadSequenceRef = useRef(0);

  const loadCatalog = async (
    nextSelectedId?: string | null,
    options: { resetOperationResult?: boolean } = {},
  ) => {
    const loadSequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadSequence;
    setLoading(true);
    if (options.resetOperationResult) setOperationResult(null);
    if (options.resetOperationResult) setReconciliation(null);
    try {
      const [next, nextFacets] = await Promise.all([
        apiClient.get<AggregateCatalog>(
          `/api/projects/${project.id}/jira/aggregates`,
          "Не удалось загрузить агрегаты Jira",
        ),
        apiClient.get<JiraAnalyticsFacets>(
          `/api/projects/${project.id}/jira/analytics-facets`,
          "Не удалось загрузить сводку данных Jira",
        ),
      ]);
      if (loadSequenceRef.current !== loadSequence) return;
      setCatalog(next);
      setFacetState({ projectId: project.id, data: nextFacets });
      const selected = next.definitions.find((item) => item.id === (nextSelectedId ?? selectedId))
        ?? next.definitions[0]
        ?? null;
      if (selected) {
        setSelectedId(selected.id);
        setDraft({
          name: selected.name,
          description: selected.description,
          source: selected.source,
          metric: selected.metric,
          groupBy: selected.groupBy,
          scope: selected.scope,
          filterLogic: selected.filterLogic,
          filters: structuredClone(selected.filters),
          periodMode: selected.periodMode,
          periodDays: selected.periodDays,
          timeZone: selected.timeZone,
          sortOrder: selected.sortOrder,
        });
        setExpectedVersion(selected.version);
      } else {
        setSelectedId(null);
        setDraft({ ...EMPTY_DRAFT, sortOrder: next.definitions.length });
        setExpectedVersion(null);
      }
      setPreview(null);
    } catch (error) {
      if (loadSequenceRef.current !== loadSequence) return;
      setError(error instanceof Error ? error.message : "Не удалось загрузить агрегаты");
    } finally {
      if (loadSequenceRef.current === loadSequence) setLoading(false);
    }
  };

  useEffect(() => {
    // The async catalog response is the external state synchronized by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCatalog(null, { resetOperationResult: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const selected = catalog?.definitions.find((item) => item.id === selectedId) ?? null;
  const validation = jiraAnalyticsAggregateDraftSchema.safeParse(draft);
  const usesPeriod = jiraAnalyticsSourceUsesPeriod(draft.source);
  const facets = facetState?.projectId === project.id ? facetState.data : null;
  const assignees = useMemo(() => facets?.assignees ?? [], [facets]);

  const selectDefinition = (definition: AggregateDefinition) => {
    setSelectedId(definition.id);
    setDraft({
      name: definition.name,
      description: definition.description,
      source: definition.source,
      metric: definition.metric,
      groupBy: definition.groupBy,
      scope: definition.scope,
      filterLogic: definition.filterLogic,
      filters: structuredClone(definition.filters),
      periodMode: definition.periodMode,
      periodDays: definition.periodDays,
      timeZone: definition.timeZone,
      sortOrder: definition.sortOrder,
    });
    setExpectedVersion(definition.version);
    setPreview(null);
    setPreviewView("result");
    setAsOf("");
  };

  const chooseSource = (source: JiraAnalyticsSource) => {
    const definition = catalog?.definitions.find((item) => item.source === source);
    if (definition) {
      selectDefinition(definition);
      return;
    }
    setSelectedId(null);
    setExpectedVersion(null);
    setDraft({
      ...draftForSource({ ...EMPTY_DRAFT, sortOrder: catalog?.definitions.length ?? 0 }, source),
      name: `Новый агрегат · ${JIRA_ANALYTICS_SOURCE_LABELS[source]}`,
    });
    setPreview(null);
    setPreviewView("result");
    setAsOf("");
  };

  const cloneDefinition = () => {
    if (!selected) return;
    setSelectedId(null);
    setExpectedVersion(null);
    setDraft({
      ...draft,
      name: `${selected.name} · копия`,
      sortOrder: catalog?.definitions.length ?? draft.sortOrder,
    });
    setPreview(null);
    setPreviewView("result");
    setNotice("Копия подготовлена. Измените правила агрегата перед сохранением.");
  };

  const saveDefinition = async () => {
    if (!canEdit || !validation.success) return;
    setSaving(true);
    setError(null);
    try {
      const saved = selectedId
        ? await apiClient.patch<AggregateDefinition>(
            `/api/projects/${project.id}/jira/aggregates/${selectedId}`,
            { definition: validation.data, expectedVersion },
            "Не удалось сохранить агрегат",
          )
        : await apiClient.post<AggregateDefinition>(
            `/api/projects/${project.id}/jira/aggregates`,
            { definition: validation.data },
            "Не удалось создать агрегат",
          );
      await loadCatalog(saved.id, { resetOperationResult: true });
      setNotice(selectedId ? "Агрегат обновлён" : "Агрегат создан");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось сохранить агрегат");
    } finally {
      setSaving(false);
    }
  };

  const deleteDefinition = async () => {
    if (!canEdit || !selectedId || expectedVersion === null) return;
    if (!window.confirm(`Удалить агрегат «${selected?.name ?? draft.name}»?`)) return;
    setSaving(true);
    try {
      await apiClient.delete(
        `/api/projects/${project.id}/jira/aggregates/${selectedId}?expectedVersion=${expectedVersion}`,
        "Не удалось удалить агрегат",
      );
      await loadCatalog(null, { resetOperationResult: true });
      setNotice("Агрегат удалён");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось удалить агрегат");
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    if (!canEdit || !validation.success) return;
    setSaving(true);
    try {
      const result = await apiClient.post<JiraAnalyticsPreviewResult>(
        `/api/projects/${project.id}/jira/aggregates/preview`,
        {
          definition: validation.data,
          ...(validation.data.periodMode === "DASHBOARD" ? { periodDays } : {}),
          assignee,
          page: 1,
          pageSize: 12,
          ...(asOf && !usesPeriod ? { asOf: new Date(asOf).toISOString() } : {}),
        },
        "Не удалось рассчитать агрегат",
      );
      setPreview(result);
      setPreviewView("result");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось рассчитать агрегат");
    } finally {
      setSaving(false);
    }
  };

  const runDashboardOperation = async (
    operation: "switch-dashboard" | "rollback-dashboard",
    dryRun: boolean,
  ) => {
    if (!canEdit || !catalog) return;
    if (operation === "rollback-dashboard" && catalog.dashboard.attempt === null) return;
    setSaving(true);
    try {
      const body = operation === "switch-dashboard"
        ? {
            dryRun,
            expectedConfigHash: catalog.dashboard.configHash,
            periodDays,
            assignee,
          }
        : {
            dryRun,
            expectedConfigHash: catalog.dashboard.configHash,
            attempt: catalog.dashboard.attempt,
          };
      const result = await apiClient.post<DashboardOperationResult>(
        `/api/projects/${project.id}/jira/aggregates/${operation}`,
        body,
        "Операция с дашбордом не выполнена",
      );
      setOperationResult(result);
      if (result.reconciliation) setReconciliation(result.reconciliation);
      await loadCatalog(selectedId);
      if (!dryRun) await refreshProject(project.id);
      setNotice(dryRun ? "Проверка завершена без изменений" : "Операция завершена");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Операция с дашбордом не выполнена");
    } finally {
      setSaving(false);
    }
  };

  const exportDefinition = async () => {
    if (!selectedId || !selected) return;
    setSaving(true);
    try {
      const params = new URLSearchParams({ assignee });
      if (selected.periodMode === "DASHBOARD") params.set("periodDays", String(periodDays));
      if (asOf && !jiraAnalyticsSourceUsesPeriod(selected.source)) params.set("asOf", new Date(asOf).toISOString());
      else params.set("evaluatedAt", new Date().toISOString());
      const file = await apiClient.download(
        `/api/projects/${project.id}/jira/aggregates/${selectedId}/export.csv?${params}`,
        "Не удалось экспортировать агрегат",
      );
      downloadBlob(file.blob, file.filename);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось экспортировать агрегат");
    } finally {
      setSaving(false);
    }
  };

  const runReconciliation = async () => {
    if (!isSystemAdmin || !catalog?.dashboard.stored) return;
    setSaving(true);
    setReconciliation(null);
    try {
      const result = await apiClient.post<DashboardReconciliationResult>(
        `/api/projects/${project.id}/jira/aggregates/reconcile-dashboard`,
        {
          expectedConfigHash: catalog.dashboard.configHash,
          periodDays,
          assignee,
        },
        "Не удалось выполнить сверку v1/v2",
      );
      setReconciliation(result);
      setNotice(result.status === "MATCH" ? "Сверка v1/v2 завершена без расхождений" : "Сверка v1/v2 обнаружила расхождения");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось выполнить сверку v1/v2");
    } finally {
      setSaving(false);
    }
  };

  const updateFilter = (id: string, patch: Partial<JiraAnalyticsFilter>) => {
    setDraft((current) => ({
      ...current,
      filters: current.filters.map((filter) => filter.id === id ? { ...filter, ...patch } : filter),
    }));
  };

  if (loading && !catalog) return <div className="jira-aggregate-preview-empty">Загрузка агрегатов...</div>;

  return (
    <div className="jira-aggregates-page">
      <section className="jira-aggregate-sources" aria-label="Источники данных агрегатов">
        <header>
          <div><Database size={18} /><h3>Источники данных</h3></div>
          <span>Системные наборы строк · только чтение</span>
        </header>
        <div className="jira-aggregate-source-grid">
          {(Object.keys(JIRA_ANALYTICS_SOURCE_LABELS) as JiraAnalyticsSource[]).map((source) => {
            const detail = SOURCE_DETAILS[source];
            const count = catalog?.definitions.filter((definition) => definition.source === source).length ?? 0;
            return (
              <button
                type="button"
                className={draft.source === source ? "active" : ""}
                key={source}
                onClick={() => chooseSource(source)}
              >
                <span><strong>{JIRA_ANALYTICS_SOURCE_LABELS[source]}</strong><b>{count}</b></span>
                <small>{detail.row}</small>
                <small>{detail.lineage}</small>
              </button>
            );
          })}
        </div>
        <div className="jira-aggregate-source-description">
          <p>{SOURCE_DETAILS[draft.source].description}</p>
          <details>
            <summary>Доступные поля ({JIRA_ANALYTICS_FIELDS_BY_SOURCE[draft.source].length})</summary>
            <div>
              {JIRA_ANALYTICS_FIELDS_BY_SOURCE[draft.source].map((field) => (
                <span key={field}>
                  <b>{JIRA_ANALYTICS_FILTER_LABELS[field]}</b>
                  <small>{FIELD_KIND_LABELS[jiraAnalyticsFieldKind(field)]}</small>
                </span>
              ))}
            </div>
          </details>
        </div>
      </section>

      <div className="jira-aggregate-builder">
      <aside className="jira-aggregate-catalog">
        <header>
          <div><Database size={18} /><h3>Агрегаты</h3></div>
          {canEdit && (
            <button type="button" className="icon-button" aria-label="Создать агрегат" title="Создать агрегат" onClick={() => {
              setSelectedId(null);
              setExpectedVersion(null);
              setDraft({ ...EMPTY_DRAFT, sortOrder: catalog?.definitions.length ?? 0 });
              setPreview(null);
              setAsOf("");
            }}><Plus size={17} /></button>
          )}
        </header>
        <div className="jira-aggregate-catalog-list">
          {(Object.keys(JIRA_ANALYTICS_SOURCE_LABELS) as JiraAnalyticsSource[]).map((source) => {
            const definitions = catalog?.definitions.filter((definition) => definition.source === source) ?? [];
            if (definitions.length === 0) return null;
            return (
              <section key={source}>
                <h4>{JIRA_ANALYTICS_SOURCE_LABELS[source]} <span>{definitions.length}</span></h4>
                {definitions.map((definition) => (
                  <button type="button" className={definition.id === selectedId ? "active" : ""} key={definition.id} onClick={() => selectDefinition(definition)}>
                    <strong>{definition.name}</strong>
                    <span>{definition.scope === "active" ? "В работе" : "Ретро"}</span>
                  </button>
                ))}
              </section>
            );
          })}
          {catalog?.definitions.length === 0 && <span className="jira-aggregate-catalog-empty">Каталог пуст</span>}
        </div>
        {isSystemAdmin && catalog && (
          <details className="jira-aggregate-migration">
            <summary>Служебная диагностика</summary>
            <div className="jira-aggregate-migration-content">
            <h4>Дашборд v{catalog.dashboard.version ?? 1}</h4>
            {canEdit && (catalog.dashboard.version === 1 || !catalog.dashboard.stored) && (
              <>
                <button type="button" className="button" disabled={saving} onClick={() => runDashboardOperation("switch-dashboard", true)}><Eye size={15} /> Проверить переключение</button>
                <button type="button" className="button" disabled={saving} onClick={() => runDashboardOperation("switch-dashboard", false)}><History size={15} /> Переключить на v2</button>
              </>
            )}
            {canEdit && catalog.dashboard.version === 2 && catalog.dashboard.rollbackState === "AVAILABLE" && (
              <>
                <div className="jira-aggregate-operation-result"><strong>Откат доступен</strong><span>Конверсия {catalog.dashboard.attempt}</span></div>
                <button type="button" className="button" disabled={saving || catalog.dashboard.convertedConfigHash !== catalog.dashboard.configHash} onClick={() => runDashboardOperation("rollback-dashboard", true)}><Eye size={15} /> Проверить откат</button>
                <button type="button" className="button" disabled={saving || catalog.dashboard.convertedConfigHash !== catalog.dashboard.configHash} onClick={() => runDashboardOperation("rollback-dashboard", false)}><RotateCcw size={15} /> Вернуть v1</button>
                {catalog.dashboard.convertedConfigHash !== catalog.dashboard.configHash && (
                  <div className="jira-aggregate-validation">Конфигурация v2 изменена после конвертации. Сохраните дашборд повторно и обновите каталог перед откатом.</div>
                )}
              </>
            )}
            {catalog.dashboard.rollbackState === "CLOSED" && <div className="jira-aggregate-validation">Окно legacy-отката закрыто</div>}
            {catalog.dashboard.version === 2 && (
              <button
                type="button"
                className="button"
                disabled={saving || (catalog?.definitions.length ?? 0) === 0}
                onClick={runReconciliation}
              >
                <Scale size={15} /> Сверить v1 и v2
              </button>
            )}
            <p className="jira-aggregate-migration-caveat">Сверка проверяет совпадение v1/v2 на одних данных, но не является независимой проверкой формул.</p>
            {operationResult && (
              <div className="jira-aggregate-operation-result" role="status">
                {operationResult.items ? (
                  <>
                    <strong>{operationResult.sourceWidgets ?? 0} виджетов</strong>
                    <span>Создать: {operationResult.items.filter((item) => item.action === "WOULD_CREATE" || item.action === "CREATED").length}</span>
                    <span>Переиспользовать: {operationResult.items.filter((item) => item.action === "REUSE").length}</span>
                    {operationResult.reconciliation && <span>Сверка: {operationResult.reconciliation.status === "MATCH" ? "совпадает" : "есть расхождения"}</span>}
                  </>
                ) : (
                  <>
                    <strong>Конфигурация проверена</strong>
                    <span>{operationResult.beforeHash?.slice(0, 8) ?? "-"} → {operationResult.afterHash?.slice(0, 8) ?? "-"}</span>
                  </>
                )}
              </div>
            )}
            {reconciliation && (
              <div className={`jira-aggregate-reconciliation ${reconciliation.status.toLowerCase()}`} role="status">
                <header>
                  <strong>{reconciliation.status === "MATCH" ? "Расхождений нет" : "Есть расхождения"}</strong>
                  <span>{reconciliation.matchedWidgets} / {reconciliation.comparedWidgets}</span>
                </header>
                <div className="jira-aggregate-reconciliation-widgets">
                  {reconciliation.widgets.map((widget) => (
                    <span className={widget.status.toLowerCase()} key={widget.widgetId} title={widget.status === "MATCH" ? "Значение, записи, группы и качество совпали" : "Проверьте правила и определение агрегата"}>
                      {widget.title}
                    </span>
                  ))}
                </div>
                <p>{reconciliation.caveat}</p>
              </div>
            )}
            </div>
          </details>
        )}
      </aside>

      <main className="jira-aggregate-editor">
        <header>
          <div><h3>{selected ? selected.name : "Новый агрегат"}</h3><span>{selected ? `Версия ${selected.version}` : "Не сохранён"}</span></div>
          {canEdit && (
            <div>
              {selected && <button type="button" className="icon-button" disabled={saving} onClick={cloneDefinition} aria-label="Клонировать агрегат" title="Клонировать"><Copy size={17} /></button>}
              {selected && <button type="button" className="icon-button danger" disabled={saving} onClick={deleteDefinition} aria-label="Удалить агрегат" title="Удалить"><Trash2 size={17} /></button>}
              {selected && <button type="button" className="icon-button" disabled={saving} onClick={exportDefinition} aria-label="Экспортировать сохранённый агрегат" title="Экспорт CSV сохранённого агрегата"><Download size={17} /></button>}
              <button type="button" className="button" disabled={saving || !validation.success} onClick={runPreview}><Eye size={16} /> Рассчитать</button>
              <button type="button" className="button primary" disabled={saving || !validation.success} onClick={saveDefinition}><Save size={16} /> Сохранить</button>
            </div>
          )}
        </header>

        <div className="jira-aggregate-editor-grid">
          <section className="jira-aggregate-controls">
            <label><span>Название</span><input disabled={!canEdit} maxLength={200} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label><span>Описание</span><textarea disabled={!canEdit} maxLength={1000} rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <div className="jira-aggregate-control-row">
              <label><span>Источник</span><select aria-label="Источник агрегата" disabled={!canEdit} value={draft.source} onChange={(event) => { setDraft(draftForSource(draft, event.target.value as JiraAnalyticsSource)); setAsOf(""); setPreview(null); }}>{Object.entries(JIRA_ANALYTICS_SOURCE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label><span>Область</span><select disabled={!canEdit} value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value as "active" | "retro" })}><option value="active">В работе</option><option value="retro">Ретро</option></select></label>
            </div>
            <div className="jira-aggregate-control-row">
              <label><span>Метрика</span><select disabled={!canEdit} value={draft.metric} onChange={(event) => setDraft({ ...draft, metric: event.target.value as JiraAnalyticsMetric })}>{JIRA_ANALYTICS_METRICS_BY_SOURCE[draft.source].map((metric) => <option value={metric} key={metric}>{JIRA_ANALYTICS_METRIC_LABELS[metric]}</option>)}</select></label>
              <label><span>Группировка</span><select disabled={!canEdit} value={draft.groupBy} onChange={(event) => setDraft({ ...draft, groupBy: event.target.value as JiraAnalyticsGroupBy })}>{JIRA_ANALYTICS_GROUPS_BY_SOURCE[draft.source].map((group) => <option value={group} key={group}>{JIRA_ANALYTICS_GROUP_LABELS[group]}</option>)}</select></label>
            </div>
            <div className="jira-aggregate-asof-control">
              <label><span>Состояние на дату</span><input disabled={!canEdit || usesPeriod} type="datetime-local" value={asOf} max={maxAsOf} onChange={(event) => { setAsOf(event.target.value); setPreview(null); }} /></label>
              <button type="button" className="icon-button" disabled={!canEdit || !asOf} onClick={() => { setAsOf(""); setPreview(null); }} aria-label="Сбросить исторический срез" title="Сейчас"><RotateCcw size={16} /></button>
              {usesPeriod && <span>Для событийных источников используется период, а не срез состояния.</span>}
            </div>
            {usesPeriod && (
              <div className="jira-aggregate-control-row">
                <label><span>Период</span><select disabled={!canEdit} value={draft.periodMode} onChange={(event) => { const mode = event.target.value as JiraAnalyticsPeriodMode; setDraft({ ...draft, periodMode: mode, periodDays: mode === "FIXED" ? periodDays : null }); }}><option value="DASHBOARD">Из дашборда</option><option value="FIXED">Фиксированный</option></select></label>
                <label><span>Дней</span><select disabled={!canEdit || draft.periodMode !== "FIXED"} value={draft.periodMode === "FIXED" ? draft.periodDays ?? periodDays : periodDays} onChange={(event) => { const value = Number(event.target.value) as 30 | 90 | 180 | 365; setPeriodDays(value); if (draft.periodMode === "FIXED") setDraft({ ...draft, periodDays: value }); }}>{[30, 90, 180, 365].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
              </div>
            )}
            <div className="jira-aggregate-control-row">
              <label><span>Часовой пояс</span><select disabled={!canEdit} value={draft.timeZone} onChange={(event) => setDraft({ ...draft, timeZone: event.target.value as "Europe/Moscow" | "UTC" })}><option value="Europe/Moscow">Europe/Moscow</option><option value="UTC">UTC</option></select></label>
              <label><span>Исполнитель preview</span><select disabled={!canEdit} value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Все</option>{assignees.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
            </div>

            <div className="jira-aggregate-filter-header">
              <h4>Условия</h4>
              <div className="jira-widget-logic"><button type="button" disabled={!canEdit} className={draft.filterLogic === "and" ? "active" : ""} onClick={() => setDraft({ ...draft, filterLogic: "and" })}>И</button><button type="button" disabled={!canEdit} className={draft.filterLogic === "or" ? "active" : ""} onClick={() => setDraft({ ...draft, filterLogic: "or" })}>ИЛИ</button></div>
            </div>
            <div className="jira-widget-filters">
              {draft.filters.map((filter) => (
                <div className="jira-widget-filter" key={filter.id}>
                  <select disabled={!canEdit} value={filter.field} onChange={(event) => { const field = event.target.value as JiraAnalyticsFilterField; updateFilter(filter.id, { field, operator: jiraAnalyticsOperatorsFor(field)[0], value: field === "hasDevelopment" ? "true" : "" }); }}>{JIRA_ANALYTICS_FIELDS_BY_SOURCE[draft.source].map((field) => <option value={field} key={field}>{JIRA_ANALYTICS_FILTER_LABELS[field]}</option>)}</select>
                  <select disabled={!canEdit} value={filter.operator} onChange={(event) => updateFilter(filter.id, { operator: event.target.value as JiraAnalyticsFilterOperator, value: ["empty", "notEmpty"].includes(event.target.value) ? "" : filter.value })}>{jiraAnalyticsOperatorsFor(filter.field).map((operator) => <option value={operator} key={operator}>{JIRA_ANALYTICS_OPERATOR_LABELS[operator]}</option>)}</select>
                  {!["empty", "notEmpty"].includes(filter.operator) && (filter.field === "hasDevelopment" ? <select disabled={!canEdit} value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })}><option value="true">Да</option><option value="false">Нет</option></select> : <input disabled={!canEdit} type={jiraAnalyticsFieldKind(filter.field) === "number" ? "number" : jiraAnalyticsFieldKind(filter.field) === "date" ? "datetime-local" : "text"} value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} />)}
                  {canEdit && <button type="button" className="icon-button danger" onClick={() => setDraft({ ...draft, filters: draft.filters.filter((item) => item.id !== filter.id) })} aria-label="Удалить условие"><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
            {canEdit && <button type="button" className="button" disabled={draft.filters.length >= 20} onClick={() => { const field = JIRA_ANALYTICS_FIELDS_BY_SOURCE[draft.source][0]; setDraft({ ...draft, filters: [...draft.filters, newFilter(field)] }); }}><Plus size={15} /> Условие</button>}
            {!validation.success && <div className="jira-aggregate-validation">{validation.error.issues[0]?.message}</div>}
          </section>
          <section className="jira-aggregate-preview-panel">
            <div className="jira-aggregate-preview-tabs" aria-label="Предпросмотр агрегата">
              <button type="button" className={previewView === "result" ? "active" : ""} onClick={() => setPreviewView("result")}>Результат</button>
              <button type="button" className={previewView === "records" ? "active" : ""} onClick={() => setPreviewView("records")}>Строки данных</button>
            </div>
            <Preview result={preview} metric={draft.metric} view={previewView} />
          </section>
        </div>
      </main>
      </div>
    </div>
  );
}
