import { useState } from "react";
import { usePageContext } from "./PageContext";
import { ProjectClosedIssuesSection } from "./ProjectClosedIssuesSection";
import { ProjectOpenIssuesSection } from "./ProjectOpenIssuesSection";
import { MeetingNotesPanel } from '../components/automation/MeetingNotesPanel';

export function ProjectIssuesPage() {
  const [issueSearch, setIssueSearch] = useState("");
  const [issueSortDesc, setIssueSortDesc] = useState(false);
  const [issueFilter, setIssueFilter] = useState<"all" | "high" | "overdue">("all");
  const ctx = usePageContext();
  const {
    emptyIssueForm,
    setIssueDrawerMode,
    setIssueForm,
    project,
  } = ctx;

  return (
                  <article className="panel overview-panel">
                    <MeetingNotesPanel projectId={project.id} />
                    <div className="panel-title">
                      <div>
                        <h2>Реестр открытых вопросов</h2>
                        <p>
                          Единый список открытых проблем из Jira и внутренних
                          управленческих вопросов
                      </p>
                    </div>
                    <div className="issues-toolbar">
                      <input aria-label="Поиск открытых вопросов" placeholder="Поиск вопросов" value={issueSearch} onChange={(event) => setIssueSearch(event.target.value)} />
                      <button type="button" className={issueFilter === "all" ? "active" : ""} onClick={() => setIssueFilter("all")}>Все</button>
                      <button type="button" className={issueFilter === "high" ? "active" : ""} onClick={() => setIssueFilter("high")}>Высокая критичность</button>
                      <button type="button" className={issueFilter === "overdue" ? "active" : ""} onClick={() => setIssueFilter("overdue")}>Просроченные</button>
                      <button type="button" onClick={() => setIssueSortDesc((current) => !current)}>Срок {issueSortDesc ? "↓" : "↑"}</button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIssueForm(emptyIssueForm);
                        setIssueDrawerMode("create");
                      }}
                    >
                      Создать вопрос
                    </button>
                  </div>
                  <ProjectOpenIssuesSection issueSearch={issueSearch} issueFilter={issueFilter} issueSortDesc={issueSortDesc} />
                    <ProjectClosedIssuesSection />
                  </article>
                );
}
