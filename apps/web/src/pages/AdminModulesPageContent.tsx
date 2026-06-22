import { usePageContext } from "./PageContext";

export function AdminModulesPageContent() {
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
                      <h2>Администрирование: управление модулями</h2>
                      <p>
                        Включение и скрытие страниц раздела Проекты для всех
                        пользователей.
                      </p>
                    </div>
                  </div>
                  <div className="project-module-admin">
                    <div className="project-module-table">
                      <div className="project-module-head">
                        <span>Страница</span>
                        <span>Адрес</span>
                        <span>Назначение</span>
                        <span>Показывать</span>
                      </div>
                      {normalizedProjectModules.map((module) => {
                        const enabled =
                          projectModuleDrafts[module.key] ?? module.enabled;
                        return (
                          <div className="project-module-row" key={module.key}>
                            <div>
                              <b>{module.label}</b>
                              <small>{module.key}</small>
                            </div>
                            <code>/{module.route}</code>
                            <span>{module.description}</span>
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
                              <span>{enabled ? "Включена" : "Скрыта"}</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    {savingProjectModules && (
                      <p className="module-save-state">Сохраняю настройки...</p>
                    )}
                  </div>
                </article>
              );
}
