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

  return (
    <article className="panel jira-work-page">
      <div className="panel-title">
        <div>
          <h2>Работы в Jira</h2>
          <p>Пять JQL-разделов проекта для отчетности и обзора</p>
        </div>
        <button
          className="button"
          type="button"
          onClick={syncJira}
          disabled={syncing}
        >
          {syncing ? "Синхронизирую..." : "Синхронизировать"}
        </button>
      </div>

      <form className="jira-work-sections" onSubmit={saveJiraWorkSections}>
        {jiraWorkSectionDrafts.map((section) => {
          const syncedSection = project.jiraWorkSections.find(
            (entry) => entry.sortOrder === section.sortOrder,
          );
          return (
            <section className="jira-work-section" key={section.sortOrder}>
              <div className="jira-work-section-fields">
                <label>
                  Название раздела
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
                </label>
                <label>
                  JQL фильтр
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
                    rows={3}
                    placeholder="project = KEY AND statusCategory != Done ORDER BY updated DESC"
                  />
                </label>
              </div>

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
            </section>
          );
        })}

        <div className="form-actions">
          <button type="submit" disabled={savingJiraWorkSections}>
            {savingJiraWorkSections ? "Сохраняю..." : "Сохранить разделы"}
          </button>
        </div>
      </form>
    </article>
  );
}
