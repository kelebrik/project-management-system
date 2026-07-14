import { Plus, X } from "lucide-react";
import { useState } from "react";
import { ProjectRaidRegister } from "./ProjectRaidRegister";
import { ProjectRaidSidePanel } from "./ProjectRaidSidePanel";
import { useFocusTrap } from "../hooks/useFocusTrap";

export function ProjectRaidPage() {
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const drawerRef = useFocusTrap<HTMLElement>(showCreatePanel, () =>
    setShowCreatePanel(false),
  );

  return (
                  <article className="panel overview-panel">
                    <div className="panel-title">
                      <div>
                        <h2>Риски и проблемы</h2>
                        <p>
                          Риски, проблемы и допущения с влиянием на сроки и обзор
                          для руководства
                        </p>
                      </div>
                      <button type="button" onClick={() => setShowCreatePanel(true)}>
                        <Plus size={15} /> Новая запись
                      </button>
                  </div>
                  <div className="raid-board raid-board-wide">
                    <ProjectRaidRegister />
                  </div>
                  {showCreatePanel && (
                    <div className="drawer-backdrop" onMouseDown={() => setShowCreatePanel(false)}>
                      <aside
                        className="raid-create-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Создание записи RAID"
                        ref={drawerRef}
                        tabIndex={-1}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <div className="drawer-header">
                          <strong>Новая запись RAID</strong>
                          <button
                            type="button"
                            aria-label="Закрыть"
                            title="Закрыть"
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
