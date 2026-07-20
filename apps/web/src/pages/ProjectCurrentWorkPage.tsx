import { createCurrentWorkRows } from "../app/currentWorkModel";
import { date } from "../app/dateUtils";
import type { WbsItemStatus } from "../app/domainTypes";
import { wbsStatusLabel } from "../app/labels";
import { WbsUrlField } from "../components/WbsUrlField";
import { usePageContext } from "./PageContext";

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
  const {
    isReadOnly,
    project,
    saveWbsDraftPatch,
    setActiveWbsItemId,
    setError,
    updateWbsDraft,
    wbsDrafts,
  } = usePageContext();
  const rows = createCurrentWorkRows(project.wbsItems, wbsDrafts ?? {});

  return (
    <article className="panel project-card current-work-page">
      <div className="panel-title">
        <div>
          <h2>Текучка</h2>
          <p>Недавно закрытые, текущие и ближайшие работы проекта</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">Работ по заданным условиям нет.</div>
      ) : (
        <div className="current-work-table" role="table" aria-label="Текучка проекта">
          <div className="current-work-head" role="row">
            <span role="columnheader">Номер</span>
            <span role="columnheader">Пакет работ</span>
            <span role="columnheader">Наименование</span>
            <span role="columnheader">Статус</span>
            <span role="columnheader">Срок</span>
            <span role="columnheader">Исполнитель</span>
            <span role="columnheader">Комментарий</span>
            <span role="columnheader">Jira</span>
            <span role="columnheader">MM</span>
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
              <span role="cell" className="current-work-title">{row.title}</span>
              <span role="cell">
                {isReadOnly ? (
                  wbsStatusLabel(row.status)
                ) : (
                  <select
                    aria-label={`Статус ${row.code}`}
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
              <span role="cell">
                {isReadOnly ? (
                  date(row.dueDate)
                ) : (
                  <input
                    type="date"
                    aria-label={`Срок ${row.code}`}
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
              <span role="cell">
                {isReadOnly ? (
                  row.owner || "—"
                ) : (
                  <input
                    aria-label={`Исполнитель ${row.code}`}
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
              <span role="cell">
                {isReadOnly ? (
                  row.comment.trim() || "—"
                ) : (
                  <input
                    aria-label={`Комментарий ${row.code}`}
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
              <span role="cell">
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
              <span role="cell">
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
