import { usePageContext } from "./PageContext";
import { ProjectGanttSection } from "./ProjectGanttSection";
import { ProjectStructureSection } from "./ProjectStructureSection";

export function ProjectWorkspacePage() {
  const ctx = usePageContext();
  const {
    activeView,
    fullscreenWorkspaceView,
  } = ctx;

  return (
    <>
                    <article
                      className={`panel project-card workspace-focus-panel ${
                        fullscreenWorkspaceView === activeView
                          ? "workspace-focus-panel-fullscreen"
                          : ""
                      } ${
                        activeView === "project-structure"
                          ? "workspace-focus-structure"
                          : "workspace-focus-gantt"
                      }`}
                    >
                    <div className="panel-title">
                      <div>
                        <h2>
                          {activeView === "project-structure"
                            ? "Структура"
                            : "Гантт"}
                        </h2>
                        <p>
                          {activeView === "project-structure"
                            ? "Иерархия работ проекта, сроки, ответственные, календарь и связи с предшественниками"
                          : "Временная шкала проекта, связи и базовый план"}
                      </p>
                    </div>
                        </div>
                      <div className="wbs-gantt-layout">
                      {activeView === "project-structure" && <ProjectStructureSection />}
                      {activeView === "project-gantt" && <ProjectGanttSection />}
                  </div>
                </article>
    </>
              );
}
