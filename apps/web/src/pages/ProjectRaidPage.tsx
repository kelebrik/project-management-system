import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { ProjectRaidRegister } from "./ProjectRaidRegister";
import { ProjectRaidMatrixCard } from "./ProjectRaidMatrixCard";
import { ProjectRaidSidePanel } from "./ProjectRaidSidePanel";
import { useFocusTrap } from "../hooks/useFocusTrap";

export function ProjectRaidPage() {
  const { t: uiText } = useInterfaceTranslation();
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const drawerRef = useFocusTrap<HTMLElement>(showCreatePanel, () =>
    setShowCreatePanel(false),
  );

  return (
                  <article className="panel overview-panel">
                    <div className="panel-title">
                      <div>
                        <h2>{uiText("ui.projects.raidPageTitle")}</h2>
                        <p>
                          {uiText("ui.projects.raidPageSubtitle")}
                        </p>
                      </div>
                      <button type="button" onClick={() => setShowCreatePanel(true)}>
                        <Plus size={15} /> {uiText("ui.projects.newEntryAction")}
                      </button>
                  </div>
                  <div className="raid-board raid-board-matrix">
                    <ProjectRaidRegister />
                    <ProjectRaidMatrixCard />
                  </div>
                  {showCreatePanel && (
                    <div className="drawer-backdrop" onMouseDown={() => setShowCreatePanel(false)}>
                      <aside
                        className="raid-create-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-label={uiText("ui.projects.raidCreateEntryDialogLabel")}
                        ref={drawerRef}
                        tabIndex={-1}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <div className="drawer-header">
                          <strong>{uiText("ui.projects.raidNewEntryTitle")}</strong>
                          <button
                            type="button"
                            aria-label={uiText("ui.admin.close")}
                            title={uiText("ui.admin.close")}
                            onClick={() => setShowCreatePanel(false)}
                          >
                            <X size={17} />
                          </button>
                        </div>
                        <ProjectRaidSidePanel showMatrix={false} />
                      </aside>
                    </div>
                  )}
                </article>
              );
}
