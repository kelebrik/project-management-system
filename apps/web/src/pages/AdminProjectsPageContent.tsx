import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { apiClient } from "../api/client";
import { usePageContext } from "./PageContext";
import { useConfirm } from "../hooks/useConfirm";
import type { ProjectRegistryDraft } from "../app/formState";
import type { RagStatus } from "../app/domainTypes";

export function AdminProjectsPageContent() {
  const { t: uiText } = useInterfaceTranslation();
  const ctx = usePageContext();
  const confirm = useConfirm();
  const {
    activeProjectTree,
    closeProject,
    currentUser,
    deleteProject,
    firstEnabledProjectView,
    projectOptionLabel,
    projectRegistryDrafts,
    projectStatusLabel,
    projectToRegistryDraft,
    ragOptionLabel,
    moveProjectToBusinessUnit,
    savePortfolioProjectIdentity,
    saveProjectRegistryItem,
    savingProjectRegistryId,
    selectProject,
    updateProjectRegistryDraft,
  } = ctx;
  const [businessUnits, setBusinessUnits] = useState<Array<{
    id: string;
    name: string;
  }>>([]);

  useEffect(() => {
    if (currentUser?.role !== "ADMIN") return;
    let cancelled = false;
    void apiClient
      .get<Array<{ id: string; name: string }>>(
        "/api/business-units",
        "Не удалось загрузить бизнес-юниты",
      )
      .then((units) => {
        if (!cancelled) setBusinessUnits(units);
      })
      .catch(() => {
        if (!cancelled) setBusinessUnits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.role]);

  const updateAndSaveProjectIdentity = (
    projectId: string,
    currentDraft: ProjectRegistryDraft,
    patch: Partial<ProjectRegistryDraft>,
  ) => {
    const nextDraft = { ...currentDraft, ...patch };
    updateProjectRegistryDraft(projectId, patch);
    void savePortfolioProjectIdentity(projectId, nextDraft);
  };
  const saveProjectItem = (
    projectId: string,
    draftOverride?: ProjectRegistryDraft,
  ) => {
    void saveProjectRegistryItem(projectId, draftOverride);
  };
  const updateAndSaveProjectItem = (
    projectId: string,
    currentDraft: ProjectRegistryDraft,
    patch: Partial<ProjectRegistryDraft>,
  ) => {
    const nextDraft = { ...currentDraft, ...patch };
    updateProjectRegistryDraft(projectId, patch);
    saveProjectItem(projectId, nextDraft);
  };

  return (
                    <article className="panel project-card">
                      <div className="panel-title">
                        <div>
                        <p>
                          {uiText("ui.admin.manageProjectCodesNamesHierarchy")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void ctx.openProjectCreate()}
                      >
                        {uiText("ui.admin.createProject")}
                      </button>
                    </div>
                    <div className="project-admin-table">
                      <div className="project-admin-head">
                        <span>{uiText("ui.admin.code")}</span>
                        <span>{uiText("ui.admin.itemName")}</span>
                        <span>{uiText("ui.admin.parent")}</span>
                        <span>{uiText("ui.admin.businessUnitShort")}</span>
                        <span>{uiText("ui.admin.projectManagerShort")}</span>
                        <span>{uiText("ui.admin.status")}</span>
                        <span>{uiText("ui.admin.indicator")}</span>
                        <span>{uiText("ui.admin.order")}</span>
                        <span />
                      </div>
                      {activeProjectTree.map((item) => {
                        const draft =
                          projectRegistryDrafts[item.id] ??
                          projectToRegistryDraft(item);
                        return (
                          <div className="project-admin-row" key={item.id}>
                            <label>
                              <span>{uiText("ui.admin.code")}</span>
                              <input
                                value={draft.code}
                                onChange={(event) =>
                                  updateProjectRegistryDraft(item.id, {
                                    code: event.target.value,
                                  })
                                }
                                onBlur={(event) =>
                                  updateAndSaveProjectIdentity(item.id, draft, {
                                    code: event.currentTarget.value,
                                  })
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                  }
                                }}
                              />
                            </label>
                            <label
                              className="project-admin-name"
                              style={{
                                paddingLeft: `${Math.min(item.level * 18, 72) + 10}px`,
                              }}
                            >
                              <span>{uiText("ui.admin.itemName")}</span>
                              <input
                                value={draft.name}
                                onChange={(event) =>
                                  updateProjectRegistryDraft(item.id, {
                                    name: event.target.value,
                                  })
                                }
                                onBlur={(event) =>
                                  updateAndSaveProjectIdentity(item.id, draft, {
                                    name: event.currentTarget.value,
                                  })
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                  }
                                }}
                              />
                            </label>
                            <label>
                              <span>{uiText("ui.admin.parent")}</span>
                              <select
                                value={draft.parentId}
                                onChange={(event) =>
                                  updateAndSaveProjectItem(item.id, draft, {
                                    parentId: event.target.value,
                                  })
                                }
                              >
                                <option value="">{uiText("ui.admin.root")}</option>
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
                            {currentUser?.role === "ADMIN" ? (
                              <label>
                                <span>{uiText("ui.admin.businessUnitShort")}</span>
                                <select
                                  value={item.businessUnitId}
                                  disabled={savingProjectRegistryId === item.id}
                                  onChange={async (event) => {
                                    const target = businessUnits.find(
                                      (unit) => unit.id === event.currentTarget.value,
                                    );
                                    if (!target || target.id === item.businessUnitId) return;
                                    const approved = await confirm({
                                      title: "Перенести проект в другой БЮ?",
                                      message:
                                        `«${item.code} · ${item.name}» будет перенесен из «${item.businessUnit.name}» в «${target.name}». ` +
                                        "Вместе с ним будут перенесены все дочерние проекты, включая закрытые. Связь с прежним родителем будет удалена, все индивидуальные доступы к переносимым проектам будут сброшены.",
                                      confirmLabel: "Перенести",
                                    });
                                    if (approved) {
                                      void moveProjectToBusinessUnit(item.id, target.id);
                                    }
                                  }}
                                >
                                  {businessUnits.map((unit) => (
                                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <span className="project-admin-readonly">
                                <span>{uiText("ui.admin.businessUnitShort")}</span>
                                {item.businessUnit.name}
                              </span>
                            )}
                            <label>
                              <span>{uiText("ui.admin.projectManagerShort")}</span>
                              <input
                                value={draft.projectManager}
                                onChange={(event) =>
                                  updateProjectRegistryDraft(item.id, {
                                    projectManager: event.target.value,
                                  })
                                }
                                onBlur={(event) =>
                                  updateAndSaveProjectItem(item.id, draft, {
                                    projectManager: event.currentTarget.value,
                                  })
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                  }
                                }}
                              />
                            </label>
                            <label>
                              <span>{uiText("ui.admin.status")}</span>
                              <select
                                value={draft.status}
                                onChange={(event) =>
                                  updateAndSaveProjectItem(item.id, draft, {
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
                              <span>{uiText("ui.admin.indicator")}</span>
                              <select
                                value={draft.rag}
                                onChange={(event) =>
                                  updateAndSaveProjectItem(item.id, draft, {
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
                              <span>{uiText("ui.admin.order")}</span>
                              <input
                                type="number"
                                value={draft.sortOrder}
                                onChange={(event) =>
                                  updateProjectRegistryDraft(item.id, {
                                    sortOrder: event.target.value,
                                  })
                                }
                                onBlur={(event) =>
                                  updateAndSaveProjectItem(item.id, draft, {
                                    sortOrder: event.currentTarget.value,
                                  })
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                  }
                                }}
                              />
                            </label>
                            <div className="project-admin-actions">
                              <button
                                type="button"
                                onClick={() =>
                                  selectProject(item.id, firstEnabledProjectView)
                                }
                              >
                                {uiText("ui.admin.open")}
                              </button>
                              <button
                                type="button"
                                onClick={() => saveProjectItem(item.id)}
                                disabled={savingProjectRegistryId === item.id}
                              >
                                {savingProjectRegistryId === item.id
                                  ? uiText("ui.admin.savingEllipsisDots")
                                  : uiText("ui.admin.save")}
                              </button>
                              {currentUser?.role === "ADMIN" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void closeProject(item.id)}
                                    disabled={savingProjectRegistryId === item.id}
                                    title={uiText("ui.admin.closeProjectTooltip")}
                                  >
                                    {uiText("ui.admin.close")}
                                  </button>
                                  <button
                                    type="button"
                                    className="danger-button"
                                    onClick={async () => {
                                      if (
                                        await confirm({
                                          title: "Удалить проект?",
                                          message:
                                            "Проект и все связанные данные будут удалены безвозвратно.",
                                          confirmLabel: "Удалить",
                                        })
                                      ) {
                                        void deleteProject(item.id);
                                      }
                                    }}
                                    disabled={savingProjectRegistryId === item.id}
                                    title={uiText("ui.admin.deleteProjectTooltip")}
                                  >
                                    <Trash2 size={14} />
                                    {uiText("ui.admin.delete")}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {activeProjectTree.length === 0 && (
                        <div className="empty-state">{uiText("ui.admin.noActiveProjectsFound")}</div>
                      )}
                    </div>
                  </article>
              );
}
