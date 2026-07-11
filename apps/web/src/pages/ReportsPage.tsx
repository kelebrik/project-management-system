import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import { apiClient } from "../api/client";
import { date } from "../app/dateUtils";
import type { ProjectDetails, ProjectListItem } from "../app/domainTypes";
import { printSectionAsPdf } from "../app/pdfPrint";
import {
  createProjectReport,
  projectReportText,
  type ReportOptions,
  type ReportPeriodDays,
  type ReportTask,
} from "../app/reportBuilder";
import { wbsStatusLabel } from "../app/labels";
import { SegmentedFilter } from "../components/SegmentedFilter";
import { usePageContext } from "./PageContext";

type ReportPeriodValue = "7" | "14" | "30";

const PERIOD_OPTIONS: Array<{ value: ReportPeriodValue; label: string }> = [
  { value: "7", label: "Неделя" },
  { value: "14", label: "2 недели" },
  { value: "30", label: "Месяц" },
];

function ReportTaskList({ items }: { items: ReportTask[] }) {
  if (items.length === 0) return <div className="report-empty">Нет данных за выбранный период</div>;
  return (
    <div className="report-item-list">
      {items.map((item) => (
        <div className="report-item" key={item.id}>
          <span>{item.code}</span>
          <div>
            <b>{item.title}</b>
            <small>{item.owner || "Ответственный не задан"}</small>
          </div>
          <em>{wbsStatusLabel(item.status)}</em>
          <time>{date(item.dueDate)}</time>
        </div>
      ))}
    </div>
  );
}

export function ReportsPage() {
  const { projects, selectedProjectId } = usePageContext();
  const projectOptions = (projects as ProjectListItem[]).filter(
    (item) => item.status !== "CLOSED",
  );
  const [projectId, setProjectId] = useState(
    () => selectedProjectId ?? projectOptions[0]?.id ?? "",
  );
  const effectiveProjectId = projectId || projectOptions[0]?.id || "";
  const [period, setPeriod] = useState<ReportPeriodValue>("7");
  const [options, setOptions] = useState<ReportOptions>({
    risks: true,
    problems: true,
    issues: true,
  });
  const [loadedProject, setLoadedProject] = useState<{
    id: string;
    data: ProjectDetails | null;
    error: string | null;
  }>({ id: "", data: null, error: null });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!effectiveProjectId) return;
    let cancelled = false;
    apiClient
      .get<ProjectDetails>(
        `/api/projects/${effectiveProjectId}/overview`,
        "Не удалось загрузить данные для отчёта",
      )
      .then((result) => {
        if (!cancelled) {
          setLoadedProject({ id: effectiveProjectId, data: result, error: null });
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setLoadedProject({
            id: effectiveProjectId,
            data: null,
            error:
              loadError instanceof Error
                ? loadError.message
                : "Не удалось загрузить данные для отчёта",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveProjectId]);

  const project = loadedProject.id === effectiveProjectId ? loadedProject.data : null;
  const error = loadedProject.id === effectiveProjectId ? loadedProject.error : null;
  const loading = Boolean(effectiveProjectId && loadedProject.id !== effectiveProjectId);
  const periodDays = Number(period) as ReportPeriodDays;

  const report = useMemo(
    () => (project ? createProjectReport(project, periodDays, options) : null),
    [options, periodDays, project],
  );

  const toggleOption = (key: keyof ReportOptions) => {
    setOptions((current) => ({ ...current, [key]: !current[key] }));
  };

  const copyReport = async () => {
    if (!project || !report) return;
    await navigator.clipboard.writeText(projectReportText(project, report));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="reports-page">
      <header className="reports-header">
        <div>
          <h2>Конструктор отчётов</h2>
          <p>Статус проекта за выбранный период</p>
        </div>
        <div className="reports-actions">
          <button type="button" onClick={() => void copyReport()} disabled={!report}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Скопировано" : "Копировать"}
          </button>
          <button
            type="button"
            onClick={() => project && printSectionAsPdf("project-status-report", `Отчёт ${project.code}`)}
            disabled={!report}
          >
            <Printer size={16} />
            PDF
          </button>
        </div>
      </header>

      <div className="report-builder-layout">
        <aside className="report-controls" aria-label="Настройки отчёта">
          <label className="report-control-field">
            <span>Проект</span>
            <select value={effectiveProjectId} onChange={(event) => setProjectId(event.target.value)}>
              {projectOptions.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </label>

          <div className="report-control-field">
            <span>Период</span>
            <SegmentedFilter<ReportPeriodValue>
              ariaLabel="Период отчёта"
              value={period}
              onChange={setPeriod}
              options={PERIOD_OPTIONS}
            />
          </div>

          <fieldset className="report-options">
            <legend>Дополнительно включить</legend>
            <label>
              <input type="checkbox" checked={options.risks} onChange={() => toggleOption("risks")} />
              <span>Риски</span>
            </label>
            <label>
              <input type="checkbox" checked={options.problems} onChange={() => toggleOption("problems")} />
              <span>Проблемы</span>
            </label>
            <label>
              <input type="checkbox" checked={options.issues} onChange={() => toggleOption("issues")} />
              <span>Вопросы</span>
            </label>
          </fieldset>
        </aside>

        <article className="report-preview" id="project-status-report">
          {loading && <div className="report-loading">Формируем отчёт...</div>}
          {error && <div className="report-error">{error}</div>}
          {!loading && !error && project && report && (
            <>
              <div className="report-document-header">
                <div>
                  <span>{project.code}</span>
                  <h3>{project.name}</h3>
                </div>
                <dl>
                  <div><dt>Период</dt><dd>{date(report.pastStart)} - {date(report.generatedAt)}</dd></div>
                  <div><dt>Следующий горизонт</dt><dd>до {date(report.futureEnd)}</dd></div>
                  <div><dt>РП</dt><dd>{project.projectManager || "не назначен"}</dd></div>
                </dl>
              </div>

              <div className="report-summary-counts">
                <span><b>{report.done.length}</b> сделано</span>
                <span><b>{report.inProgress.length}</b> в работе</span>
                <span><b>{report.upcoming.length}</b> предстоит</span>
              </div>

              <section className="report-section tone-done">
                <h4>Что сделано <span>{report.done.length}</span></h4>
                <ReportTaskList items={report.done} />
              </section>
              <section className="report-section tone-progress">
                <h4>Что в работе <span>{report.inProgress.length}</span></h4>
                <ReportTaskList items={report.inProgress} />
              </section>
              <section className="report-section tone-upcoming">
                <h4>Что предстоит сделать <span>{report.upcoming.length}</span></h4>
                <ReportTaskList items={report.upcoming} />
              </section>

              {options.risks && (
                <section className="report-section report-register tone-risk">
                  <h4>Риски <span>{report.risks.length}</span></h4>
                  {report.risks.map((item) => (
                    <div className="report-register-row" key={item.id}>
                      <b>{item.title}</b><span>{item.owner || "Ответственный не задан"}</span><em>Оценка {item.riskScore}</em>
                    </div>
                  ))}
                  {report.risks.length === 0 && <div className="report-empty">Активных рисков нет</div>}
                </section>
              )}
              {options.problems && (
                <section className="report-section report-register tone-problem">
                  <h4>Проблемы <span>{report.problems.length}</span></h4>
                  {report.problems.map((item) => (
                    <div className="report-register-row" key={item.id}>
                      <b>{item.title}</b><span>{item.owner || "Ответственный не задан"}</span><em>{date(item.dueDate)}</em>
                    </div>
                  ))}
                  {report.problems.length === 0 && <div className="report-empty">Активных проблем нет</div>}
                </section>
              )}
              {options.issues && (
                <section className="report-section report-register tone-issue">
                  <h4>Вопросы <span>{report.issues.length}</span></h4>
                  {report.issues.map((item) => (
                    <div className="report-register-row" key={item.id}>
                      <b>{item.title}</b><span>{item.owner || "Ответственный не задан"}</span><em>{item.status}</em>
                    </div>
                  ))}
                  {report.issues.length === 0 && <div className="report-empty">Открытых вопросов нет</div>}
                </section>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
