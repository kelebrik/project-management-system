import { Trash2 } from "lucide-react";

import { usePageContext } from "./PageContext";
import type { ProjectRegistryDraft } from "../app/formState";
import type { RagStatus } from "../app/domainTypes";

export function AdminProjectsPageContent() {
  const ctx = usePageContext();
  const {
    activeProjectTree,
    closeProject,
    currentUser,
    deleteProject,
    firstEnabledProjectView,
    openView,
    projectOptionLabel,
    projectRegistryDrafts,
    projectStatusLabel,
    projectToRegistryDraft,
    ragOptionLabel,
    saveProjectRegistryItem,
    savingProjectRegistryId,
    selectProject,
    updateProjectRegistryDraft,
  } = ctx;

  return (
                    <article className="panel project-card">
                      <div className="panel-title">
                        <div>
                          <h2>Администрирование: реестр проектов</h2>
                        <p>
                          Управление кодами, наименованиями и иерархией проектов
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openView("project-create")}
                      >
                        Создать проект
                      </button>
                    </div>
                    <div className="project-admin-table">
                      <div className="project-admin-head">
                        <span>Код</span>
                        <span>Наименование</span>
                        <span>Родитель</span>
                        <span>РП</span>
                        <span>Статус</span>
                        <span>Индикатор</span>
                        <span>Порядок</span>
                        <span />
                      </div>
                      {activeProjectTree.map((item) => {
                        const draft =
                          projectRegistryDrafts[item.id] ??
                          projectToRegistryDraft(item);
                        return (
                          <div className="project-admin-row" key={item.id}>
                            <div className="project-admin-readonly">
                              <span>Код</span>
                              <b>{item.code}</b>
                            </div>
                            <div
                              className="project-admin-readonly project-admin-name"
                              style={{
                                paddingLeft: `${Math.min(item.level * 18, 72) + 10}px`,
                              }}
                            >
                              <span>Наименование</span>
                              <b>{item.name}</b>
                            </div>
                            <label>
                              <span>Родитель</span>
                              <select
                                value={draft.parentId}
                                onChange={(event) =>
                                  updateProjectRegistryDraft(item.id, {
                                    parentId: event.target.value,
                                  })
                                }
                              >
                                <option value="">Корень</option>
                                {activeProjectTree
                                  .filter((option) => option.id !== item.id)
                                  .map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {"- ".repeat(option.level)}
                                      {projectOptionLabel(option)}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              <span>РП</span>
                              <input
                                value={draft.projectManager}
                                onChange={(event) =>
                                  updateProjectRegistryDraft(item.id, {
                                    projectManager: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              <span>Статус</span>
                              <select
                                value={draft.status}
                                onChange={(event) =>
                                  updateProjectRegistryDraft(item.id, {
                                    status: event.target
                                      .value as ProjectRegistryDraft["status"],
                                  })
                                }
                              >
                                <option value="DRAFT">{projectStatusLabel("DRAFT")}</option>
                                <option value="ACTIVE">{projectStatusLabel("ACTIVE")}</option>
                                <option value="ON_HOLD">{projectStatusLabel("ON_HOLD")}</option>
                              </select>
                            </label>
                            <label>
                              <span>Индикатор</span>
                              <select
                                value={draft.rag}
                                onChange={(event) =>
                                  updateProjectRegistryDraft(item.id, {
                                    rag: event.target.value as RagStatus,
                                  })
                                }
                              >
                                <option value="GREEN">{ragOptionLabel("GREEN")}</option>
                                <option value="AMBER">{ragOptionLabel("AMBER")}</option>
                                <option value="RED">{ragOptionLabel("RED")}</option>
                              </select>
                            </label>
                            <label>
                              <span>Порядок</span>
                              <input
                                type="number"
                                value={draft.sortOrder}
                                onChange={(event) =>
                                  updateProjectRegistryDraft(item.id, {
                                    sortOrder: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <div className="project-admin-actions">
                              <button
                                type="button"
                                onClick={() =>
                                  selectProject(item.id, firstEnabledProjectView)
                                }
                              >
                                Открыть
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void saveProjectRegistryItem(item.id)
                                }
                                disabled={savingProjectRegistryId === item.id}
                              >
                                {savingProjectRegistryId === item.id
                                  ? "Сохраняю..."
                                  : "Сохранить"}
                              </button>
                              {currentUser?.role === "ADMIN" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void closeProject(item.id)}
                                    disabled={savingProjectRegistryId === item.id}
                                    title="Перенести проект в закрытые и заблокировать редактирование"
                                  >
                                    Закрыть
                                  </button>
                                  <button
                                    type="button"
                                    className="danger-button"
                                    onClick={() => void deleteProject(item.id)}
                                    disabled={savingProjectRegistryId === item.id}
                                    title="Удалить проект и все связанные данные"
                                  >
                                    <Trash2 size={14} />
                                    Удалить
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {activeProjectTree.length === 0 && (
                        <div className="empty-state">Активные проекты не найдены.</div>
                      )}
                    </div>
                  </article>
              );
}
