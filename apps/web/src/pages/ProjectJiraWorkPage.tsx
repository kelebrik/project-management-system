import { ChevronDown, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

import { defaultJiraWorkSectionTitle } from "../app/jiraWorkSections";
import { usePageContext } from "./PageContext";

export function ProjectJiraWorkPage() {
  const ctx = usePageContext();
  const {
    jiraForm,
    jiraWorkSectionDrafts,
    project,
    saveJiraIntegration,
    saveJiraWorkSections,
    savingJira,
    savingJiraWorkSections,
    setJiraForm,
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
    <>
      <article className="panel project-card">
        <div className="panel-title">
          <div>
            <h2>Подключение проекта к Jira</h2>
            <p>Ссылки проекта, доска и базовые JQL для синхронизации</p>
          </div>
        </div>
        <form className="form-grid" onSubmit={saveJiraIntegration}>
          <label>
            Базовый URL Jira
            <input
              value={jiraForm.baseUrl}
              onChange={(event) =>
                setJiraForm({
                  ...jiraForm,
                  baseUrl: event.target.value,
                })
              }
              placeholder="https://tasks.sberdevices.ru"
            />
          </label>
          <label>
            URL доски Jira
            <input
              value={jiraForm.boardUrl}
              onChange={(event) =>
                setJiraForm({
                  ...jiraForm,
                  boardUrl: event.target.value,
                })
              }
              placeholder="https://tasks.sberdevices.ru/secure/RapidBoard.jspa?rapidView=123"
            />
          </label>
          <label>
            Ключ проекта
            <input
              value={jiraForm.projectKey}
              onChange={(event) =>
                setJiraForm({
                  ...jiraForm,
                  projectKey: event.target.value,
                })
              }
              placeholder="TV"
            />
          </label>
          <label>
            JQL задач
            <textarea
              value={jiraForm.issuesJql}
              onChange={(event) =>
                setJiraForm({
                  ...jiraForm,
                  issuesJql: event.target.value,
                })
              }
              rows={2}
            />
          </label>
          <label className="span-2">
            JQL открытых вопросов
            <textarea
              value={jiraForm.openIssuesJql}
              onChange={(event) =>
                setJiraForm({
                  ...jiraForm,
                  openIssuesJql: event.target.value,
                })
              }
              rows={2}
            />
          </label>
          <div className="form-actions span-2">
            <button type="submit" disabled={savingJira}>
              {savingJira ? "Сохраняю..." : "Сохранить подключение"}
            </button>
          </div>
        </form>
      </article>

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
    </>
  );
}
