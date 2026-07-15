import { Building2, Plus, Search, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { apiClient } from "../api/client";
import { BUSINESS_UNITS_CHANGED_EVENT } from "../app/businessUnitContext";
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

type BusinessUnitDirectoryUser = Pick<AccessUser, "id" | "name" | "email" | "isActive">;

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

type BusinessUnitRole = "ADMIN" | "PROJECT_MANAGER" | "VIEWER";
type BusinessUnitMembership = {
  id: string;
  role: BusinessUnitRole;
  user: Pick<AccessUser, "id" | "name" | "email" | "isActive">;
};
type BusinessUnit = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  memberships: BusinessUnitMembership[];
  _count: { projects: number };
};

const businessUnitRoleLabels: Record<BusinessUnitRole, string> = {
  ADMIN: "Администратор бизнес-юнита",
  PROJECT_MANAGER: "Руководитель проектов",
  VIEWER: "Наблюдатель",
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
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [businessUnitUsers, setBusinessUnitUsers] = useState<BusinessUnitDirectoryUser[]>([]);
  const [businessUnitError, setBusinessUnitError] = useState("");
  const [creatingUnit, setCreatingUnit] = useState(false);
  const [unitDraft, setUnitDraft] = useState({ code: "", name: "" });
  const [membershipDraft, setMembershipDraft] = useState({
    businessUnitId: "",
    userId: "",
    role: "PROJECT_MANAGER" as BusinessUnitRole,
  });

  async function loadBusinessUnits() {
    try {
      const data = await apiClient.get<BusinessUnit[]>(
        "/api/admin/business-units",
        "Не удалось загрузить бизнес-юниты",
      );
      setBusinessUnits(data);
      setMembershipDraft((current) => ({
        ...current,
        businessUnitId: current.businessUnitId || data[0]?.id || "",
      }));
      setBusinessUnitError("");
    } catch (error) {
      setBusinessUnitError(error instanceof Error ? error.message : "Не удалось загрузить бизнес-юниты");
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get<BusinessUnit[]>(
        "/api/admin/business-units",
        "Не удалось загрузить бизнес-юниты",
      ),
      apiClient.get<BusinessUnitDirectoryUser[]>(
        "/api/admin/business-unit-users",
        "Не удалось загрузить пользователей",
      ),
    ])
      .then(([data, directoryUsers]) => {
        if (cancelled) return;
        setBusinessUnits(data);
        setBusinessUnitUsers(directoryUsers);
        setMembershipDraft((current) => ({
          ...current,
          businessUnitId: current.businessUnitId || data[0]?.id || "",
        }));
        setBusinessUnitError("");
      })
      .catch((error) => {
        if (!cancelled) {
          setBusinessUnitError(error instanceof Error ? error.message : "Не удалось загрузить бизнес-юниты");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createBusinessUnit(event: FormEvent) {
    event.preventDefault();
    setCreatingUnit(true);
    try {
      await apiClient.post<BusinessUnit>(
        "/api/admin/business-units",
        unitDraft,
        "Не удалось создать бизнес-юнит",
      );
      setUnitDraft({ code: "", name: "" });
      window.dispatchEvent(new CustomEvent(BUSINESS_UNITS_CHANGED_EVENT));
      await loadBusinessUnits();
    } catch (error) {
      setBusinessUnitError(error instanceof Error ? error.message : "Не удалось создать бизнес-юнит");
    } finally {
      setCreatingUnit(false);
    }
  }

  async function saveMembership(event: FormEvent) {
    event.preventDefault();
    if (!membershipDraft.businessUnitId || !membershipDraft.userId) return;
    try {
      await apiClient.post(
        `/api/admin/business-units/${membershipDraft.businessUnitId}/memberships`,
        { userId: membershipDraft.userId, role: membershipDraft.role },
        "Не удалось назначить участника",
      );
      await loadBusinessUnits();
    } catch (error) {
      setBusinessUnitError(error instanceof Error ? error.message : "Не удалось назначить участника");
    }
  }

  const [userSearch, setUserSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
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
      <section className="business-unit-admin" aria-labelledby="business-unit-heading">
        <div className="business-unit-admin-heading">
          <div>
            <h3 id="business-unit-heading"><Building2 size={18} /> Бизнес-юниты</h3>
            <p>Контуры портфелей и роли команд. Индивидуальные доступы ниже остаются исключениями.</p>
          </div>
          {isAdminUser && <form className="business-unit-create" onSubmit={createBusinessUnit}>
            <input
              aria-label="Код бизнес-юнита"
              placeholder="Код, например retail"
              pattern="[a-z0-9-]+"
              value={unitDraft.code}
              onChange={(event) => setUnitDraft({ ...unitDraft, code: event.currentTarget.value })}
              required
            />
            <input
              aria-label="Название бизнес-юнита"
              placeholder="Название бизнес-юнита"
              value={unitDraft.name}
              onChange={(event) => setUnitDraft({ ...unitDraft, name: event.currentTarget.value })}
              required
            />
            <button type="submit" disabled={creatingUnit} title="Создать бизнес-юнит">
              <Plus size={16} /> Создать
            </button>
          </form>}
        </div>

        {businessUnitError && <p className="business-unit-error">{businessUnitError}</p>}

        <form className="business-unit-membership-form" onSubmit={saveMembership}>
          <select
            aria-label="Бизнес-юнит для назначения"
            value={membershipDraft.businessUnitId}
            onChange={(event) => setMembershipDraft({ ...membershipDraft, businessUnitId: event.currentTarget.value })}
          >
            {businessUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
          <select
            aria-label="Пользователь бизнес-юнита"
            value={membershipDraft.userId}
            onChange={(event) => setMembershipDraft({ ...membershipDraft, userId: event.currentTarget.value })}
            required
          >
            <option value="">Выберите пользователя</option>
            {businessUnitUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
          </select>
          <select
            aria-label="Роль в бизнес-юните"
            value={membershipDraft.role}
            onChange={(event) => setMembershipDraft({ ...membershipDraft, role: event.currentTarget.value as BusinessUnitRole })}
          >
            {Object.entries(businessUnitRoleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
          </select>
          <button type="submit">Назначить</button>
        </form>

        <div className="business-unit-list">
          {businessUnits.map((unit) => (
            <div className="business-unit-row" key={unit.id}>
              <div className="business-unit-name">
                <b>{unit.name}</b>
                <small>{unit.code} · проектов: {unit._count.projects}{unit.isDefault ? " · основной" : ""}</small>
              </div>
              <div className="business-unit-members">
                {unit.memberships.map((membership) => (
                  <span className="business-unit-member" key={membership.id}>
                    <span><b>{membership.user.name}</b><small>{businessUnitRoleLabels[membership.role]}</small></span>
                    <button
                      type="button"
                      className="ghost-button icon-button"
                      aria-label={`Удалить ${membership.user.name} из бизнес-юнита`}
                      onClick={async () => {
                        if (await confirm({
                          title: "Отозвать участие?",
                          message: `${membership.user.name} потеряет доступ к портфелю «${unit.name}».`,
                          confirmLabel: "Отозвать",
                        })) {
                          try {
                            await apiClient.delete(`/api/admin/business-unit-memberships/${membership.id}`, "Не удалось отозвать участие");
                            await loadBusinessUnits();
                          } catch (error) {
                            setBusinessUnitError(error instanceof Error ? error.message : "Не удалось отозвать участие");
                          }
                        }
                      }}
                    ><Trash2 size={15} /></button>
                  </span>
                ))}
                {unit.memberships.length === 0 && <small>Участников пока нет</small>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {isAdminUser && <>
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
              {(["VIEW", "EDIT", "ADMIN"] as ProjectAccessLevel[]).map((level) => (
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
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Удалить доступ?",
                      message: "Пользователь потеряет доступ к проекту.",
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
      </>}
    </article>
  );
}
