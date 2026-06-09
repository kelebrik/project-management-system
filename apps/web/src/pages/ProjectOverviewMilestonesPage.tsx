import { usePageContext } from "./PageContext";

export function ProjectOverviewMilestonesPage() {
  const ctx = usePageContext();
  const {
    fullscreenWorkspaceView,
    milestoneLabelOffsets,
    milestoneTimeline,
    MilestoneSnakeTimelineSection,
    MilestoneTimelineSection,
    openView,
    printSectionAsPdf,
    project,
    startMilestoneLabelDrag,
    toggleWorkspaceFullscreen,
  } = ctx;

  return (
                <article
                  className={`panel project-card workspace-focus-panel workspace-focus-milestones ${
                    fullscreenWorkspaceView === "overview-milestones-by-phase" ||
                    fullscreenWorkspaceView === "overview-milestones-all"
                      ? "workspace-focus-panel-fullscreen"
                      : ""
                  }`}
                >
                  <div className="panel-title">
                    <div>
                      <h2>Вехи</h2>
                    </div>
                    <div className="panel-title-actions">
                      {project.jiraIntegration && (
                        <a
                          className="button"
                          href={project.jiraIntegration.boardUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть доску Jira
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="milestone-sections">
                    {fullscreenWorkspaceView !== "overview-milestones-all" && (
                      <MilestoneTimelineSection
                        sectionId="milestones-by-phase"
                        title="Вехи по фазам"
                        timeline={milestoneTimeline.byPhase}
                        labelOffsets={milestoneLabelOffsets}
                        isFullscreen={
                          fullscreenWorkspaceView ===
                          "overview-milestones-by-phase"
                        }
                        onToggleFullscreen={() =>
                          toggleWorkspaceFullscreen(
                            "overview-milestones-by-phase",
                          )
                        }
                        onOpenStructure={() => openView("project-structure")}
                        onLabelPointerDown={startMilestoneLabelDrag}
                        onPrint={() =>
                          printSectionAsPdf(
                            "milestones-by-phase",
                            `${project.code} - вехи по фазам`,
                          )
                        }
                      />
                    )}
                    {fullscreenWorkspaceView !==
                      "overview-milestones-by-phase" && (
                      <MilestoneSnakeTimelineSection
                        sectionId="milestones-all"
                        title="Все вехи"
                        timeline={milestoneTimeline.all}
                        labelOffsets={milestoneLabelOffsets}
                        isFullscreen={
                          fullscreenWorkspaceView === "overview-milestones-all"
                        }
                        onToggleFullscreen={() =>
                          toggleWorkspaceFullscreen("overview-milestones-all")
                        }
                        onOpenStructure={() => openView("project-structure")}
                        onLabelPointerDown={startMilestoneLabelDrag}
                        onPrint={() =>
                          printSectionAsPdf(
                            "milestones-all",
                            `${project.code} - все вехи`,
                          )
                        }
                      />
                    )}
                  </div>
                </article>
              );
}
