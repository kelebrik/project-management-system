import type { SimpleTranslationKey } from "../i18n/types";
import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { Check, ChevronDown, Copy, GripVertical, Printer } from "lucide-react";
import { ApiError, apiClient } from "../api/client";
import { useI18n } from "../i18n/I18nProvider";
import type {
  Issue,
  ProjectDetails,
  ProjectListItem,
  RaidItem,
} from "../app/domainTypes";
import { printSectionAsPdf } from "../app/pdfPrint";
import {
  localizedReportFields,
  DEFAULT_REPORT_FIELDS,
  REPORT_FIELD_ORDER,
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
import { WeeklyBriefPanel } from '../components/automation/WeeklyBriefPanel';

type ReportPeriodValue = "7" | "14";
type ReportDataItem = ReportTask | RaidItem | Issue;

const PERIOD_OPTIONS: Array<{ value: ReportPeriodValue; label: SimpleTranslationKey }> = [
  { value: "7", label: "report.period.week" },
  { value: "14", label: "report.period.twoWeeks" },
];

const ACTIVITY_OPTIONS: Array<{ value: ReportActivity; label: SimpleTranslationKey }> = [
  { value: "closed", label: "report.activity.closed" },
  { value: "opened", label: "report.activity.opened" },
];

const REPORT_KIND_OPTIONS: Array<{ value: ReportKind; label: SimpleTranslationKey }> = [
  { value: "tasks", label: "report.kind.tasks" },
  { value: "raid", label: "report.kind.raid" },
  { value: "issues", label: "report.kind.issues" },
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
    tasks: [...REPORT_FIELD_ORDER.tasks],
    raid: [...REPORT_FIELD_ORDER.raid],
    issues: [...REPORT_FIELD_ORDER.issues],
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
  const { locale } = useI18n();
  if (items.length === 0) return <div className="report-empty">{emptyText}</div>;
  const fieldLabels = new Map(localizedReportFields(locale)[kind].map((field) => [field.key, field.label]));
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
              {reportFieldText(kind, field, item, locale)}
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
  const { t: uiText } = useInterfaceTranslation();
  const { locale } = useI18n();
  const definitions = new Map(localizedReportFields(locale)[kind].map((field) => [field.key, field]));
  return (
    <div className="report-field-picker">
      <div className="report-field-picker-head">
        <span>{uiText("ui.jira.fields")}</span>
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
                aria-label={uiText("report.drag", { label: definition.label })}
                title={uiText("report.drag", { label: definition.label })}
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
  const { t: uiText } = useInterfaceTranslation();
  return (
    <>
      <section className="report-section tone-done">
        <h4>{uiText("ui.reports.reportSectionDoneTitle")} <span>{report.done.length}</span></h4>
        <ReportDataTable kind="tasks" fields={fields} items={report.done} emptyText={uiText("report.empty.done")} />
      </section>
      <section className="report-section tone-progress">
        <h4>{uiText("ui.reports.reportSectionInProgressTitle")} <span>{report.inProgress.length}</span></h4>
        <ReportDataTable kind="tasks" fields={fields} items={report.inProgress} emptyText={uiText("report.empty.active")} />
      </section>
      <section className="report-section tone-upcoming">
        <h4>{uiText("ui.reports.reportSectionUpcomingTitle")} <span>{report.upcoming.length}</span></h4>
        <ReportDataTable kind="tasks" fields={fields} items={report.upcoming} emptyText={uiText("report.empty.upcoming")} />
      </section>
    </>
  );
}

export function ReportsPage() {
  const { t: uiText } = useInterfaceTranslation();
  const [weekly, setWeekly] = useState(() => new URLSearchParams(window.location.search).get('reportView') === 'weekly');
  useEffect(() => {
    const sync = () => setWeekly(new URLSearchParams(window.location.search).get('reportView') === 'weekly');
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  return <><div className="automation-tabs" role="group" aria-label={uiText("ui.reports.reportViewLabel")}>
    <button aria-pressed={!weekly} onClick={() => { setWeekly(false); const url = new URL(window.location.href); url.searchParams.delete('reportView'); window.history.pushState(null, '', url); }}>{uiText("ui.reports.reportBuilderOptionLabel")}</button>
    <button aria-pressed={weekly} onClick={() => { setWeekly(true); const url = new URL(window.location.href); url.searchParams.set('reportView', 'weekly'); window.history.pushState(null, '', url); }}>{uiText("ui.automation.whatChangedThisWeek")}</button>
  </div>{weekly && <WeeklyBriefPanel />}<div hidden={weekly}><CurrentReportsPage /></div></>;
}

function CurrentReportsPage() {
  const { t: uiText } = useInterfaceTranslation();
  const { locale, formatters: { date } } = useI18n();
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
    error: { message: string | null } | null;
  }>({ id: "", data: null, error: null });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!effectiveProjectId) return;
    let cancelled = false;
    apiClient
      .get<ProjectDetails>(
        `/api/projects/${effectiveProjectId}/overview`,
        "",
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
            error: { message: loadError instanceof ApiError && loadError.message ? loadError.message : null },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveProjectId]);

  const project = loadedProject.id === effectiveProjectId ? loadedProject.data : null;
  const error = loadedProject.id === effectiveProjectId && loadedProject.error ? loadedProject.error.message || uiText("report.loadError") : null;
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
      projectReportText(project, report, reportKind, activeFields, activity, locale),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="reports-page">
      <header className="reports-header">
        <div>
          <h1>{uiText("ui.reports.reportBuilderHeading")}</h1>
          <p>{uiText("ui.reports.reportStatusForPeriodSubtitle")}</p>
        </div>
        <div className="reports-actions">
          <button type="button" onClick={() => void copyReport()} disabled={!report}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? uiText("ui.automation.copied") : uiText("ui.reports.copyAction")}
          </button>
          <button
            type="button"
            onClick={() =>
              project &&
              printSectionAsPdf("project-status-report", uiText("report.pdfTitle", { code: project.code }))
            }
            disabled={!report}
          >
            <Printer size={16} />
            PDF
          </button>
        </div>
      </header>

      <div className="report-builder-layout">
        <aside className="report-controls" aria-label={uiText("ui.reports.reportSettingsTitle")}>
          <label className="report-control-field">
            <span>{uiText("ui.admin.project")}</span>
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
              <span>{uiText("ui.reports.reportContentsTitle")}</span>
              <div className="report-select-wrap">
                <select
                  value={reportKind}
                  onChange={(event) => {
                    setReportKind(event.target.value as ReportKind);
                    setDraggedField(null);
                  }}
                >
                  {REPORT_KIND_OPTIONS.map((item) => (
                    <option value={item.value} key={item.value}>{uiText(item.label)}</option>
                  ))}
                </select>
                <ChevronDown size={17} strokeWidth={2.4} aria-hidden="true" />
              </div>
            </label>
            <div className="report-control-field">
              <span>{uiText("ui.automation.period")}</span>
              <div className="segmented-control report-period-control" aria-label={uiText("ui.reports.reportPeriodLabel")}>
                {(reportKind === "tasks" ? PERIOD_OPTIONS : ACTIVITY_OPTIONS).map((item: { value: string; label: SimpleTranslationKey }) => {
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
                      {uiText(item.label)}
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
          {loading && <div className="report-loading">{uiText("ui.reports.reportGeneratingMessage")}</div>}
          {error && <div className="report-error">{error}</div>}
          {!loading && !error && project && report && (
            <>
              <div className="report-document-header">
                <div>
                  <span>{project.code}</span>
                  <h3>{project.name}</h3>
                  <small>{uiText(REPORT_KIND_OPTIONS.find((item) => item.value === reportKind)!.label)}</small>
                </div>
                <dl>
                  {reportKind === "tasks" ? (
                    <>
                      <div><dt>{uiText("ui.automation.period")}</dt><dd>{date(report.pastStart)} - {date(report.generatedAt)}</dd></div>
                      <div><dt>{uiText("ui.reports.reportNextHorizonLabel")}</dt><dd>{uiText("ui.reports.dateRangeToSeparator")} {date(report.futureEnd)}</dd></div>
                    </>
                  ) : (
                    <>
                      <div><dt>{uiText("ui.automation.period")}</dt><dd>{date(report.activityStart)} - {date(report.generatedAt)}</dd></div>
                      <div><dt>{uiText("ui.reports.reportEntriesCountLabel")}</dt><dd>{reportKind === "raid" ? visibleRaidItems.length : visibleIssues.length}</dd></div>
                    </>
                  )}
                  <div><dt>{uiText("ui.admin.projectManagerShort")}</dt><dd>{project.projectManager || uiText("ui.projects.notAssignedLowercase")}</dd></div>
                </dl>
              </div>

              <div className="report-summary-counts">
                {reportKind === "tasks" && (
                  <>
                    <span><b>{report.done.length}</b> {uiText("ui.reports.reportCountDoneLowercase")}</span>
                    <span><b>{report.inProgress.length}</b> {uiText("ui.reports.reportCountInProgressLowercase")}</span>
                    <span><b>{report.upcoming.length}</b> {uiText("ui.reports.reportCountUpcomingLowercase")}</span>
                  </>
                )}
                {reportKind === "raid" && (
                  <>
                    <span><b>{risks.length}</b> {uiText("ui.reports.reportCountRisksLowercase")}</span>
                    <span><b>{problems.length}</b> {uiText("ui.reports.reportCountIssuesLowercase")}</span>
                  </>
                )}
                {reportKind === "issues" && (
                  <span><b>{visibleIssues.length}</b> {activity === "closed" ? uiText("ui.reports.reportCountClosedLowercase") : uiText("ui.reports.reportCountOpenLowercase")} {uiText("ui.reports.reportCountQuestionsLowercase")}</span>
                )}
              </div>

              {reportKind === "tasks" && <TaskReportSections report={report} fields={activeFields} />}
              {reportKind === "raid" && (
                <>
                  <section className="report-section tone-risk">
                    <h4>{activity === "closed" ? uiText("ui.reports.reportClosedRisksTitle") : uiText("ui.reports.reportOpenRisksTitle")} <span>{risks.length}</span></h4>
                    <ReportDataTable kind="raid" fields={activeFields} items={risks} emptyText={activity === "closed" ? uiText("ui.reports.reportNoClosedRisksTwoWeeks") : uiText("ui.reports.reportNoNewOpenRisksTwoWeeks")} />
                  </section>
                  <section className="report-section tone-problem">
                    <h4>{activity === "closed" ? uiText("ui.reports.reportClosedIssuesTitle") : uiText("ui.reports.reportOpenIssuesTitle")} <span>{problems.length}</span></h4>
                    <ReportDataTable kind="raid" fields={activeFields} items={problems} emptyText={activity === "closed" ? uiText("ui.reports.reportNoClosedIssuesTwoWeeks") : uiText("ui.reports.reportNoNewOpenIssuesTwoWeeks")} />
                  </section>
                </>
              )}
              {reportKind === "issues" && (
                <section className="report-section tone-issue">
                  <h4>{activity === "closed" ? uiText("ui.reports.reportClosedQuestionsTitle") : uiText("ui.reports.reportOpenQuestionsTitle")} <span>{visibleIssues.length}</span></h4>
                  <ReportDataTable kind="issues" fields={activeFields} items={visibleIssues} emptyText={activity === "closed" ? uiText("ui.reports.reportNoClosedQuestionsTwoWeeks") : uiText("ui.reports.reportNoNewOpenQuestionsTwoWeeks")} />
                </section>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
