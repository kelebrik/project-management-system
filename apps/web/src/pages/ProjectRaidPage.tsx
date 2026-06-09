import { ProjectRaidRegister } from "./ProjectRaidRegister";
import { ProjectRaidSidePanel } from "./ProjectRaidSidePanel";

export function ProjectRaidPage() {
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
                  </div>
                  <div className="raid-board">
                    <ProjectRaidRegister />
                    <ProjectRaidSidePanel />
                  </div>
                </article>
              );
}
