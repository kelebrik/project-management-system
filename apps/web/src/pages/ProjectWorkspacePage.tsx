import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";
import { ProjectGanttSection } from "./ProjectGanttSection";
import { ProjectStructureSection } from "./ProjectStructureSection";
import { EmployeeNamesList } from "../components/EmployeeNamesList";

export function ProjectWorkspacePage() {
  const { t: uiText } = useInterfaceTranslation();
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
                            ? uiText("ui.projects.structureTabLabel")
                            : uiText("ui.projects.ganttTabLabel")}
                        </h2>
                        <p>
                          {activeView === "project-structure"
                            ? uiText("ui.projects.structureTabDescription")
                          : uiText("ui.projects.ganttTabDescription")}
                      </p>
                    </div>
                        </div>
                      <div className="wbs-gantt-layout">
                      {activeView === "project-structure" && !ctx.isReadOnly && <EmployeeNamesList />}
                      {activeView === "project-structure" && <ProjectStructureSection />}
                      {activeView === "project-gantt" && <ProjectGanttSection key={`${ctx.currentUser?.id}:${ctx.project.id}`} />}
                  </div>
                </article>
    </>
              );
}
