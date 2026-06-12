import type { ProjectListItem } from "../app/domainTypes";
import { projectHealthLabel, projectStatusLabel } from "../app/labels";
import { usePageContext } from "./PageContext";

const MAX_PASSPORT_FIELDS = 5;

function compactPassportRows(project: ProjectListItem) {
  const savedRows = Array.isArray(project.uiState?.passportRows)
    ? project.uiState.passportRows
    : [];
  const rows =
    savedRows.length > 0
      ? savedRows
      : [
          { id: "sponsor", field: "Спонсор", description: project.sponsor },
          { id: "projectManager", field: "РП", description: project.projectManager },
          { id: "status", field: "Статус", description: projectStatusLabel(project.status) },
          { id: "rag", field: "Индикатор", description: projectHealthLabel(project.rag) },
        ];

  return rows
    .filter((row) => row.id !== "targetDate" && row.id !== "portfolio")
    .map((row) => ({
      id: row.id,
      field: String(row.field ?? "").trim(),
      description: String(row.description ?? "").trim(),
    }))
    .filter((row) => row.field.length > 0 && row.description.length > 0)
    .slice(0, MAX_PASSPORT_FIELDS);
}

export function ProjectsPage() {
  const ctx = usePageContext();
  const { date, projects, selectProject } = ctx;
  const projectItems = (projects as ProjectListItem[]).filter(
    (project) => project.status !== "CLOSED",
  );

  return (
    <section className="projects-overview-section">
      <article className="panel projects-overview-panel">
        <div className="panel-title">
          <div>
            <h2>Проекты</h2>
            <p>Компактная сводка по паспортам всех проектов</p>
          </div>
        </div>
        {projectItems.length > 0 ? (
          <div className="projects-overview-grid">
            {projectItems.map((project) => {
              const passportRows = compactPassportRows(project);
              return (
                <button
                  type="button"
                  className="projects-overview-card"
                  key={project.id}
                  onClick={() => selectProject(project.id, "project-passport")}
                >
                  <span className={`projects-overview-rag ${project.rag.toLowerCase()}`} />
                  <span className="projects-overview-main">
                    <span className="projects-overview-code">{project.code}</span>
                    <b>{project.name}</b>
                    <small>{project.portfolio}</small>
                  </span>
                  <span className="projects-overview-meta">
                    <span>{projectStatusLabel(project.status)}</span>
                    <span>{project.projectManager}</span>
                    <span>цель {date(project.targetDate)}</span>
                  </span>
                  <span className="projects-overview-passport">
                    {passportRows.map((row) => (
                      <span key={row.id}>
                        <em>{row.field}</em>
                        <strong>{row.description}</strong>
                      </span>
                    ))}
                    {passportRows.length === 0 && (
                      <span>
                        <em>Паспорт</em>
                        <strong>Поля паспорта пока не заполнены</strong>
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty-state compact">Активных проектов нет.</div>
        )}
      </article>
    </section>
  );
}
