import { usePageContext } from "./PageContext";
import { useFocusTrap } from "../hooks/useFocusTrap";
import type { Issue } from "../app/domainTypes";

export function IssueDrawer() {
  const ctx = usePageContext();
  const {
    addIssueFormLink,
    activeView,
    createOpenIssue,
    creatingIssue,
    issueDrawerMode,
    issueForm,
    issueFormErrors,
    issueSeverityLabel,
    removeIssueFormLink,
    setIssueDrawerMode,
    setIssueForm,
    setIssueFormErrors,
    updateIssueFormLink,
  } = ctx;

  const isOpen = activeView === "project-issues" && Boolean(issueDrawerMode);
  const containerRef = useFocusTrap<HTMLElement>(isOpen, () =>
    setIssueDrawerMode(null),
  );

  if (!isOpen) {
    return null;
  }

  return (
          <div
            className="drawer-backdrop"
            onClick={() => {
              setIssueDrawerMode(null);
            }}
          >
            <aside
              className="side-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="issue-drawer-title"
              ref={containerRef}
              tabIndex={-1}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="drawer-title">
                <div>
                  <h2 id="issue-drawer-title">Создать открытый вопрос</h2>
                  <p>Срок, ответственный, влияние и связь с Jira</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIssueDrawerMode(null);
                  }}
                  aria-label="Закрыть панель"
                >
                  x
                </button>
              </div>
              {issueDrawerMode === "create" && (
                <form className="stack-form" onSubmit={createOpenIssue}>
                  <label className={issueFormErrors.title ? "field-error" : ""}>
                    Заголовок
                    <input
                      value={issueForm.title}
                      onChange={(event) => {
                        setIssueFormErrors((current) => ({
                          ...current,
                          title: undefined,
                        }));
                        setIssueForm({
                          ...issueForm,
                          title: event.target.value,
                        });
                      }}
                      placeholder="Например: поставщик не подтвердил SLA"
                    />
                    {issueFormErrors.title && (
                      <small>{issueFormErrors.title}</small>
                    )}
                  </label>
                  <div className="two-col">
                    <label>
                      Критичность
                      <select
                        value={issueForm.severity}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            severity: event.target.value as Issue["severity"],
                          })
                        }
                      >
                        <option value="CRITICAL">
                          {issueSeverityLabel("CRITICAL")}
                        </option>
                        <option value="HIGH">{issueSeverityLabel("HIGH")}</option>
                        <option value="MEDIUM">
                          {issueSeverityLabel("MEDIUM")}
                        </option>
                        <option value="LOW">{issueSeverityLabel("LOW")}</option>
                      </select>
                    </label>
                    <label>
                      Ответственный
                      <input
                        value={issueForm.owner}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            owner: event.target.value,
                          })
                        }
                        placeholder="РП / поставщик / ИТ-эксплуатация"
                      />
                    </label>
                  </div>
                  <label>
                    Влияние
                    <textarea
                      value={issueForm.impact}
                      onChange={(event) =>
                        setIssueForm({
                          ...issueForm,
                          impact: event.target.value,
                        })
                      }
                      rows={3}
                      placeholder="Влияние на сроки, содержание или решение руководства"
                    />
                  </label>
                  <div className="two-col">
                    <label>
                      Срок
                      <input
                        type="date"
                        value={issueForm.dueDate}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            dueDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="checkbox-line">
                      <input
                        type="checkbox"
                        checked={issueForm.decisionRequired}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            decisionRequired: event.target.checked,
                          })
                        }
                      />
                      Требует решения
                    </label>
                  </div>
                  <div className="jira-links-editor">
                    <div className="subhead">Ключ Jira</div>
                    <div className="issue-link-edit">
                      <input
                        value={issueForm.jiraTicketKey}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            jiraTicketKey: event.target.value,
                          })
                        }
                        placeholder="ERP-1842"
                      />
                      <input
                        className={issueFormErrors.jiraTicketUrl ? "input-error" : ""}
                        value={issueForm.jiraTicketUrl}
                        onChange={(event) => {
                          setIssueFormErrors((current) => ({
                            ...current,
                            jiraTicketUrl: undefined,
                          }));
                          setIssueForm({
                            ...issueForm,
                            jiraTicketUrl: event.target.value,
                          });
                        }}
                        placeholder="https://jira.company.ru/browse/ERP-1842"
                      />
                    </div>
                    {issueFormErrors.jiraTicketUrl && (
                      <small className="field-error-text">
                        {issueFormErrors.jiraTicketUrl}
                      </small>
                    )}
                    <div className="subhead">Дополнительные задачи Jira</div>
                    {issueForm.jiraLinks.map((link, index) => (
                      <div className="issue-link-edit" key={index}>
                        <input
                          value={link.jiraKey}
                          onChange={(event) =>
                            updateIssueFormLink(index, {
                              jiraKey: event.target.value,
                            })
                          }
                          placeholder="ERP-1842"
                        />
                        <input
                          value={link.jiraUrl}
                          onChange={(event) =>
                            updateIssueFormLink(index, {
                              jiraUrl: event.target.value,
                            })
                          }
                          placeholder="https://jira.company.ru/browse/ERP-1842"
                        />
                        <button
                          type="button"
                          onClick={() => removeIssueFormLink(index)}
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={addIssueFormLink}>
                      + Добавить задачу Jira
                    </button>
                  </div>
                  <button type="submit" disabled={creatingIssue}>
                    {creatingIssue ? "Создаю..." : "Создать вопрос"}
                  </button>
                </form>
              )}
            </aside>
          </div>
        );
}
