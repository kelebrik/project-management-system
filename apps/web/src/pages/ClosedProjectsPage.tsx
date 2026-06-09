import { usePageContext } from "./PageContext";
import type { CSSProperties } from "react";

export function ClosedProjectsPage() {
  const ctx = usePageContext();
  const {
    closedProjectTree,
    firstEnabledProjectView,
    selectProject,
  } = ctx;

  return (
              <section className="projects-tree-section">
                <article className="panel project-tree-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Закрытые проекты</h2>
                      <p>
                        Архив завершенных проектов. Проекты в этом разделе
                        доступны только для просмотра.
                      </p>
                    </div>
                  </div>
                  <div className="project-tree-list">
                    <div className="project-tree-head">
                      <span>Код проекта</span>
                      <span>Имя проекта</span>
                      <span />
                      <span>РП</span>
                      <span>Прогресс</span>
                      <span>Индикатор</span>
                    </div>
                    {closedProjectTree.map((item) => (
                      <div className="project-tree-row closed" key={item.id}>
                        <span
                          className="project-tree-code-static"
                          style={
                            {
                              marginLeft: `${item.level * 18}px`,
                              "--project-indent": `${item.level * 18}px`,
                            } as CSSProperties
                          }
                        >
                          {item.code}
                        </span>
                        <span className="project-tree-name-static">
                          {item.name}
                        </span>
                        <button
                          type="button"
                          className="project-tree-open"
                          onClick={() => selectProject(item.id, firstEnabledProjectView)}
                        >
                          Посмотреть
                        </button>
                        <span>{item.projectManager}</span>
                        <span>{item.progress}%</span>
                        <span className={`rag-dot ${item.rag.toLowerCase()}`} />
                      </div>
                    ))}
                    {closedProjectTree.length === 0 && (
                      <div className="empty-state">Закрытых проектов пока нет.</div>
                    )}
                  </div>
                </article>
              </section>
            );
}
