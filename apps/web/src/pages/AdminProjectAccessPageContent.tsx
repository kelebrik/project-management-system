import { useI18n } from "../i18n/I18nProvider";
import { Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { ProjectAccessLevel } from "../app/domainTypes";

import type { UserRole } from "../app/adminTypes";
import { usePageContext } from "./PageContext";
import { useConfirm } from "../hooks/useConfirm";



type AccessUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

type AccessProject = {
  id: string;
  code: string;
  name: string;
  level?: number;
  status: string;
};

type AccessRecord = {
  id: string;
  level: ProjectAccessLevel;
  user: AccessUser;
  project: {
    code: string;
    name: string;
    status: string;
  };
};

export function AdminProjectAccessPageContent() {
  const { t, labels: { userRoleLabel } } = useI18n();
  const projectAccessLevelLabels: Record<ProjectAccessLevel, string> = { VIEW: t("admin.access.view"), EDIT: t("admin.access.edit"), ADMIN: t("admin.access.admin") };
  const {
    activeProjectTree,
    deleteProjectAccess,
    grantProjectAccess,
    projectAccessDraft,
    projectAccesses,
    projects,
    savingProjectAccess,
    updateProjectAccessDraft,
    updateProjectAccessLevel,
    isAdminUser,
    users,
  } = usePageContext();
  const confirm = useConfirm();

  const [userSearch, setUserSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const grantLevels: ProjectAccessLevel[] = isAdminUser ? ["EDIT", "ADMIN"] : ["EDIT"];
  const activeUsers = useMemo(
    () => (users as AccessUser[]).filter((user) => user.isActive),
    [users],
  );
  const orderedProjects = useMemo<AccessProject[]>(
    () => (activeProjectTree.length > 0 ? activeProjectTree : projects),
    [activeProjectTree, projects],
  );
  const selectedUserIds = new Set(projectAccessDraft.userIds);
  const selectedProjectIds = new Set(projectAccessDraft.projectIds);
  const selectedUsers = activeUsers.filter((user) => selectedUserIds.has(user.id));
  const selectedProjects = orderedProjects.filter((project) =>
    selectedProjectIds.has(project.id),
  );
  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return activeUsers;
    return activeUsers.filter((user) =>
      `${user.name} ${user.email} ${userRoleLabel(user.role)}`
        .toLowerCase()
        .includes(query),
    );
  }, [activeUsers, userSearch, userRoleLabel]);
  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return orderedProjects;
    return orderedProjects.filter((project) =>
      `${project.code} ${project.name}`.toLowerCase().includes(query),
    );
  }, [orderedProjects, projectSearch]);

  function toggleUser(userId: string) {
    updateProjectAccessDraft({
      userIds: selectedUserIds.has(userId)
        ? projectAccessDraft.userIds.filter((id: string) => id !== userId)
        : [...projectAccessDraft.userIds, userId],
    });
  }

  function toggleProject(projectId: string) {
    updateProjectAccessDraft({
      projectIds: selectedProjectIds.has(projectId)
        ? projectAccessDraft.projectIds.filter((id: string) => id !== projectId)
        : [...projectAccessDraft.projectIds, projectId],
    });
  }

  return (
    <article className="panel project-card admin-project-access">
      <div className="project-access-section-title">
        <div>
          <h2>{t("admin.access.title")}</h2>
          <p>
            {t("admin.access.description")}
          </p>
        </div>
      </div>
      <form className="project-access-grant" onSubmit={grantProjectAccess}>
        <div className="project-access-picker">
          <div className="project-access-picker-title">
            <h3>{t("admin.users")}</h3>
            <span>{t("admin.access.selected", { count: selectedUsers.length })}</span>
          </div>
          <label className="project-access-search">
            <Search size={17} />
            <input
              value={userSearch}
              onChange={(event) => setUserSearch(event.currentTarget.value)}
              placeholder={t("admin.access.searchUser")}
            />
          </label>
          <div className="project-access-choice-list">
            {filteredUsers.map((user) => {
              const checked = selectedUserIds.has(user.id);
              return (
                <label className="project-access-choice" key={user.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleUser(user.id)}
                  />
                  <span>
                    <b>{user.name}</b>
                    <small>
                      {user.email} · {userRoleLabel(user.role)}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="project-access-picker">
          <div className="project-access-picker-title">
            <h3>{t("admin.projects")}</h3>
            <span>{t("admin.access.selected", { count: selectedProjects.length })}</span>
          </div>
          <label className="project-access-search">
            <Search size={17} />
            <input
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.currentTarget.value)}
              placeholder={t("admin.access.searchProject")}
            />
          </label>
          <div className="project-access-choice-list">
            {filteredProjects.map((project) => {
              const checked = selectedProjectIds.has(project.id);
              return (
                <label
                  className="project-access-choice"
                  key={project.id}
                  style={{ paddingLeft: `${12 + Math.min(project.level ?? 0, 4) * 14}px` }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProject(project.id)}
                  />
                  <span>
                    <b>{project.name}</b>
                    <small>
                      {project.code}
                      {project.status === "CLOSED" ? t("admin.access.closed") : ""}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <aside className="project-access-summary">
          <div>
            <h3>{t("admin.access.level")}</h3>
            <div className="project-access-levels">
              {grantLevels.map((level) => (
                <button
                  type="button"
                  className={projectAccessDraft.level === level ? "active" : ""}
                  key={level}
                  onClick={() => updateProjectAccessDraft({ level })}
                >
                  {projectAccessLevelLabels[level]}
                </button>
              ))}
            </div>
          </div>
          <div className="project-access-selection-summary">
            <span>{t("admin.access.userCount", { count: selectedUsers.length })}</span>
            <span>{t("admin.access.projectCount", { count: selectedProjects.length })}</span>
          </div>
          <button
            type="submit"
            disabled={
              savingProjectAccess ||
              selectedUsers.length === 0 ||
              selectedProjects.length === 0
            }
          >
            {t("admin.access.grant")}
          </button>
        </aside>
      </form>

      <div className="project-access-section-title">
        <h3>{t("admin.access.current")}</h3>
        <span>{projectAccesses.length}</span>
      </div>
      <div className="project-access-table">
        <div className="project-access-head">
          <span>{t("admin.user")}</span>
          <span>{t("admin.project")}</span>
          <span>{t("admin.level")}</span>
          <span>{t("admin.role")}</span>
          <span>{t("fields.status")}</span>
          <span />
        </div>
        {(projectAccesses as AccessRecord[]).map(
          (access) => (
            <div className="project-access-row" key={access.id}>
              <div>
                <b>{access.user.name}</b>
                <small>{access.user.email}</small>
              </div>
              <div>
                <b>{access.project.name}</b>
                <small>{access.project.code}</small>
              </div>
              <label>
                <span>{t("admin.level")}</span>
                <select
                  value={access.level}
                  disabled={savingProjectAccess}
                  onChange={(event) =>
                    updateProjectAccessLevel(
                      access.id,
                      event.currentTarget.value as ProjectAccessLevel,
                    )
                  }
                >
                  {isAdminUser && (
                    <option value="VIEW" disabled>{projectAccessLevelLabels.VIEW} ({t("admin.access.everyone")})</option>
                  )}
                  <option value="EDIT">{projectAccessLevelLabels.EDIT}</option>
                  {isAdminUser && <option value="ADMIN">{projectAccessLevelLabels.ADMIN}</option>}
                </select>
              </label>
              <span>{userRoleLabel(access.user.role)}</span>
              <span>
                {access.user.isActive ? t("admin.active") : t("admin.disabled")}
                {access.project.status === "CLOSED" ? t("admin.access.projectClosed") : ""}
              </span>
              <button
                type="button"
                className="ghost-button icon-button"
                aria-label={t("admin.access.delete")}
                disabled={savingProjectAccess}
                onClick={async () => {
                  if (
                    await confirm({
                      title: t("admin.access.deleteConfirm"),
                      message: t("admin.access.deleteWarning"),
                      confirmLabel: t("fields.delete"),
                    })
                  ) {
                    void deleteProjectAccess(access.id);
                  }
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ),
        )}
        {projectAccesses.length === 0 && (
          <p className="project-access-empty">{t("admin.access.empty")}</p>
        )}
      </div>
    </article>
  );
}
