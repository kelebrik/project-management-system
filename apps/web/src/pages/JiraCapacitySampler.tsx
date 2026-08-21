import { DatabaseZap, Download, Play, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { apiClient } from "../api/client";
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
  return `${(value / 1024 ** 2).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

function formatDuration(value: number) {
  if (value < 1_000) return `${value} мс`;
  return `${(value / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`;
}

export function JiraCapacitySampler() {
  const { currentUser, project, setError, setNotice } = usePageContext();
  const [scopeType, setScopeType] = useState<"LABEL" | "EPIC">("LABEL");
  const [scopeValue, setScopeValue] = useState("");
  const [sampleSize, setSampleSize] = useState(20);
  const [storageBudgetGiB, setStorageBudgetGiB] = useState(5);
  const [allocatedHistoryGiB, setAllocatedHistoryGiB] = useState(0);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<CapacityReport | null>(null);

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
            <div><dt>Jira-запросы</dt><dd>{report.collection.requests} · {formatDuration(report.collection.elapsedMs)}</dd></div>
          </dl>

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
