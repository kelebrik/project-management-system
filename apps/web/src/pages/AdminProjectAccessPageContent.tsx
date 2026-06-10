import { Trash2 } from "lucide-react";

import type { ProjectAccessLevel } from "../app/domainTypes";
import { userRoleLabel } from "../app/adminHelpers";
import type { UserRole } from "../app/adminTypes";
import { usePageContext } from "./PageContext";

const projectAccessLevelLabels: Record<ProjectAccessLevel, string> = {
  VIEW: "Просмотр",
  EDIT: "Изменение",
  ADMIN: "Администрирование",
};

function selectedValues(options: HTMLCollectionOf<HTMLOptionElement>) {
  return Array.from(options)
    .filter((option) => option.selected)
    .map((option) => option.value);
}

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
    users,
  } = usePageContext();

  const activeUsers = users.filter((user: { isActive: boolean }) => user.isActive);
  const orderedProjects = activeProjectTree.length > 0 ? activeProjectTree : projects;

  return (
    <article className="panel project-card admin-project-access">
      <div className="panel-title">
        <div>
          <h2>Администрирование: доступ к проектам</h2>
          <p>
            Индивидуальные права пользователей на просмотр и изменение выбранных
            проектов.
          </p>
        </div>
      </div>

      <form className="project-access-grant" onSubmit={grantProjectAccess}>
        <label>
          <span>Пользователи</span>
          <select
            multiple
            value={projectAccessDraft.userIds}
            onChange={(event) =>
              updateProjectAccessDraft({
                userIds: selectedValues(event.currentTarget.selectedOptions),
              })
            }
          >
            {activeUsers.map(
              (user: { id: string; name: string; email: string; role: UserRole }) => (
                <option key={user.id} value={user.id}>
                  {user.name} · {user.email} · {userRoleLabel(user.role)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          <span>Проекты</span>
          <select
            multiple
            value={projectAccessDraft.projectIds}
            onChange={(event) =>
              updateProjectAccessDraft({
                projectIds: selectedValues(event.currentTarget.selectedOptions),
              })
            }
          >
            {orderedProjects.map(
              (project: {
                id: string;
                code: string;
                name: string;
                level?: number;
                status: string;
              }) => (
                <option key={project.id} value={project.id}>
                  {"- ".repeat(project.level ?? 0)}
                  {project.code} · {project.name}
                  {project.status === "CLOSED" ? " · закрыт" : ""}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          <span>Уровень доступа</span>
          <select
            value={projectAccessDraft.level}
            onChange={(event) =>
              updateProjectAccessDraft({
                level: event.currentTarget.value as ProjectAccessLevel,
              })
            }
          >
            <option value="VIEW">{projectAccessLevelLabels.VIEW}</option>
            <option value="EDIT">{projectAccessLevelLabels.EDIT}</option>
            <option value="ADMIN">{projectAccessLevelLabels.ADMIN}</option>
          </select>
        </label>
        <button type="submit" disabled={savingProjectAccess}>
          Выдать доступ
        </button>
      </form>

      <div className="project-access-table">
        <div className="project-access-head">
          <span>Пользователь</span>
          <span>Проект</span>
          <span>Уровень</span>
          <span>Роль</span>
          <span>Статус</span>
          <span />
        </div>
        {projectAccesses.map(
          (access: {
            id: string;
            level: ProjectAccessLevel;
            user: {
              name: string;
              email: string;
              role: UserRole;
              isActive: boolean;
            };
            project: {
              code: string;
              name: string;
              status: string;
            };
          }) => (
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
                  <option value="VIEW">{projectAccessLevelLabels.VIEW}</option>
                  <option value="EDIT">{projectAccessLevelLabels.EDIT}</option>
                  <option value="ADMIN">{projectAccessLevelLabels.ADMIN}</option>
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
                onClick={() => deleteProjectAccess(access.id)}
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
