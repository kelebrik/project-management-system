import type { ProjectListItem } from "../app/domainTypes";
import { usePageContext } from "./PageContext";
import { ProjectsOverview } from "./ProjectsOverview";

export function ProjectsPage() {
  const ctx = usePageContext();
  const { projects, selectProject } = ctx;

  return (
    <section className="projects-overview-section">
      <article className="panel projects-overview-panel">
        <ProjectsOverview
          projects={projects as ProjectListItem[]}
          selectProject={selectProject}
        />
      </article>
    </section>
  );
}
