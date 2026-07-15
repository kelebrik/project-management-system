import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { Check, ChevronDown, Copy, GripVertical, Printer } from "lucide-react";
import { apiClient } from "../api/client";
import { date } from "../app/dateUtils";
import type {
  Issue,
  ProjectDetails,
  ProjectListItem,
  RaidItem,
} from "../app/domainTypes";
import { printSectionAsPdf } from "../app/pdfPrint";
import {
  DEFAULT_REPORT_FIELDS,
  REPORT_FIELDS,
  createProjectReport,
  projectReportText,
  reportFieldText,
  type ReportActivity,
  type ProjectReport,
  type ReportFieldKey,
  type ReportKind,
  type ReportPeriodDays,
  type ReportTask,
} from "../app/reportBuilder";
import { usePageContext } from "./PageContext";

type ReportPeriodValue = "7" | "14";
type ReportDataItem = ReportTask | RaidItem | Issue;

const PERIOD_OPTIONS: Array<{ value: ReportPeriodValue; label: string }> = [
  { value: "7", label: "Закрыто на этой неделе" },
  { value: "14", label: "Закрыто за две недели" },
];

const ACTIVITY_OPTIONS: Array<{ value: ReportActivity; label: string }> = [
  { value: "closed", label: "Закрыто за две недели" },
  { value: "opened", label: "Открыто за две недели" },
];

const REPORT_KIND_OPTIONS: Array<{ value: ReportKind; label: string }> = [
  { value: "tasks", label: "Задачи" },
  { value: "raid", label: "Риски и проблемы" },
  { value: "issues", label: "Открытые вопросы" },
];

const FIELD_WIDTHS: Record<ReportFieldKey, string> = {
  workPackage: "minmax(130px, 160px)",
  task: "minmax(220px, 1fr)",
  status: "minmax(105px, 130px)",
  startDate: "100px",
  endDate: "110px",
  owner: "minmax(130px, 160px)",
  type: "110px",
  title: "minmax(240px, 1fr)",
  riskScore: "80px",
  dueDate: "100px",
  impact: "minmax(180px, 1fr)",
  severity: "110px",
  decisionRequired: "120px",
};

const FIELD_MIN_WIDTHS: Record<ReportFieldKey, number> = {
  workPackage: 130,
  task: 220,
  status: 105,
  startDate: 100,
  endDate: 110,
  owner: 130,
  type: 110,
  title: 240,
  riskScore: 80,
  dueDate: 100,
  impact: 180,
  severity: 110,
  decisionRequired: 120,
};

function initialFieldOrder(): Record<ReportKind, ReportFieldKey[]> {
  return {
    tasks: REPORT_FIELDS.tasks.map((field) => field.key),
    raid: REPORT_FIELDS.raid.map((field) => field.key),
    issues: REPORT_FIELDS.issues.map((field) => field.key),
  };
}

function initialSelectedFields(): Record<ReportKind, ReportFieldKey[]> {
  return {
    tasks: [...DEFAULT_REPORT_FIELDS.tasks],
    raid: [...DEFAULT_REPORT_FIELDS.raid],
    issues: [...DEFAULT_REPORT_FIELDS.issues],
  };
}

function reportGridStyle(fields: ReportFieldKey[]): CSSProperties {
  const minWidth = fields.reduce((total, field) => total + FIELD_MIN_WIDTHS[field], 0);
  return {
    gridTemplateColumns: fields.map((field) => FIELD_WIDTHS[field]).join(" "),
    minWidth: `${Math.max(360, minWidth)}px`,
  };
}

function ReportDataTable({
  kind,
  fields,
  items,
  emptyText,
}: {
  kind: ReportKind;
  fields: ReportFieldKey[];
  items: ReportDataItem[];
  emptyText: string;
}) {
  if (items.length === 0) return <div className="report-empty">{emptyText}</div>;
  const fieldLabels = new Map(REPORT_FIELDS[kind].map((field) => [field.key, field.label]));
  const gridStyle = reportGridStyle(fields);

  return (
    <div className="report-data-list">
      <div className="report-data-row report-data-head" style={gridStyle}>
        {fields.map((field) => <span key={field}>{fieldLabels.get(field)}</span>)}
      </div>
      {items.map((item) => (
        <div className="report-data-row" key={item.id} style={gridStyle}>
          {fields.map((field) => (
            <span className={`report-data-cell field-${field}`} key={field}>
              {reportFieldText(kind, field, item)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function ReportFieldPicker({
  kind,
  fieldOrder,
  selectedFields,
  draggedField,
  onToggle,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  kind: ReportKind;
  fieldOrder: ReportFieldKey[];
  selectedFields: ReportFieldKey[];
  draggedField: ReportFieldKey | null;
  onToggle: (field: ReportFieldKey) => void;
  onDragStart: (field: ReportFieldKey, event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onDrop: (field: ReportFieldKey) => void;
}) {
  const definitions = new Map(REPORT_FIELDS[kind].map((field) => [field.key, field]));
  return (
    <div className="report-field-picker">
      <div className="report-field-picker-head">
        <span>Поля</span>
        <small>{selectedFields.length}/{fieldOrder.length}</small>
      </div>
      <div className="report-field-list">
        {fieldOrder.map((field) => {
          const definition = definitions.get(field);
          if (!definition) return null;
          const selected = selectedFields.includes(field);
          return (
            <div
              className={`report-field-row ${draggedField === field ? "dragging" : ""}`}
              key={field}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                onDrop(field);
              }}
            >
              <button
                type="button"
                className="report-field-drag"
                draggable
                onDragStart={(event) => onDragStart(field, event)}
                onDragEnd={onDragEnd}
                aria-label={`Перетащить поле ${definition.label}`}
                title={`Перетащить поле ${definition.label}`}
              >
                <GripVertical size={15} />
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={selected && selectedFields.length === 1}
                  onChange={() => onToggle(field)}
                />
                <span>{definition.label}</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskReportSections({
  report,
  fields,
}: {
  report: ProjectReport;
  fields: ReportFieldKey[];
}) {
  return (
    <>
      <section className="report-section tone-done">
        <h4>Что сделано <span>{report.done.length}</span></h4>
        <ReportDataTable kind="tasks" fields={fields} items={report.done} emptyText="Нет закрытых задач за выбранный период" />
      </section>
      <section className="report-section tone-progress">
        <h4>Что в работе <span>{report.inProgress.length}</span></h4>
        <ReportDataTable kind="tasks" fields={fields} items={report.inProgress} emptyText="Нет задач в работе за выбранный период" />
      </section>
      <section className="report-section tone-upcoming">
        <h4>Что предстоит сделать <span>{report.upcoming.length}</span></h4>
        <ReportDataTable kind="tasks" fields={fields} items={report.upcoming} emptyText="Нет предстоящих задач в выбранном горизонте" />
      </section>
    </>
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
  const [activity, setActivity] = useState<ReportActivity>("opened");
  const [reportKind, setReportKind] = useState<ReportKind>("tasks");
  const [fieldOrderByKind, setFieldOrderByKind] = useState(initialFieldOrder);
  const [selectedFieldsByKind, setSelectedFieldsByKind] = useState(initialSelectedFields);
  const [draggedField, setDraggedField] = useState<ReportFieldKey | null>(null);
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
    () => (project ? createProjectReport(project, periodDays) : null),
    [periodDays, project],
  );
  const fieldOrder = fieldOrderByKind[reportKind];
  const selectedFields = selectedFieldsByKind[reportKind];
  const activeFields = fieldOrder.filter((field) => selectedFields.includes(field));
  const visibleRaidItems = report
    ? activity === "closed" ? report.closedRaidItems : report.recentRaidItems
    : [];
  const visibleIssues = report
    ? activity === "closed" ? report.closedIssues : report.recentOpenIssues
    : [];
  const risks = visibleRaidItems.filter((item) => item.type === "RISK");
  const problems = visibleRaidItems.filter((item) => item.type === "DEPENDENCY");

  const toggleField = (field: ReportFieldKey) => {
    setSelectedFieldsByKind((current) => {
      const selected = current[reportKind];
      if (selected.includes(field)) {
        if (selected.length === 1) return current;
        return { ...current, [reportKind]: selected.filter((item) => item !== field) };
      }
      return { ...current, [reportKind]: [...selected, field] };
    });
  };

  const dropField = (targetField: ReportFieldKey) => {
    if (!draggedField || draggedField === targetField) return;
    setFieldOrderByKind((current) => {
      const order = [...current[reportKind]];
      const sourceIndex = order.indexOf(draggedField);
      const targetIndex = order.indexOf(targetField);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      order.splice(sourceIndex, 1);
      order.splice(targetIndex, 0, draggedField);
      return { ...current, [reportKind]: order };
    });
    setDraggedField(null);
  };

  const copyReport = async () => {
    if (!project || !report) return;
    await navigator.clipboard.writeText(
      projectReportText(project, report, reportKind, activeFields, activity),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="reports-page">
      <header className="reports-header">
        <div>
          <h1>Конструктор отчётов</h1>
          <p>Статус проекта за выбранный период</p>
        </div>
        <div className="reports-actions">
          <button type="button" onClick={() => void copyReport()} disabled={!report}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Скопировано" : "Копировать"}
          </button>
          <button
            type="button"
            onClick={() =>
              project &&
              printSectionAsPdf("project-status-report", `Отчёт ${project.code}`)
            }
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
            <div className="report-select-wrap">
              <select
                value={effectiveProjectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {projectOptions.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={17} strokeWidth={2.4} aria-hidden="true" />
            </div>
          </label>

          <div className="report-constructor">
            <label className="report-control-field">
              <span>Содержание</span>
              <div className="report-select-wrap">
                <select
                  value={reportKind}
                  onChange={(event) => {
                    setReportKind(event.target.value as ReportKind);
                    setDraggedField(null);
                  }}
                >
                  {REPORT_KIND_OPTIONS.map((item) => (
                    <option value={item.value} key={item.value}>{item.label}</option>
                  ))}
                </select>
                <ChevronDown size={17} strokeWidth={2.4} aria-hidden="true" />
              </div>
            </label>
            <div className="report-control-field">
              <span>Период</span>
              <div className="segmented-control report-period-control" aria-label="Период отчёта">
                {(reportKind === "tasks" ? PERIOD_OPTIONS : ACTIVITY_OPTIONS).map((item) => {
                  const selected = reportKind === "tasks"
                    ? period === item.value
                    : activity === item.value;
                  return (
                    <button
                      type="button"
                      className={selected ? "active" : ""}
                      aria-pressed={selected}
                      key={item.value}
                      onClick={() => {
                        if (reportKind === "tasks") {
                          setPeriod(item.value as ReportPeriodValue);
                        } else {
                          setActivity(item.value as ReportActivity);
                        }
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <ReportFieldPicker
              kind={reportKind}
              fieldOrder={fieldOrder}
              selectedFields={selectedFields}
              draggedField={draggedField}
              onToggle={toggleField}
              onDragStart={(field, event) => {
                setDraggedField(field);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/report-field", field);
              }}
              onDragEnd={() => setDraggedField(null)}
              onDrop={dropField}
            />
          </div>
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
                  <small>{REPORT_KIND_OPTIONS.find((item) => item.value === reportKind)?.label}</small>
                </div>
                <dl>
                  {reportKind === "tasks" ? (
                    <>
                      <div><dt>Период</dt><dd>{date(report.pastStart)} - {date(report.generatedAt)}</dd></div>
                      <div><dt>Следующий горизонт</dt><dd>до {date(report.futureEnd)}</dd></div>
                    </>
                  ) : (
                    <>
                      <div><dt>Период</dt><dd>{date(report.activityStart)} - {date(report.generatedAt)}</dd></div>
                      <div><dt>Записей</dt><dd>{reportKind === "raid" ? visibleRaidItems.length : visibleIssues.length}</dd></div>
                    </>
                  )}
                  <div><dt>РП</dt><dd>{project.projectManager || "не назначен"}</dd></div>
                </dl>
              </div>

              <div className="report-summary-counts">
                {reportKind === "tasks" && (
                  <>
                    <span><b>{report.done.length}</b> сделано</span>
                    <span><b>{report.inProgress.length}</b> в работе</span>
                    <span><b>{report.upcoming.length}</b> предстоит</span>
                  </>
                )}
                {reportKind === "raid" && (
                  <>
                    <span><b>{risks.length}</b> рисков</span>
                    <span><b>{problems.length}</b> проблем</span>
                  </>
                )}
                {reportKind === "issues" && (
                  <span><b>{visibleIssues.length}</b> {activity === "closed" ? "закрытых" : "открытых"} вопросов</span>
                )}
              </div>

              {reportKind === "tasks" && <TaskReportSections report={report} fields={activeFields} />}
              {reportKind === "raid" && (
                <>
                  <section className="report-section tone-risk">
                    <h4>{activity === "closed" ? "Закрытые риски" : "Открытые риски"} <span>{risks.length}</span></h4>
                    <ReportDataTable kind="raid" fields={activeFields} items={risks} emptyText={activity === "closed" ? "Закрытых рисков за две недели нет" : "Новых открытых рисков за две недели нет"} />
                  </section>
                  <section className="report-section tone-problem">
                    <h4>{activity === "closed" ? "Закрытые проблемы" : "Открытые проблемы"} <span>{problems.length}</span></h4>
                    <ReportDataTable kind="raid" fields={activeFields} items={problems} emptyText={activity === "closed" ? "Закрытых проблем за две недели нет" : "Новых открытых проблем за две недели нет"} />
                  </section>
                </>
              )}
              {reportKind === "issues" && (
                <section className="report-section tone-issue">
                  <h4>{activity === "closed" ? "Закрытые вопросы" : "Открытые вопросы"} <span>{visibleIssues.length}</span></h4>
                  <ReportDataTable kind="issues" fields={activeFields} items={visibleIssues} emptyText={activity === "closed" ? "Закрытых вопросов за две недели нет" : "Новых открытых вопросов за две недели нет"} />
                </section>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
