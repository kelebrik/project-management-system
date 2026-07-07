import { ChevronDown, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

import { defaultJiraWorkSectionTitle } from "../app/jiraWorkSections";
import { usePageContext } from "./PageContext";

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
              onClick={syncJira}
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
                    <label className="jira-work-filter-field">
                      <span>Jira filter</span>
                      <input
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
                        placeholder="https://tasks.sberdevices.ru/issues/?filter=12345"
                      />
                    </label>

                    <div className="jira-work-ticket-list">
                      {(syncedSection?.issues ?? []).map(({ snapshot }) => (
                        <a
                          className="jira-work-ticket"
                          key={snapshot.id}
                          href={snapshot.issueUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <b>
                            {snapshot.issueKey} / {snapshot.summary}
                          </b>
                          <span>
                            {snapshot.status} / {snapshot.priority}
                            {snapshot.assignee ? ` / ${snapshot.assignee}` : ""}
                          </span>
                        </a>
                      ))}
                      {(syncedSection?.issues ?? []).length === 0 && (
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
