import { DatabaseZap, Download, Play, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "../api/client";
import { pollJiraSyncRun } from "../app/jiraSyncPolling";
import { usePageContext } from "./PageContext";

type Distribution = {
  min: number;
  average: number;
  p50: number;
  p95: number;
  max: number;
};

type CapacityReport = {
  reportVersion: 2;
  generatedAt: string;
  mode: "READ_ONLY";
  persisted: false;
  scope: {
    type: "LABEL" | "EPIC";
    value: string;
    tickets: number;
    requestedSample: number;
    observedSample: number;
  };
  security: {
    status: "PASS" | "BLOCKED";
    attachmentsExcluded: boolean;
    attachmentFieldExclusionHonored: boolean;
    attachmentReferencesStripped: number;
  };
  collection: {
    elapsedMs: number;
    requests: number;
    failedRequests: number;
  };
  sample: {
    estimatedFullJsonBytes: Distribution;
    estimatedFullGzipBytes: Distribution;
    fields: Distribution;
    changelogHistories: Distribution;
    comments: Distribution;
    worklogs: Distribution;
    completeChangelogPercent: number;
  };
  projections: Array<{
    versionsPerTicket: number;
    rawJsonGiB: number;
    estimatedDatabaseGiB: number;
    estimatedGzipArchiveGiB: number;
    threeDatabaseCopiesGiB: number;
  }>;
  capacityGate: {
    status: "PASS" | "REVIEW_REQUIRED";
    level: "NORMAL" | "WARNING" | "HIGH" | "CRITICAL" | "EXCEEDED";
    versionsPerTicket: number;
    estimatedDatabaseGiB: number;
    projectedTotalDatabaseGiB: number;
    allocatedHistoryGiB: number;
    storageBudgetGiB: number;
    utilizationPercent: number;
    reasons: string[];
    warnings: string[];
  };
};

type HistoryStatus = {
  reportVersion: 1;
  generatedAt: string;
  storage: {
    budgetBytes: number;
    databaseBytes: number;
    utilizationPercent: number;
    level: CapacityReport["capacityGate"]["level"];
    newScopeBlocked: boolean;
  };
  global: HistoryAggregate;
  project: HistoryAggregate;
  retry: {
    pending: number;
    failedBatches: number;
    oldestFailureAt: string | null;
    nextRetryAt: string | null;
    items: Array<{
      issueKey: string;
      reasonCode: string;
      attempts: number;
      firstFailedAt: string;
      lastFailedAt: string;
      nextRetryAt: string;
      lastError: string;
    }>;
  };
  cursor: {
    updatedAt: string | null;
    jiraIssueId: string | null;
    lastFullReconciledAt: string | null;
    fullCursorIssueKey: string | null;
    fullStartedAt: string | null;
  };
  historyWrite?: {
    enabled: boolean;
    gapRuns: number;
    gapFirstAt: string | null;
    gapLastAt: string | null;
  };
  projections?: { unversioned: number };
  labelChanges?: { global: number; project: number };
};

const JIRA_BACKFILL_CLIENT_POLL_MAX_MS = 15 * 60_000;

type BackfillCompleteness = {
  generatedAt: string;
  historyWriteEnabled: boolean;
  scope: {
    tickets: number;
    stableJiraId: number;
    withoutStableJiraId: number;
    observed: number;
    withoutObservedVersion: number;
    fullyHydrated: number;
    coveragePercent: number | null;
    unversionedProjection: number;
  };
  versions: {
    total: number;
    firstObservedAt: string | null;
    lastObservedAt: string | null;
  };
  retry: { pending: number };
  historyWriteGap: { runs: number; firstAt: string | null; lastAt: string | null };
  latestBackfill: {
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    elapsedMs: number | null;
    discoveredIssueCount: number;
    hydratedIssueCount: number;
    versionsCreated: number;
    jiraRequestCount: number;
  } | null;
};

type HistoryAggregate = {
  versions: number;
  tickets: number;
  payloadBytes: number;
  averageBytes: number;
  p95Bytes: number;
  incompleteHydration: number;
  attachmentReferencesStripped: number;
};

const capacityLevelLabel: Record<CapacityReport["capacityGate"]["level"], string> = {
  NORMAL: "норма",
  WARNING: "предупреждение",
  HIGH: "высокая загрузка",
  CRITICAL: "критическая загрузка",
  EXCEEDED: "бюджет превышен",
};

function formatBytes(value: number) {
  if (value < 1024) return `${Math.round(value)} Б`;
  if (value < 1024 ** 2) return `${(value / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} КБ`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
  return `${(value / 1024 ** 3).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ГиБ`;
}

function formatDuration(value: number) {
  if (value < 1_000) return `${value} мс`;
  return `${(value / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`;
}

// Shared with the compact admin toolbar rendered above the capacity report.
// eslint-disable-next-line react-refresh/only-export-components
export function useJiraHistoryAdminControls(dataRevision: number) {
  const { currentUser, project, setError, setNotice } = usePageContext();
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [completeness, setCompleteness] = useState<BackfillCompleteness | null>(null);
  const mountedRef = useRef(true);
  const projectIdRef = useRef(project.id);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    projectIdRef.current = project.id;
  }, [project.id]);

  const loadCompleteness = useCallback(async () => {
    if (currentUser?.role !== "ADMIN") return;
    const requestedProjectId = project.id;
    try {
      const nextCompleteness = await apiClient.get<BackfillCompleteness>(
        `/api/projects/${requestedProjectId}/jira/backfill/completeness?pageSize=1`,
        "Не удалось загрузить полноту истории Jira",
      );
      if (!mountedRef.current || projectIdRef.current !== requestedProjectId) return;
      setCompleteness(nextCompleteness);
    } catch (error) {
      if (mountedRef.current && projectIdRef.current === requestedProjectId) {
        setError(error instanceof Error ? error.message : "Не удалось загрузить полноту истории Jira");
      }
    }
  }, [currentUser?.role, project.id, setError]);

  const loadHistoryStatus = useCallback(async () => {
    if (currentUser?.role !== "ADMIN") return;
    const requestedProjectId = project.id;
    setHistoryLoading(true);
    try {
      const nextStatus = await apiClient.get<HistoryStatus>(
        `/api/projects/${requestedProjectId}/jira/history-status`,
        "Не удалось загрузить состояние истории Jira",
      );
      if (!mountedRef.current || projectIdRef.current !== requestedProjectId) return;
      setHistoryStatus(nextStatus);
    } catch (error) {
      if (mountedRef.current && projectIdRef.current === requestedProjectId) {
        setError(error instanceof Error ? error.message : "Не удалось загрузить состояние истории Jira");
      }
    } finally {
      if (mountedRef.current && projectIdRef.current === requestedProjectId) {
        setHistoryLoading(false);
      }
    }
  }, [currentUser?.role, project.id, setError]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadHistoryStatus();
      void loadCompleteness();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [dataRevision, loadCompleteness, loadHistoryStatus]);

  const runBackfill = async () => {
    const requestedProjectId = project.id;
    setBackfillRunning(true);
    setError("");
    try {
      const accepted = await apiClient.post<{
        statusUrl: string;
        pollAfterMs: number;
      }>(
        `/api/projects/${requestedProjectId}/jira/backfill`,
        {},
        "Не удалось запустить полный импорт",
      );
      const polling = await pollJiraSyncRun<{
        status: string;
        pollAfterMs?: number;
        error?: { message?: string } | null;
      }>({
        initialDelayMs: accepted.pollAfterMs,
        maxDurationMs: JIRA_BACKFILL_CLIENT_POLL_MAX_MS,
        wait: (delayMs) => new Promise((resolve) => window.setTimeout(resolve, delayMs)),
        isCurrent: () => mountedRef.current && projectIdRef.current === requestedProjectId,
        poll: () => apiClient.get<{
          status: string;
          pollAfterMs?: number;
          error?: { message?: string } | null;
        }>(accepted.statusUrl, "Не удалось получить состояние полного импорта"),
      });
      if (polling.outcome === "STALE") return;
      if (polling.outcome === "FAILED") {
        throw new Error(
          polling.state?.error?.message ?? "Полный импорт Jira завершился ошибкой",
        );
      }
      if (polling.outcome === "BACKGROUND") {
        setNotice("Полный импорт Jira продолжает выполняться в фоне. Состояние можно проверить после обновления страницы.");
        return;
      }
      await Promise.all([loadHistoryStatus(), loadCompleteness()]);
      setNotice("Полный импорт Jira завершён; отчёт полноты обновлён.");
    } catch (error) {
      if (mountedRef.current) {
        setError(error instanceof Error ? error.message : "Не удалось выполнить полный импорт Jira");
      }
    } finally {
      setBackfillRunning(false);
    }
  };

  return {
    backfillRunning,
    completeness,
    historyLoading,
    historyStatus,
    refresh: () => Promise.all([loadHistoryStatus(), loadCompleteness()]),
    runBackfill,
  };
}

export type JiraHistoryAdminControls = ReturnType<typeof useJiraHistoryAdminControls>;

export function JiraCapacitySampler({
  history,
}: {
  history: JiraHistoryAdminControls;
}) {
  const { currentUser, project, setError, setNotice } = usePageContext();
  const [scopeType, setScopeType] = useState<"LABEL" | "EPIC">("LABEL");
  const [scopeValue, setScopeValue] = useState("");
  const [sampleSize, setSampleSize] = useState(20);
  const [storageBudgetGiB, setStorageBudgetGiB] = useState(5);
  const [allocatedHistoryGiB, setAllocatedHistoryGiB] = useState(0);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<CapacityReport | null>(null);
  const {
    completeness,
    historyLoading,
    historyStatus,
  } = history;

  useEffect(() => {
    if (!historyStatus) return undefined;
    const timeout = window.setTimeout(() => {
      setAllocatedHistoryGiB((current) => current === 0
        ? historyStatus.storage.databaseBytes / 1024 ** 3
        : current);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [historyStatus]);

  if (currentUser?.role !== "ADMIN") return null;

  const run = async () => {
    if (!scopeValue.trim()) return;
    setRunning(true);
    setError("");
    try {
      const result = await apiClient.post<CapacityReport>(
        `/api/projects/${project.id}/jira/capacity-sample`,
        {
          scopeType,
          scopeValue: scopeValue.trim(),
          sampleSize,
          storageBudgetGiB,
          allocatedHistoryGiB,
        },
        "Не удалось выполнить замер ёмкости",
      );
      setReport(result);
      setNotice("Замер ёмкости завершён. Данные тикетов не сохранялись.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось выполнить замер ёмкости");
    } finally {
      setRunning(false);
    }
  };

  const download = () => {
    if (!report) return;
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `jira-capacity-${report.scope.type.toLowerCase()}-${report.generatedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <section className="jira-capacity-tool" aria-busy={running}>
      <header>
        <div>
          <h3><DatabaseZap size={18} /> Ёмкость полной истории</h3>
          <span>Этап 0.1 · только чтение · вложения исключены</span>
        </div>
        {report && (
          <button className="icon-button" type="button" onClick={download} title="Скачать отчёт" aria-label="Скачать отчёт">
            <Download size={17} />
          </button>
        )}
      </header>

      <div className="jira-history-status" aria-busy={historyLoading}>
        <div className="jira-history-status-heading">
          <div>
            <h4>Фактическая история A1</h4>
            <span>Глобальный бюджет основной БД · raw payload недоступен через API</span>
          </div>
        </div>
        {historyStatus ? (
          <>
            <div className="jira-capacity-gates">
              <span className={historyStatus.storage.level === "NORMAL" ? "complete" : "review"}>
                Capacity · {capacityLevelLabel[historyStatus.storage.level]}
                {` · ${historyStatus.storage.utilizationPercent.toLocaleString("ru-RU")}%`}
                {` · ${formatBytes(historyStatus.storage.databaseBytes)} / ${formatBytes(historyStatus.storage.budgetBytes)}`}
              </span>
              <span className={historyStatus.retry.pending === 0 ? "complete" : "review"}>
                Retry: {historyStatus.retry.pending.toLocaleString("ru-RU")}
                {` · batch: ${historyStatus.retry.failedBatches.toLocaleString("ru-RU")}`}
              </span>
            </div>
            <dl className="jira-capacity-summary">
              <div><dt>Версий глобально</dt><dd>{historyStatus.global.versions.toLocaleString("ru-RU")}</dd></div>
              <div><dt>Тикетов проекта</dt><dd>{historyStatus.project.tickets.toLocaleString("ru-RU")}</dd></div>
              <div><dt>Версий проекта</dt><dd>{historyStatus.project.versions.toLocaleString("ru-RU")}</dd></div>
              <div><dt>Изменений меток</dt><dd>{(historyStatus.labelChanges?.project ?? 0).toLocaleString("ru-RU")}</dd></div>
              <div><dt>Средний снимок</dt><dd>{formatBytes(historyStatus.project.averageBytes)}</dd></div>
              <div><dt>Снимок P95</dt><dd>{formatBytes(historyStatus.project.p95Bytes)}</dd></div>
              <div><dt>Неполных снимков</dt><dd>{historyStatus.project.incompleteHydration.toLocaleString("ru-RU")}</dd></div>
            </dl>
            <p className="jira-history-cursor">
              Курсор: {historyStatus.cursor.updatedAt
                ? new Date(historyStatus.cursor.updatedAt).toLocaleString("ru-RU")
                : "ещё не установлен"}
              {historyStatus.cursor.lastFullReconciledAt
                ? ` · полная сверка ${new Date(historyStatus.cursor.lastFullReconciledAt).toLocaleString("ru-RU")}`
                : ""}
              {historyStatus.cursor.fullCursorIssueKey
                ? ` · полный импорт продолжится после ${historyStatus.cursor.fullCursorIssueKey}`
                : ""}
            </p>
            {completeness && (
              <div className="jira-backfill-completeness">
                <h4>Полнота backfill</h4>
                <dl className="jira-capacity-summary">
                  <div><dt>Тикетов области</dt><dd>{completeness.scope.tickets.toLocaleString("ru-RU")}</dd></div>
                  <div><dt>Стабильный Jira ID</dt><dd>{completeness.scope.stableJiraId.toLocaleString("ru-RU")}</dd></div>
                  <div><dt>С текущей версией</dt><dd>{completeness.scope.observed.toLocaleString("ru-RU")}</dd></div>
                  <div><dt>Полностью загружено</dt><dd>{completeness.scope.fullyHydrated.toLocaleString("ru-RU")}</dd></div>
                  <div><dt>Покрытие</dt><dd>{completeness.scope.coveragePercent === null ? "-" : `${completeness.scope.coveragePercent}%`}</dd></div>
                  <div><dt>Всего версий</dt><dd>{completeness.versions.total.toLocaleString("ru-RU")}</dd></div>
                </dl>
                <p className="jira-history-cursor">
                  {completeness.latestBackfill
                    ? `Последний backfill: ${completeness.latestBackfill.status}`
                      + ` · ${completeness.latestBackfill.hydratedIssueCount}/${completeness.latestBackfill.discoveredIssueCount} тикетов`
                      + ` · ${completeness.latestBackfill.jiraRequestCount} Jira-запросов`
                      + (completeness.latestBackfill.elapsedMs === null
                        ? ""
                        : ` · ${formatDuration(completeness.latestBackfill.elapsedMs)}`)
                    : "Backfill ещё не запускался"}
                  {completeness.historyWriteGap.runs > 0
                    ? ` · запусков без исторической записи: ${completeness.historyWriteGap.runs}`
                    : ""}
                  {completeness.scope.unversionedProjection > 0
                    ? ` · проекций вне истории: ${completeness.scope.unversionedProjection}`
                    : ""}
                </p>
              </div>
            )}
            {historyStatus.retry.items.length > 0 && (
              <div className="jira-history-retry-list">
                <strong>Ожидают повторной обработки</strong>
                <ul>
                  {historyStatus.retry.items.map((retry) => (
                    <li key={retry.issueKey}>
                      <b>{retry.issueKey}</b>
                      <span>{retry.reasonCode} · попыток {retry.attempts}</span>
                      <span>{retry.lastError}</span>
                      <small>
                        с {new Date(retry.firstFailedAt).toLocaleString("ru-RU")}
                        {` · следующая ${new Date(retry.nextRetryAt).toLocaleString("ru-RU")}`}
                      </small>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="jira-history-cursor">{historyLoading ? "Загружаю состояние..." : "История ещё не измерена"}</p>
        )}
      </div>

      <div className="jira-capacity-controls">
        <label>
          <span>Область</span>
          <select value={scopeType} onChange={(event) => setScopeType(event.target.value as "LABEL" | "EPIC")}>
            <option value="LABEL">Лейбл</option>
            <option value="EPIC">Код эпика</option>
          </select>
        </label>
        <label className="jira-capacity-scope-value">
          <span>{scopeType === "LABEL" ? "Лейбл" : "Код эпика"}</span>
          <input
            value={scopeValue}
            onChange={(event) => setScopeValue(event.target.value)}
            placeholder={scopeType === "LABEL" ? "cvte968" : "CVTE-123"}
          />
        </label>
        <label>
          <span>Выборка</span>
          <input type="number" min={10} max={100} value={sampleSize} onChange={(event) => setSampleSize(Number(event.target.value))} />
        </label>
        <label>
          <span>Бюджет истории, ГиБ</span>
          <input type="number" min={1} max={10000} value={storageBudgetGiB} onChange={(event) => setStorageBudgetGiB(Number(event.target.value))} />
        </label>
        <label>
          <span>Учтено ранее без текущей области, ГиБ</span>
          <input type="number" min={0} max={10000} step="0.001" value={allocatedHistoryGiB} onChange={(event) => setAllocatedHistoryGiB(Number(event.target.value))} />
        </label>
        <button className="button primary" type="button" onClick={run} disabled={running || !scopeValue.trim()}>
          <Play size={16} /> {running ? "Измеряю..." : "Запустить замер"}
        </button>
      </div>

      {report && (
        <div className="jira-capacity-results">
          <div className="jira-capacity-gates">
            <span className={report.security.status === "PASS" ? "complete" : "blocked"}>
              <ShieldCheck size={15} /> Security: {report.security.status}
              {report.security.attachmentReferencesStripped > 0
                ? ` · удалено ссылок: ${report.security.attachmentReferencesStripped}`
                : ""}
            </span>
            <span className={
              report.capacityGate.status === "PASS" && report.capacityGate.level === "NORMAL"
                ? "complete"
                : "review"
            }>
              Capacity: {report.capacityGate.status === "PASS" ? "PASS" : "нужна проверка"}
              {` · ${capacityLevelLabel[report.capacityGate.level]}`}
              {` · ${report.capacityGate.utilizationPercent.toLocaleString("ru-RU")}%`}
              {` · ${report.capacityGate.projectedTotalDatabaseGiB.toLocaleString("ru-RU")} / ${report.capacityGate.storageBudgetGiB.toLocaleString("ru-RU")} ГиБ`}
            </span>
          </div>

          <dl className="jira-capacity-summary">
            <div><dt>Тикетов</dt><dd>{report.scope.tickets.toLocaleString("ru-RU")}</dd></div>
            <div><dt>Измерено</dt><dd>{report.scope.observedSample} / {report.scope.requestedSample}</dd></div>
            <div><dt>Снимок P50</dt><dd>{formatBytes(report.sample.estimatedFullJsonBytes.p50)}</dd></div>
            <div><dt>Снимок P95</dt><dd>{formatBytes(report.sample.estimatedFullJsonBytes.p95)}</dd></div>
            <div><dt>История полная</dt><dd>{report.sample.completeChangelogPercent}%</dd></div>
            <div>
              <dt>Jira-запросы</dt>
              <dd>
                {report.collection.requests} · {formatDuration(report.collection.elapsedMs)}
                {report.collection.failedRequests > 0 ? ` · ошибок ${report.collection.failedRequests}` : ""}
              </dd>
            </div>
          </dl>

          <div className="table-scroll">
            <table className="jira-capacity-table">
              <thead><tr><th>Состав снимка</th><th>Минимум</th><th>P50</th><th>P95</th><th>Максимум</th></tr></thead>
              <tbody>
                {([
                  ["Поля", report.sample.fields],
                  ["Изменения changelog", report.sample.changelogHistories],
                  ["Комментарии", report.sample.comments],
                  ["Worklog", report.sample.worklogs],
                ] as Array<[string, Distribution]>).map(([label, distribution]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{distribution.min.toLocaleString("ru-RU")}</td>
                    <td>{distribution.p50.toLocaleString("ru-RU")}</td>
                    <td>{distribution.p95.toLocaleString("ru-RU")}</td>
                    <td>{distribution.max.toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-scroll">
            <table className="jira-capacity-table">
              <thead><tr><th>Версий на тикет</th><th>JSON</th><th>Основная БД</th><th>Gzip-архив</th><th>3 экземпляра БД (справочно)</th></tr></thead>
              <tbody>
                {report.projections.map((item) => (
                  <tr key={item.versionsPerTicket}>
                    <td>{item.versionsPerTicket}</td>
                    <td>{item.rawJsonGiB.toLocaleString("ru-RU")} ГиБ</td>
                    <td>{item.estimatedDatabaseGiB.toLocaleString("ru-RU")} ГиБ</td>
                    <td>{item.estimatedGzipArchiveGiB.toLocaleString("ru-RU")} ГиБ</td>
                    <td>{item.threeDatabaseCopiesGiB.toLocaleString("ru-RU")} ГиБ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(report.capacityGate.reasons.length > 0 || report.capacityGate.warnings.length > 0) && (
            <ul className="jira-capacity-reasons">
              {report.capacityGate.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              {report.capacityGate.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
