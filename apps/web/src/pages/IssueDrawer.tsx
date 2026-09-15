import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useConfirm } from "../hooks/useConfirm";
import type { Issue } from "../app/domainTypes";

export function IssueDrawer() {
  const { t: uiText } = useInterfaceTranslation();
  const confirm = useConfirm();
  const ctx = usePageContext();
  const {
    addIssueFormLink,
    activeView,
    createOpenIssue,
    creatingIssue,
    currentUser,
    issueDrawerMode,
    issueForm,
    issueFormErrors,
    issueSeverityLabel,
    project,
    removeIssueFormLink,
    setIssueDrawerMode,
    setIssueForm,
    setIssueFormErrors,
    setError,
    updateIssueFormLink,
  } = ctx;
  const phases = project?.wbsItems.filter((item: { type: string }) => item.type === "PHASE") ?? [];
  const categories = [...new Set<string>(
    (project?.issues ?? []).map((issue: Issue) => issue.category.trim()).filter(Boolean),
  )];

  const selectPhase = async (phaseId: string) => {
    if (currentUser?.role !== "ADMIN") {
      setError("Недостаточно прав для выбора фазы и создания пакета работ");
      return;
    }
    if (!phaseId) {
      setIssueForm({ ...issueForm, phaseId: "" });
      return;
    }
    const phase = phases.find((candidate: { id: string }) => candidate.id === phaseId);
    if (!phase) return;
    const approved = await confirm({
      title: "Создать пакет работ?",
      message: `Для открытого вопроса будет создан пакет работ в фазе «${phase.code} · ${phase.title}» перед последней вехой или целью этой фазы. Продолжить?`,
      confirmLabel: "Создать",
    });
    if (approved) setIssueForm({ ...issueForm, phaseId });
  };

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
                  <h2 id="issue-drawer-title">{uiText("ui.projects.createOpenIssue")}</h2>
                  <p>{uiText("ui.projects.issueDrawerSubtitle")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIssueDrawerMode(null);
                  }}
                  aria-label={uiText("ui.projects.closePanel")}
                >
                  x
                </button>
              </div>
              {issueDrawerMode === "create" && (
                <form className="stack-form" onSubmit={createOpenIssue}>
                  <label className={issueFormErrors.title ? "field-error" : ""}>
                    {uiText("ui.projects.issueTitle")}
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
                      placeholder={uiText("ui.projects.issueTitlePlaceholder")}
                    />
                    {issueFormErrors.title && (
                      <small>{issueFormErrors.title}</small>
                    )}
                  </label>
                  <div className="two-col issue-classification-fields">
                    <label>
                      {uiText("ui.projects.section")}
                      <input
                        list="issue-create-categories"
                        value={issueForm.category}
                        onChange={(event) => setIssueForm({
                          ...issueForm,
                          category: event.target.value,
                        })}
                        placeholder={uiText("ui.projects.issueSectionPlaceholder")}
                      />
                    </label>
                    <label>
                      {uiText("ui.projects.phase")}
                      <select
                        value={issueForm.phaseId}
                        onChange={(event) => void selectPhase(event.target.value)}
                      >
                        <option value="">{uiText("ui.projects.noPhase")}</option>
                        {phases.map((phase: { id: string; code: string; title: string }) => (
                          <option value={phase.id} key={phase.id}>
                            {phase.code} · {phase.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <small>
                      {uiText("ui.projects.phaseSelectionHint")}
                    </small>
                    <datalist id="issue-create-categories">
                      {categories.map((category) => <option value={category} key={category} />)}
                    </datalist>
                  </div>
                  <div className="two-col">
                    <label>
                      {uiText("ui.projects.criticality")}
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
                      {uiText("ui.projects.readiness")}
                      <select
                        value={issueForm.readiness}
                        onChange={(event) => setIssueForm({
                          ...issueForm,
                          readiness: event.target.value as Issue["readiness"],
                        })}
                      >
                        <option value="RED">{uiText("ui.projects.red")}</option>
                        <option value="AMBER">{uiText("ui.projects.yellow")}</option>
                        <option value="GREEN">{uiText("ui.projects.green")}</option>
                      </select>
                    </label>
                    <label>
                      {uiText("ui.automation.owner")}
                      <input
                        value={issueForm.owner}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            owner: event.target.value,
                          })
                        }
                        placeholder={uiText("ui.projects.ownerPlaceholderRoles")}
                      />
                    </label>
                  </div>
                  <label>
                    {uiText("ui.projects.threadLink")}
                    <input
                      type="url"
                      value={issueForm.referenceUrl}
                      onChange={(event) => setIssueForm({
                        ...issueForm,
                        referenceUrl: event.target.value,
                      })}
                      placeholder="https://..."
                    />
                  </label>
                  <label>
                    {uiText("ui.projects.impact")}
                    <textarea
                      value={issueForm.impact}
                      onChange={(event) =>
                        setIssueForm({
                          ...issueForm,
                          impact: event.target.value,
                        })
                      }
                      rows={3}
                      placeholder={uiText("ui.projects.impactPlaceholder")}
                    />
                  </label>
                  <div className="two-col">
                    <label>
                      {uiText("ui.automation.dueDate")}
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
                      {uiText("ui.projects.requiresDecision")}
                    </label>
                  </div>
                  <div className="jira-links-editor">
                    <div className="subhead">{uiText("ui.projects.ticketLink")}</div>
                    <div className="issue-link-edit is-key-only">
                      <input
                        aria-label={uiText("ui.projects.primaryTicketKey")}
                        value={issueForm.jiraTicketKey}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            jiraTicketKey: event.target.value,
                          })
                        }
                        placeholder="ERP-1842"
                      />
                    </div>
                    <div className="subhead">{uiText("ui.projects.additionalTicketLinks")}</div>
                    {issueForm.jiraLinks.map((link, index) => (
                      <div className="issue-link-edit is-key-only" key={index}>
                        <input
                          aria-label={`Ключ дополнительного тикета ${index + 1}`}
                          value={link.jiraKey}
                          onChange={(event) =>
                            updateIssueFormLink(index, {
                              jiraKey: event.target.value,
                            })
                          }
                          placeholder="ERP-1842"
                        />
                        <button
                          type="button"
                          onClick={() => removeIssueFormLink(index)}
                        >
                          {uiText("ui.admin.delete")}
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={addIssueFormLink}>
                      {uiText("ui.projects.addTicketLink")}
                    </button>
                  </div>
                  <button type="submit" disabled={creatingIssue}>
                    {creatingIssue ? uiText("ui.admin.creatingEllipsis") : uiText("ui.projects.createIssue")}
                  </button>
                </form>
              )}
            </aside>
          </div>
        );
}
