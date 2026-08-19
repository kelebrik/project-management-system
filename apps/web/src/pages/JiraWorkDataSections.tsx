import { ChevronDown, ChevronRight } from "lucide-react";
import {
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
  useState,
} from "react";

import type { JiraIssueSnapshot } from "../app/domainTypes";
import type { JiraWorkSectionDraft } from "../app/formState";
import { defaultJiraWorkSectionTitle } from "../app/jiraWorkSections";
import { usePageContext } from "./PageContext";

export function JiraWorkDataSections() {
  const {
    jiraWorkSectionDrafts,
    project,
    saveJiraWorkSections,
    savingJiraWorkSections,
    setJiraWorkSectionDrafts,
  } = usePageContext();
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    () => new Set(),
  );
  const [expandedJqlSections, setExpandedJqlSections] = useState<Set<number>>(
    () => new Set(),
  );
  const toggleSetValue = (
    setter: Dispatch<SetStateAction<Set<number>>>,
    sortOrder: number,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(sortOrder)) next.delete(sortOrder);
      else next.add(sortOrder);
      return next;
    });
  };
  const addSection = () => {
    const nextSortOrder =
      Math.max(-1, ...jiraWorkSectionDrafts.map((section: JiraWorkSectionDraft) => section.sortOrder)) +
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
    if (!savingJiraWorkSections) event.currentTarget.requestSubmit();
  };

  return (
    <div className="jira-work-data-view">
      <div className="jira-work-data-actions">
        <button className="button" type="button" onClick={addSection}>
          Создать раздел
        </button>
        <button
          className="button primary"
          type="submit"
          form="jira-work-sections-form"
          disabled={savingJiraWorkSections}
        >
          {savingJiraWorkSections ? "Сохраняю..." : "Сохранить разделы"}
        </button>
      </div>

      <form
        id="jira-work-sections-form"
        className="jira-work-sections"
        onKeyDown={saveOnEnter}
        onSubmit={saveJiraWorkSections}
        aria-busy={savingJiraWorkSections}
      >
        {jiraWorkSectionDrafts.map(
          (section: JiraWorkSectionDraft) => {
            const syncedSection = project.jiraWorkSections.find(
              (entry: { sortOrder: number }) => entry.sortOrder === section.sortOrder,
            );
            const isCollapsed = !expandedSections.has(section.sortOrder);
            const isJqlCollapsed = !expandedJqlSections.has(section.sortOrder);
            const sectionIssues = syncedSection?.issues ?? [];
            const updateSection = (patch: Partial<typeof section>) =>
              setJiraWorkSectionDrafts(
                jiraWorkSectionDrafts.map((entry: JiraWorkSectionDraft) =>
                  entry.sortOrder === section.sortOrder ? { ...entry, ...patch } : entry,
                ),
              );
            return (
              <section
                className={`jira-work-section ${isCollapsed ? "collapsed" : ""}`}
                key={section.sortOrder}
              >
                <div className="jira-work-section-head">
                  <button
                    type="button"
                    className="jira-work-section-toggle"
                    onClick={() => toggleSetValue(setExpandedSections, section.sortOrder)}
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? "Развернуть" : "Свернуть"} ${section.title}`}
                  >
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  </button>
                  <div className="jira-work-section-title">
                    <input
                      value={section.title}
                      onChange={(event) => updateSection({ title: event.target.value })}
                      placeholder={`Раздел ${section.sortOrder + 1}`}
                    />
                  </div>
                  <span className="jira-work-section-count">{sectionIssues.length}</span>
                </div>

                {!isCollapsed && (
                  <div className="jira-work-section-body">
                    <div className={`jira-work-jql-panel ${isJqlCollapsed ? "collapsed" : ""}`}>
                      <button
                        type="button"
                        className="jira-work-jql-toggle"
                        onClick={() => toggleSetValue(setExpandedJqlSections, section.sortOrder)}
                        aria-expanded={!isJqlCollapsed}
                      >
                        {isJqlCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                        <span>JQL</span>
                      </button>
                      {!isJqlCollapsed && (
                        <div className="jira-work-filter-fields">
                          <label className="jira-work-filter-field">
                            <span>JQL</span>
                            <textarea
                              value={section.jql}
                              onChange={(event) => updateSection({ jql: event.target.value })}
                              placeholder='labels = cvte968 AND status not in (Closed, Done) ORDER BY created DESC'
                              rows={3}
                            />
                          </label>
                          <label className="jira-work-filter-field">
                            <span>Ссылка на фильтр</span>
                            <input
                              type="url"
                              value={section.filterUrl}
                              onChange={(event) => updateSection({ filterUrl: event.target.value })}
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
                            {sectionIssues.map(({ snapshot }: { snapshot: JiraIssueSnapshot }) => (
                              <tr key={snapshot.id}>
                                <td><span className="jira-work-type" title={snapshot.issueType}>{snapshot.issueType.slice(0, 1).toUpperCase()}</span></td>
                                <td><a href={snapshot.issueUrl} target="_blank" rel="noreferrer">{snapshot.issueKey}</a></td>
                                <td><a href={snapshot.issueUrl} target="_blank" rel="noreferrer">{snapshot.summary}</a></td>
                                <td>{snapshot.assignee || "Unassigned"}</td>
                                <td>{snapshot.reporter || ""}</td>
                                <td><span className="jira-work-priority">{snapshot.priority}</span></td>
                                <td><span className="jira-work-status">{snapshot.status}</span></td>
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
          },
        )}
      </form>
    </div>
  );
}
