import { Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { ProjectAccessLevel } from "../app/domainTypes";
import { userRoleLabel } from "../app/adminHelpers";
import type { UserRole } from "../app/adminTypes";
import { usePageContext } from "./PageContext";
import { useConfirm } from "../hooks/useConfirm";

const projectAccessLevelLabels: Record<ProjectAccessLevel, string> = {
  VIEW: "Просмотр",
  EDIT: "Изменение",
  ADMIN: "Администрирование",
};

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
  }, [activeUsers, userSearch]);
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
          <h2>Доступы к проектам</h2>
          <p>
            Все пользователи уже видят все проекты. Администратор БЮ может выдавать
            право изменения только в выбранном бизнес-юните.
          </p>
        </div>
      </div>
      <form className="project-access-grant" onSubmit={grantProjectAccess}>
        <div className="project-access-picker">
          <div className="project-access-picker-title">
            <h3>Пользователи</h3>
            <span>{selectedUsers.length} выбрано</span>
          </div>
          <label className="project-access-search">
            <Search size={17} />
            <input
              value={userSearch}
              onChange={(event) => setUserSearch(event.currentTarget.value)}
              placeholder="Поиск пользователя"
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
            <h3>Проекты</h3>
            <span>{selectedProjects.length} выбрано</span>
          </div>
          <label className="project-access-search">
            <Search size={17} />
            <input
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.currentTarget.value)}
              placeholder="Поиск проекта"
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
                      {project.status === "CLOSED" ? " · закрыт" : ""}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <aside className="project-access-summary">
          <div>
            <h3>Уровень доступа</h3>
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
            <span>Пользователей: {selectedUsers.length}</span>
            <span>Проектов: {selectedProjects.length}</span>
          </div>
          <button
            type="submit"
            disabled={
              savingProjectAccess ||
              selectedUsers.length === 0 ||
              selectedProjects.length === 0
            }
          >
            Выдать доступ
          </button>
        </aside>
      </form>

      <div className="project-access-section-title">
        <h3>Текущие доступы</h3>
        <span>{projectAccesses.length}</span>
      </div>
      <div className="project-access-table">
        <div className="project-access-head">
          <span>Пользователь</span>
          <span>Проект</span>
          <span>Уровень</span>
          <span>Роль</span>
          <span>Статус</span>
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
                <span>Уровень</span>
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
                    <option value="VIEW" disabled>{projectAccessLevelLabels.VIEW} (уже есть у всех)</option>
                  )}
                  <option value="EDIT">{projectAccessLevelLabels.EDIT}</option>
                  {isAdminUser && <option value="ADMIN">{projectAccessLevelLabels.ADMIN}</option>}
                </select>
              </label>
              <span>{userRoleLabel(access.user.role)}</span>
              <span>
                {access.user.isActive ? "Активен" : "Отключен"}
                {access.project.status === "CLOSED" ? " · проект закрыт" : ""}
              </span>
              <button
                type="button"
                className="ghost-button icon-button"
                aria-label="Удалить доступ"
                disabled={savingProjectAccess}
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Удалить доступ?",
                      message: "Пользователь потеряет право изменять или администрировать проект. Просмотр сохранится.",
                      confirmLabel: "Удалить",
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
          <p className="project-access-empty">Назначенных доступов пока нет.</p>
        )}
      </div>
    </article>
  );
}
