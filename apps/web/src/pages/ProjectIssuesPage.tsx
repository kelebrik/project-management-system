import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { useState } from "react";
import { usePageContext } from "./PageContext";
import { ProjectClosedIssuesSection } from "./ProjectClosedIssuesSection";
import { ProjectOpenIssuesSection } from "./ProjectOpenIssuesSection";

export function ProjectIssuesPage() {
  const { t: uiText } = useInterfaceTranslation();
  const [issueSearch, setIssueSearch] = useState("");
  const [issueSortDesc, setIssueSortDesc] = useState(false);
  const [issueFilter, setIssueFilter] = useState<"all" | "high" | "overdue">("all");
  const ctx = usePageContext();
  const {
    emptyIssueForm,
    setIssueDrawerMode,
    setIssueForm,
  } = ctx;

  return (
                  <article className="panel overview-panel">
                    <div className="panel-title">
                      <div>
                        <h2>{uiText("ui.projects.openQuestionsRegisterTitle")}</h2>
                        <p>
                          {uiText("ui.projects.openQuestionsRegisterSubtitle")}
                      </p>
                    </div>
                    <div className="issues-toolbar">
                      <input aria-label={uiText("ui.projects.openQuestionsSearchLabel")} placeholder={uiText("ui.projects.questionsSearchPlaceholder")} value={issueSearch} onChange={(event) => setIssueSearch(event.target.value)} />
                      <button type="button" className={issueFilter === "all" ? "active" : ""} onClick={() => setIssueFilter("all")}>{uiText("ui.jira.all")}</button>
                      <button type="button" className={issueFilter === "high" ? "active" : ""} onClick={() => setIssueFilter("high")}>{uiText("ui.projects.filterHighCriticality")}</button>
                      <button type="button" className={issueFilter === "overdue" ? "active" : ""} onClick={() => setIssueFilter("overdue")}>{uiText("ui.projects.filterOverduePlural")}</button>
                      <button type="button" onClick={() => setIssueSortDesc((current) => !current)}>{uiText("ui.automation.dueDate")} {issueSortDesc ? "↓" : "↑"}</button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIssueForm(emptyIssueForm);
                        setIssueDrawerMode("create");
                      }}
                    >
                      {uiText("ui.projects.createIssue")}
                    </button>
                  </div>
                  <ProjectOpenIssuesSection issueSearch={issueSearch} issueFilter={issueFilter} issueSortDesc={issueSortDesc} />
                    <ProjectClosedIssuesSection />
                  </article>
                );
}
