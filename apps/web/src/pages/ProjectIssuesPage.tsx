import { usePageContext } from "./PageContext";
import { ProjectClosedIssuesSection } from "./ProjectClosedIssuesSection";
import { ProjectOpenIssuesSection } from "./ProjectOpenIssuesSection";
import { MeetingNotesPanel } from '../components/automation/MeetingNotesPanel';

export function ProjectIssuesPage() {
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
                  <ProjectOpenIssuesSection />
                    <ProjectClosedIssuesSection />
                  </article>
                );
}
