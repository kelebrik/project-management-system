import { ChevronDown, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

import { defaultJiraWorkSectionTitle } from "../app/jiraWorkSections";
import { usePageContext } from "./PageContext";

export const JIRA_PRODUCTION_BASE_URL = "https://tasks.sberdevices.ru";

export function ProjectJiraWorkPage() {
  const ctx = usePageContext();
  const {
    jiraWorkSectionDrafts,
    project,
    saveJiraWorkSections,
    savingJiraWorkSections,
    setJiraWorkSectionDrafts,
    syncing,
    syncJira,
  } = ctx;
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    () => new Set(),
  );
  const [expandedJqlSections, setExpandedJqlSections] = useState<Set<number>>(
    () => new Set(),
  );
  const toggleSection = (sortOrder: number) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(sortOrder)) {
        next.delete(sortOrder);
      } else {
        next.add(sortOrder);
      }
      return next;
    });
  };
  const toggleJqlSection = (sortOrder: number) => {
    setExpandedJqlSections((current) => {
      const next = new Set(current);
      if (next.has(sortOrder)) {
        next.delete(sortOrder);
      } else {
        next.add(sortOrder);
      }
      return next;
    });
  };
  const addSection = () => {
    const nextSortOrder =
      Math.max(-1, ...jiraWorkSectionDrafts.map((section) => section.sortOrder)) +
      1;
    setJiraWorkSectionDrafts([
      ...jiraWorkSectionDrafts,
      {
        id: null,
        sortOrder: nextSortOrder,
        title: defaultJiraWorkSectionTitle(nextSortOrder),
        jql: "",
        filterUrl: "",
      },
    ]);
  };
  const saveOnEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!savingJiraWorkSections) {
      event.currentTarget.requestSubmit();
    }
  };

  return (
      <article className="panel jira-work-page">
        <div className="panel-title">
          <div>
            <h2>Работы в Jira</h2>
            <p>Jira-фильтры проекта для отчетности и обзора</p>
          </div>
          <div className="panel-title-actions">
            <button className="button" type="button" onClick={addSection}>
              Создать раздел
            </button>
            <button
              className="button"
              type="button"
              onClick={() => syncJira({ baseUrl: JIRA_PRODUCTION_BASE_URL })}
              disabled={syncing}
            >
              {syncing ? "Синхронизирую..." : "Синхронизировать"}
            </button>
          </div>
        </div>

        <form
          className="jira-work-sections"
          onKeyDown={saveOnEnter}
          onSubmit={saveJiraWorkSections}
          aria-busy={savingJiraWorkSections}
        >
          {jiraWorkSectionDrafts.map((section) => {
            const syncedSection = project.jiraWorkSections.find(
              (entry) => entry.sortOrder === section.sortOrder,
            );
            const isCollapsed = !expandedSections.has(section.sortOrder);
            const isJqlCollapsed = !expandedJqlSections.has(section.sortOrder);
            const sectionIssues = syncedSection?.issues ?? [];
            return (
              <section
                className={`jira-work-section ${isCollapsed ? "collapsed" : ""}`}
                key={section.sortOrder}
              >
                <div className="jira-work-section-head">
                  <button
                    type="button"
                    className="jira-work-section-toggle"
                    onClick={() => toggleSection(section.sortOrder)}
                    aria-expanded={!isCollapsed}
                    aria-label={
                      isCollapsed
                        ? `Развернуть ${section.title}`
                        : `Свернуть ${section.title}`
                    }
                  >
                    {isCollapsed ? (
                      <ChevronRight size={18} />
                    ) : (
                      <ChevronDown size={18} />
                    )}
                  </button>
                  <div className="jira-work-section-title">
                    <input
                      value={section.title}
                      onChange={(event) =>
                        setJiraWorkSectionDrafts(
                          jiraWorkSectionDrafts.map((entry) =>
                            entry.sortOrder === section.sortOrder
                              ? { ...entry, title: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      placeholder={`Раздел ${section.sortOrder + 1}`}
                    />
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="jira-work-section-body">
                    <div
                      className={`jira-work-jql-panel ${
                        isJqlCollapsed ? "collapsed" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="jira-work-jql-toggle"
                        onClick={() => toggleJqlSection(section.sortOrder)}
                        aria-expanded={!isJqlCollapsed}
                      >
                        {isJqlCollapsed ? (
                          <ChevronRight size={18} />
                        ) : (
                          <ChevronDown size={18} />
                        )}
                        <span>JQL</span>
                      </button>
                      {!isJqlCollapsed && (
                        <div className="jira-work-filter-fields">
                          <label className="jira-work-filter-field">
                            <span>JQL</span>
                            <textarea
                              value={section.jql}
                              onChange={(event) =>
                                setJiraWorkSectionDrafts(
                                  jiraWorkSectionDrafts.map((entry) =>
                                    entry.sortOrder === section.sortOrder
                                      ? { ...entry, jql: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                              placeholder='labels = cvte968 AND status not in (Closed, Done) ORDER BY created DESC'
                              rows={3}
                            />
                          </label>
                          <label className="jira-work-filter-field">
                            <span>Ссылка на фильтр</span>
                            <input
                              type="url"
                              value={section.filterUrl}
                              onChange={(event) =>
                                setJiraWorkSectionDrafts(
                                  jiraWorkSectionDrafts.map((entry) =>
                                    entry.sortOrder === section.sortOrder
                                      ? { ...entry, filterUrl: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                              placeholder="https://tasks.sberdevices.ru/issues/?filter=12345"
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="jira-work-ticket-table-wrap table-scroll">
                      {sectionIssues.length > 0 ? (
                        <table className="jira-work-ticket-table sticky-head">
                          <thead>
                            <tr>
                              <th>T</th>
                              <th>Key</th>
                              <th>Summary</th>
                              <th>Assignee</th>
                              <th>Reporter</th>
                              <th>P</th>
                              <th>Status</th>
                              <th>Resolution</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sectionIssues.map(({ snapshot }) => (
                              <tr key={snapshot.id}>
                                <td>
                                  <span
                                    className="jira-work-type"
                                    title={snapshot.issueType}
                                  >
                                    {snapshot.issueType.slice(0, 1).toUpperCase()}
                                  </span>
                                </td>
                                <td>
                                  <a
                                    href={snapshot.issueUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {snapshot.issueKey}
                                  </a>
                                </td>
                                <td>
                                  <a
                                    href={snapshot.issueUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {snapshot.summary}
                                  </a>
                                </td>
                                <td>{snapshot.assignee || "Unassigned"}</td>
                                <td>{snapshot.reporter || ""}</td>
                                <td>
                                  <span className="jira-work-priority">
                                    {snapshot.priority}
                                  </span>
                                </td>
                                <td>
                                  <span className="jira-work-status">
                                    {snapshot.status}
                                  </span>
                                </td>
                                <td>{snapshot.resolution || "Unresolved"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p>Тикетов в разделе нет.</p>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </form>
      </article>
  );
}
