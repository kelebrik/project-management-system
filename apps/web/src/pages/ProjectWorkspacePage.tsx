import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";
import { ProjectGanttSection } from "./ProjectGanttSection";
import { ProjectStructureSection } from "./ProjectStructureSection";
import { EmployeeNamesList } from "../components/EmployeeNamesList";
import { WbsDraftButton } from "../components/ai/AiProjectButtons";
import { PlanSnapshotsButton } from "../components/planSnapshots/PlanSnapshotsButton";
import { WbsTableButton } from "../components/wbsTable/WbsTableButton";
import { hasPendingWbsBuffers } from "../components/WbsBufferedInput";

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
                    {activeView === "project-structure" && (
                      <PlanSnapshotsButton
                        canWrite={!ctx.isReadOnly && !ctx.isClosedProject}
                        hasUnsavedEdits={() => (ctx.dirtyWbsItemIds?.size ?? 0) > 0 || hasPendingWbsBuffers() || Boolean(ctx.savingWbsBulk)}
                        projectId={ctx.project.id}
                      />
                    )}
                    {activeView === "project-structure" && (
                      <WbsTableButton
                        canWrite={!ctx.isReadOnly && !ctx.isClosedProject}
                        hasUnsavedEdits={() => (ctx.dirtyWbsItemIds?.size ?? 0) > 0 || hasPendingWbsBuffers() || Boolean(ctx.savingWbsBulk)}
                        items={ctx.project.wbsItems}
                        onImported={() => ctx.refreshProject(ctx.project.id)}
                        projectCode={ctx.project.code}
                        projectId={ctx.project.id}
                      />
                    )}
                    {activeView === "project-structure" && !ctx.isReadOnly && (
                      <WbsDraftButton onApplied={() => ctx.refreshProject(ctx.project.id)} projectId={ctx.project.id} unsavedRows={ctx.dirtyWbsItemIds?.size ?? 0} />
                    )}
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
