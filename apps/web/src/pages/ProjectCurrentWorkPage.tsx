import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import {
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createCurrentWorkRows, type CurrentWorkFilter } from "../app/currentWorkModel";
import {
  CURRENT_WORK_COLUMNS,
  currentWorkGridTemplate,
  currentWorkTableMinWidth,
  normalizeCurrentWorkColumnWidths,
  type CurrentWorkColumnKey,
} from "../app/currentWorkTable";
import { useI18n } from "../i18n/I18nProvider";
import type { WbsItemStatus } from "../app/domainTypes";

import { appPathForView } from "../app/routes";
import { WbsUrlField } from "../components/WbsUrlField";
import { usePageContext } from "./PageContext";
import { ListToolbar } from "../components/ListToolbar";
import { usePersistedViewState } from "../app/usePersistedViewState";

const STATUS_OPTIONS: WbsItemStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "IN_REVIEW",
  "AT_RISK",
  "BLOCKED",
  "DONE",
  "CANCELLED",
];

export function ProjectCurrentWorkPage() {
  const { t: uiText } = useInterfaceTranslation();
  const { formatters: { date }, labels: { wbsStatusLabel } } = useI18n();
  const {
    isReadOnly,
    isAuthenticated,
    isClosedProject,
    openView,
    project,
    saveProjectUiState,
    saveWbsDraftPatch,
    setActiveWbsItemId,
    setError,
    updateWbsDraft,
    wbsDrafts,
  } = usePageContext();
  const [query, setQuery] = usePersistedViewState(`pms:current-work:${project.id}:query`, "");
  const [columnWidths, setColumnWidths] = useState(() =>
    normalizeCurrentWorkColumnWidths(project.uiState?.currentWorkColumnWidths),
  );
  const [widthError, setWidthError] = useState<{ message: string | null } | null>(null);
  const [workFilter, setWorkFilter] = useState<CurrentWorkFilter>("all");
  const normalizedQuery = query.trim().toLowerCase();
  const rows = createCurrentWorkRows(project.wbsItems, wbsDrafts ?? {}, new Date(), workFilter).filter((row) => !normalizedQuery || [row.code, row.title, row.owner, row.workPackage].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery)));
  const gridTemplate = currentWorkGridTemplate(columnWidths);
  const tableMinWidth = currentWorkTableMinWidth(columnWidths);

  const openWorkInStructure = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    const url = new URL(event.currentTarget.href);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    openView("project-structure");
  };

  const startColumnResize = (
    columnKey: CurrentWorkColumnKey,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidths[columnKey];
    let latestWidths = columnWidths;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        760,
        Math.max(56, startWidth + moveEvent.clientX - startX),
      );
      setColumnWidths((current) => {
        latestWidths = { ...current, [columnKey]: nextWidth };
        return latestWidths;
      });
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (!isAuthenticated || isClosedProject) return;
      void saveProjectUiState({
        currentWorkColumnWidths: latestWidths,
      }).catch((error: unknown) =>
        setWidthError({ message: error instanceof Error ? error.message : null }),
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <article className="panel project-card current-work-page">
      {widthError && <div role="alert">{widthError.message || uiText("work.saveWidthsError")}</div>}
      <div className="panel-title">
        <div>
          <h2>{uiText("ui.projects.currentWorkPageTitle")}</h2>
          <p>{uiText("ui.projects.currentWorkPageSubtitle")}</p>
        <div className="segmented-control">{([["all", uiText("work.filter.all")], ["active", uiText("work.filter.active")], ["blocked", uiText("work.filter.blocked")], ["overdue", uiText("work.filter.overdue")]] as const).map(([value, label]) => <button type="button" key={value} className={workFilter === value ? "active" : ""} onClick={() => setWorkFilter(value)}>{label}</button>)}</div>
        </div>
      </div>
      <ListToolbar label={uiText("ui.projects.currentWorkSearchLabel")} query={query} onQueryChange={setQuery} />
      {rows.length === 0 ? (
        <div className="empty-state"><strong>{normalizedQuery ? uiText("ui.projects.currentWorkNotFoundTitle") : uiText("ui.projects.currentWorkNoneForConditionsTitle")}</strong><span>{normalizedQuery ? uiText("ui.projects.changeQueryOrClearSearchHint") : uiText("ui.projects.currentWorkEmptyStructureHint")}</span>{normalizedQuery && <button type="button" onClick={() => setQuery("")}>{uiText("ui.projects.clearSearchAction")}</button>}</div>
      ) : (
        <div
          className="current-work-table"
          role="table"
          aria-label={uiText("ui.projects.currentWorkRegionLabel")}
          style={
            {
              "--current-work-template": gridTemplate,
              "--current-work-min-width": `${tableMinWidth}px`,
            } as CSSProperties
          }
        >
          <div className="current-work-head" role="row">
            {CURRENT_WORK_COLUMNS.map((column) => (
              <span role="columnheader" key={column.key}>
                {uiText(`work.column.${column.key}`)}
                <button
                  type="button"
                  className="current-work-column-resizer"
                  aria-label={uiText("work.resizeColumn", { label: uiText(`work.column.${column.key}`) })}
                  onPointerDown={(event) =>
                    startColumnResize(column.key, event)
                  }
                />
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div
              className="current-work-row"
              role="row"
              key={row.id}
              onFocus={() => setActiveWbsItemId(row.id)}
            >
              <span role="cell">{row.code}</span>
              <span role="cell">{row.workPackage}</span>
              <span role="cell" className="current-work-title">
                <a
                  className="current-work-structure-link"
                  href={`${appPathForView("project-structure", project.code)}?focusWbs=${encodeURIComponent(row.id)}`}
                  onClick={openWorkInStructure}
                  title={uiText("ui.projects.currentWorkOpenInStructure")}
                >
                  {row.title}
                </a>
              </span>
              <span
                role="cell"
                className={isReadOnly ? undefined : "current-work-editable-cell"}
              >
                {isReadOnly ? (
                  wbsStatusLabel(row.status)
                ) : (
                  <select
                    aria-label={uiText("work.status", { code: row.code })}
                    value={row.status}
                    onChange={(event) =>
                      saveWbsDraftPatch(
                        row.id,
                        { status: event.target.value as WbsItemStatus },
                        { silent: true },
                      )
                    }
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option value={status} key={status}>
                        {wbsStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                )}
              </span>
              <span
                role="cell"
                className={isReadOnly ? undefined : "current-work-editable-cell"}
              >
                {isReadOnly ? (
                  date(row.dueDate)
                ) : (
                  <input
                    type="date"
                    aria-label={uiText("work.due", { code: row.code })}
                    value={row.dueDate ?? ""}
                    onChange={(event) => {
                      const dueDate = event.target.value;
                      saveWbsDraftPatch(
                        row.id,
                        {
                          dueDate,
                          forecastDueDate: dueDate,
                          excelEndDate: dueDate,
                        },
                        { silent: true, scheduleDriver: "dates" },
                      );
                    }}
                  />
                )}
              </span>
              <span
                role="cell"
                className={isReadOnly ? undefined : "current-work-editable-cell"}
              >
                {isReadOnly ? (
                  row.owner || "—"
                ) : (
                  <input
                    aria-label={uiText("work.owner", { code: row.code })}
                    value={row.owner}
                    onChange={(event) =>
                      updateWbsDraft(row.id, { owner: event.target.value })
                    }
                    onBlur={(event) =>
                      saveWbsDraftPatch(
                        row.id,
                        { owner: event.currentTarget.value },
                        { silent: true },
                      )
                    }
                  />
                )}
              </span>
              <span
                role="cell"
                className={
                  isReadOnly
                    ? undefined
                    : "current-work-editable-cell current-work-comment-cell"
                }
              >
                {isReadOnly ? (
                  row.comment.trim() || "—"
                ) : (
                  <textarea
                    className="current-work-comment-editor"
                    aria-label={uiText("work.comment", { code: row.code })}
                    rows={3}
                    wrap="soft"
                    value={row.comment}
                    onChange={(event) =>
                      updateWbsDraft(row.id, { comment: event.target.value })
                    }
                    onBlur={(event) =>
                      saveWbsDraftPatch(
                        row.id,
                        { comment: event.currentTarget.value },
                        { silent: true },
                      )
                    }
                  />
                )}
              </span>
              <span
                role="cell"
                className={isReadOnly ? undefined : "current-work-editable-cell"}
              >
                <WbsUrlField
                  contextLabel={row.code}
                  isReadOnly={isReadOnly}
                  kind="jira"
                  value={row.jiraTicketUrl}
                  onInvalid={setError}
                  onSave={(jiraTicketUrl) =>
                    saveWbsDraftPatch(
                      row.id,
                      { jiraTicketUrl },
                      { silent: true },
                    )
                  }
                />
              </span>
              <span
                role="cell"
                className={isReadOnly ? undefined : "current-work-editable-cell"}
              >
                <WbsUrlField
                  contextLabel={row.code}
                  isReadOnly={isReadOnly}
                  kind="mattermost"
                  value={row.mattermostUrl}
                  onInvalid={setError}
                  onSave={(mattermostUrl) =>
                    saveWbsDraftPatch(
                      row.id,
                      { mattermostUrl },
                      { silent: true },
                    )
                  }
                />
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
