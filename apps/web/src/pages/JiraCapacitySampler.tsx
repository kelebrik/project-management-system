import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { intlLocale } from "../i18n/locale";
import { useI18n as useLocaleTranslation } from "../i18n/I18nProvider";
import type { Locale } from "../i18n/types";
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

function formatBytes(value: number, uiLocale: Locale) {
  if (value < 1024) return `${Math.round(value)} Б`;
  if (value < 1024 ** 2) return `${(value / 1024).toLocaleString(intlLocale(uiLocale), { maximumFractionDigits: 1 })} КБ`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toLocaleString(intlLocale(uiLocale), { maximumFractionDigits: 1 })} МБ`;
  return `${(value / 1024 ** 3).toLocaleString(intlLocale(uiLocale), { maximumFractionDigits: 2 })} ГиБ`;
}

function formatDuration(value: number, uiLocale: Locale) {
  if (value < 1_000) return `${value} мс`;
  return `${(value / 1_000).toLocaleString(intlLocale(uiLocale), { maximumFractionDigits: 1 })} с`;
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
  const { t: uiText } = useInterfaceTranslation();
  const { locale: uiLocale } = useLocaleTranslation();
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
          <h3><DatabaseZap size={18} /> {uiText("ui.jira.fullHistoryCapacity")}</h3>
          <span>{uiText("ui.jira.stageReadOnlyNote")}</span>
        </div>
        {report && (
          <button className="icon-button" type="button" onClick={download} title={uiText("ui.jira.downloadReport")} aria-label={uiText("ui.jira.downloadReport")}>
            <Download size={17} />
          </button>
        )}
      </header>

      <div className="jira-history-status" aria-busy={historyLoading}>
        <div className="jira-history-status-heading">
          <div>
            <h4>{uiText("ui.jira.actualA1History")}</h4>
            <span>{uiText("ui.jira.globalDbBudgetNote")}</span>
          </div>
        </div>
        {historyStatus ? (
          <>
            <div className="jira-capacity-gates">
              <span className={historyStatus.storage.level === "NORMAL" ? "complete" : "review"}>
                Capacity · {capacityLevelLabel[historyStatus.storage.level]}
                {` · ${historyStatus.storage.utilizationPercent.toLocaleString(intlLocale(uiLocale))}%`}
                {` · ${formatBytes(historyStatus.storage.databaseBytes, uiLocale)} / ${formatBytes(historyStatus.storage.budgetBytes, uiLocale)}`}
              </span>
              <span className={historyStatus.retry.pending === 0 ? "complete" : "review"}>
                Retry: {historyStatus.retry.pending.toLocaleString(intlLocale(uiLocale))}
                {` · batch: ${historyStatus.retry.failedBatches.toLocaleString(intlLocale(uiLocale))}`}
              </span>
            </div>
            <dl className="jira-capacity-summary">
              <div><dt>{uiText("ui.jira.versionsGlobally")}</dt><dd>{historyStatus.global.versions.toLocaleString(intlLocale(uiLocale))}</dd></div>
              <div><dt>{uiText("ui.jira.projectTickets")}</dt><dd>{historyStatus.project.tickets.toLocaleString(intlLocale(uiLocale))}</dd></div>
              <div><dt>{uiText("ui.jira.projectVersions")}</dt><dd>{historyStatus.project.versions.toLocaleString(intlLocale(uiLocale))}</dd></div>
              <div><dt>{uiText("ui.jira.labelChanges")}</dt><dd>{(historyStatus.labelChanges?.project ?? 0).toLocaleString(intlLocale(uiLocale))}</dd></div>
              <div><dt>{uiText("ui.jira.averageSnapshot")}</dt><dd>{formatBytes(historyStatus.project.averageBytes, uiLocale)}</dd></div>
              <div><dt>{uiText("ui.jira.snapshotP95")}</dt><dd>{formatBytes(historyStatus.project.p95Bytes, uiLocale)}</dd></div>
              <div><dt>{uiText("ui.jira.incompleteSnapshots")}</dt><dd>{historyStatus.project.incompleteHydration.toLocaleString(intlLocale(uiLocale))}</dd></div>
            </dl>
            <p className="jira-history-cursor">
              {uiText("ui.jira.cursorLabel")} {historyStatus.cursor.updatedAt
                ? new Date(historyStatus.cursor.updatedAt).toLocaleString(intlLocale(uiLocale))
                : uiText("ui.jira.notSetYet")}
              {historyStatus.cursor.lastFullReconciledAt
                ? ` · полная сверка ${new Date(historyStatus.cursor.lastFullReconciledAt).toLocaleString(intlLocale(uiLocale))}`
                : ""}
              {historyStatus.cursor.fullCursorIssueKey
                ? ` · полный импорт продолжится после ${historyStatus.cursor.fullCursorIssueKey}`
                : ""}
            </p>
            {completeness && (
              <div className="jira-backfill-completeness">
                <h4>{uiText("ui.jira.backfillCompleteness")}</h4>
                <dl className="jira-capacity-summary">
                  <div><dt>{uiText("ui.jira.ticketsInScope")}</dt><dd>{completeness.scope.tickets.toLocaleString(intlLocale(uiLocale))}</dd></div>
                  <div><dt>{uiText("ui.jira.stableJiraId")}</dt><dd>{completeness.scope.stableJiraId.toLocaleString(intlLocale(uiLocale))}</dd></div>
                  <div><dt>{uiText("ui.jira.withCurrentVersion")}</dt><dd>{completeness.scope.observed.toLocaleString(intlLocale(uiLocale))}</dd></div>
                  <div><dt>{uiText("ui.jira.fullyLoaded")}</dt><dd>{completeness.scope.fullyHydrated.toLocaleString(intlLocale(uiLocale))}</dd></div>
                  <div><dt>{uiText("ui.jira.coverage")}</dt><dd>{completeness.scope.coveragePercent === null ? "-" : `${completeness.scope.coveragePercent}%`}</dd></div>
                  <div><dt>{uiText("ui.jira.totalVersions")}</dt><dd>{completeness.versions.total.toLocaleString(intlLocale(uiLocale))}</dd></div>
                </dl>
                <p className="jira-history-cursor">
                  {completeness.latestBackfill
                    ? `Последний backfill: ${completeness.latestBackfill.status}`
                      + ` · ${completeness.latestBackfill.hydratedIssueCount}/${completeness.latestBackfill.discoveredIssueCount} тикетов`
                      + ` · ${completeness.latestBackfill.jiraRequestCount} Jira-запросов`
                      + (completeness.latestBackfill.elapsedMs === null
                        ? ""
                        : ` · ${formatDuration(completeness.latestBackfill.elapsedMs, uiLocale)}`)
                    : uiText("ui.jira.backfillNotRunYet")}
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
                <strong>{uiText("ui.jira.awaitingReprocessing")}</strong>
                <ul>
                  {historyStatus.retry.items.map((retry) => (
                    <li key={retry.issueKey}>
                      <b>{retry.issueKey}</b>
                      <span>{retry.reasonCode} {uiText("ui.jira.attemptsSuffix")} {retry.attempts}</span>
                      <span>{retry.lastError}</span>
                      <small>
                        {uiText("ui.jira.fromPreposition")} {new Date(retry.firstFailedAt).toLocaleString(intlLocale(uiLocale))}
                        {` · следующая ${new Date(retry.nextRetryAt).toLocaleString(intlLocale(uiLocale))}`}
                      </small>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="jira-history-cursor">{historyLoading ? uiText("ui.jira.loadingState") : uiText("ui.jira.historyNotMeasuredYet")}</p>
        )}
      </div>

      <div className="jira-capacity-controls">
        <label>
          <span>{uiText("ui.jira.scope")}</span>
          <select value={scopeType} onChange={(event) => setScopeType(event.target.value as "LABEL" | "EPIC")}>
            <option value="LABEL">{uiText("ui.jira.label")}</option>
            <option value="EPIC">{uiText("ui.jira.epicCode")}</option>
          </select>
        </label>
        <label className="jira-capacity-scope-value">
          <span>{scopeType === "LABEL" ? uiText("ui.jira.label") : uiText("ui.jira.epicCode")}</span>
          <input
            value={scopeValue}
            onChange={(event) => setScopeValue(event.target.value)}
            placeholder={scopeType === "LABEL" ? "cvte968" : "CVTE-123"}
          />
        </label>
        <label>
          <span>{uiText("ui.jira.sample")}</span>
          <input type="number" min={10} max={100} value={sampleSize} onChange={(event) => setSampleSize(Number(event.target.value))} />
        </label>
        <label>
          <span>{uiText("ui.jira.historyBudgetGib")}</span>
          <input type="number" min={1} max={10000} value={storageBudgetGiB} onChange={(event) => setStorageBudgetGiB(Number(event.target.value))} />
        </label>
        <label>
          <span>{uiText("ui.jira.previouslyCountedExcludingScopeGib")}</span>
          <input type="number" min={0} max={10000} step="0.001" value={allocatedHistoryGiB} onChange={(event) => setAllocatedHistoryGiB(Number(event.target.value))} />
        </label>
        <button className="button primary" type="button" onClick={run} disabled={running || !scopeValue.trim()}>
          <Play size={16} /> {running ? uiText("ui.jira.measuring") : uiText("ui.jira.runMeasurement")}
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
              Capacity: {report.capacityGate.status === "PASS" ? "PASS" : uiText("ui.jira.needsChecking")}
              {` · ${capacityLevelLabel[report.capacityGate.level]}`}
              {` · ${report.capacityGate.utilizationPercent.toLocaleString(intlLocale(uiLocale))}%`}
              {` · ${report.capacityGate.projectedTotalDatabaseGiB.toLocaleString(intlLocale(uiLocale))} / ${report.capacityGate.storageBudgetGiB.toLocaleString(intlLocale(uiLocale))} ГиБ`}
            </span>
          </div>

          <dl className="jira-capacity-summary">
            <div><dt>{uiText("ui.jira.ticketsCount")}</dt><dd>{report.scope.tickets.toLocaleString(intlLocale(uiLocale))}</dd></div>
            <div><dt>{uiText("ui.jira.measured")}</dt><dd>{report.scope.observedSample} / {report.scope.requestedSample}</dd></div>
            <div><dt>{uiText("ui.jira.snapshotP50")}</dt><dd>{formatBytes(report.sample.estimatedFullJsonBytes.p50, uiLocale)}</dd></div>
            <div><dt>{uiText("ui.jira.snapshotP95")}</dt><dd>{formatBytes(report.sample.estimatedFullJsonBytes.p95, uiLocale)}</dd></div>
            <div><dt>{uiText("ui.jira.historyComplete")}</dt><dd>{report.sample.completeChangelogPercent}%</dd></div>
            <div>
              <dt>{uiText("ui.jira.jiraRequests")}</dt>
              <dd>
                {report.collection.requests} · {formatDuration(report.collection.elapsedMs, uiLocale)}
                {report.collection.failedRequests > 0 ? ` · ошибок ${report.collection.failedRequests}` : ""}
              </dd>
            </div>
          </dl>

          <div className="table-scroll">
            <table className="jira-capacity-table">
              <thead><tr><th>{uiText("ui.jira.snapshotContents")}</th><th>{uiText("ui.jira.minimum")}</th><th>P50</th><th>P95</th><th>{uiText("ui.jira.maximum")}</th></tr></thead>
              <tbody>
                {([
                  ["Поля", report.sample.fields],
                  ["Изменения changelog", report.sample.changelogHistories],
                  ["Комментарии", report.sample.comments],
                  ["Worklog", report.sample.worklogs],
                ] as Array<[string, Distribution]>).map(([label, distribution]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{distribution.min.toLocaleString(intlLocale(uiLocale))}</td>
                    <td>{distribution.p50.toLocaleString(intlLocale(uiLocale))}</td>
                    <td>{distribution.p95.toLocaleString(intlLocale(uiLocale))}</td>
                    <td>{distribution.max.toLocaleString(intlLocale(uiLocale))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-scroll">
            <table className="jira-capacity-table">
              <thead><tr><th>{uiText("ui.jira.versionsPerTicket")}</th><th>JSON</th><th>{uiText("ui.jira.primaryDatabase")}</th><th>{uiText("ui.jira.gzipArchive")}</th><th>{uiText("ui.jira.threeDbInstancesReference")}</th></tr></thead>
              <tbody>
                {report.projections.map((item) => (
                  <tr key={item.versionsPerTicket}>
                    <td>{item.versionsPerTicket}</td>
                    <td>{item.rawJsonGiB.toLocaleString(intlLocale(uiLocale))} {uiText("ui.jira.gib")}</td>
                    <td>{item.estimatedDatabaseGiB.toLocaleString(intlLocale(uiLocale))} {uiText("ui.jira.gib")}</td>
                    <td>{item.estimatedGzipArchiveGiB.toLocaleString(intlLocale(uiLocale))} {uiText("ui.jira.gib")}</td>
                    <td>{item.threeDatabaseCopiesGiB.toLocaleString(intlLocale(uiLocale))} {uiText("ui.jira.gib")}</td>
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
