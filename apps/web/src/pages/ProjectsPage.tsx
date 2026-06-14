import type { ProjectListItem } from "../app/domainTypes";
import { usePageContext } from "./PageContext";
import { ProjectsOverview } from "./ProjectsOverview";

export function ProjectsPage() {
  const ctx = usePageContext();
  const { date, projects, selectProject } = ctx;

  return (
    <section className="projects-overview-section">
      <article className="panel projects-overview-panel">
        <div className="panel-title">
          <div>
            <h2>Проекты</h2>
            <p>Компактная сводка по паспортам всех проектов</p>
          </div>
        </div>
        <ProjectsOverview
          date={date}
          projects={projects as ProjectListItem[]}
          selectProject={selectProject}
        />
      </article>
    </section>
  );
}
