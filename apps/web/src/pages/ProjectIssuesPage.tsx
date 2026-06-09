import { usePageContext } from "./PageContext";
import { ProjectClosedIssuesSection } from "./ProjectClosedIssuesSection";
import { ProjectOpenIssuesSection } from "./ProjectOpenIssuesSection";

export function ProjectIssuesPage() {
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
