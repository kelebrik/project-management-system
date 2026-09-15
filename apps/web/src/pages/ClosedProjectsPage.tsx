import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";
import type { CSSProperties } from "react";

export function ClosedProjectsPage() {
  const { t } = useI18n();
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
                      <h2>{t("archive.title")}</h2>
                      <p>
                        {t("archive.description")}
                      </p>
                    </div>
                  </div>
                  <div className="project-tree-list">
                    <div className="project-tree-head">
                      <span>{t("fields.projectCode")}</span>
                      <span>{t("fields.projectName")}</span>
                      <span />
                      <span>{t("fields.pm")}</span>
                      <span>{t("fields.progress")}</span>
                      <span>{t("fields.rag")}</span>
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
                          {t("fields.view")}
                        </button>
                        <span>{item.projectManager}</span>
                        <span>{item.progress}%</span>
                        <span className={`rag-dot ${item.rag.toLowerCase()}`} />
                      </div>
                    ))}
                    {closedProjectTree.length === 0 && (
                      <div className="empty-state">{t("archive.empty")}</div>
                    )}
                  </div>
                </article>
              </section>
            );
}
