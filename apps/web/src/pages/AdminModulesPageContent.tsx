import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

export function AdminModulesPageContent() {
  const { t, labels } = useI18n();
  const ctx = usePageContext();
  const {
    normalizedProjectModules,
    projectModuleDrafts,
    savingProjectModules,
    updateProjectModuleDraft,
  } = ctx;

  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <p>
                        {t("admin.modules.description")}
                      </p>
                    </div>
                  </div>
                  <div className="project-module-admin">
                    <div className="project-module-table">
                      <div className="project-module-head">
                        <span>{t("admin.modules.page")}</span>
                        <span>{t("admin.modules.address")}</span>
                        <span>{t("admin.modules.purpose")}</span>
                        <span>{t("admin.modules.show")}</span>
                      </div>
                      {normalizedProjectModules.map((module) => {
                        const enabled =
                          projectModuleDrafts[module.key] ?? module.enabled;
                        return (
                          <div className="project-module-row" key={module.key}>
                            <div>
                              <b>{labels.moduleLabel(module.key)}</b>
                              <small>{module.key}</small>
                            </div>
                            <code>/{module.route}</code>
                            <span>{labels.moduleDescription(module.key)}</span>
                            <label className="module-switch">
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={savingProjectModules}
                                onChange={(event) =>
                                  updateProjectModuleDraft(
                                    module.key,
                                    event.target.checked,
                                  )
                                }
                              />
                              <span>{enabled ? t("admin.modules.enabled") : t("admin.modules.hidden")}</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    {savingProjectModules && (
                      <p className="module-save-state">{t("admin.modules.saving")}</p>
                    )}
                  </div>
                </article>
              );
}
