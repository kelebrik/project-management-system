import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import type { RolePermission, UserRole } from "../app/adminTypes";
import { usePageContext } from "./PageContext";

type BusinessUnitRole = "ADMIN" | "PROJECT_MANAGER" | "VIEWER";
type BusinessUnitPermissionName =
  | "PROJECT_VIEW"
  | "PROJECT_CREATE"
  | "PROJECT_ADMIN"
  | "MEMBERS_MANAGE";

type BusinessUnitRolePermission = {
  id: string;
  role: BusinessUnitRole;
  permission: BusinessUnitPermissionName;
  enabled: boolean;
};

const businessUnitRoles: Array<{ role: BusinessUnitRole; label: string }> = [
  { role: "ADMIN", label: "Администратор бизнес-юнита" },
  { role: "PROJECT_MANAGER", label: "Руководитель проектов" },
  { role: "VIEWER", label: "Наблюдатель" },
];

const businessUnitPermissions: Array<{ permission: BusinessUnitPermissionName; label: string }> = [
  { permission: "PROJECT_VIEW", label: "Просмотр всех проектов" },
  { permission: "PROJECT_CREATE", label: "Создание проектов" },
  { permission: "PROJECT_ADMIN", label: "Администрирование всех проектов" },
  { permission: "MEMBERS_MANAGE", label: "Управление участниками" },
];

export function AdminRolesPageContent() {
  const {
    adminPermissionLabel,
    adminPermissionOrder,
    reloadAdminConfig,
    rolePermissions,
    savingRolePermissionId,
    toggleRolePermission,
    userRoleLabel,
  } = usePageContext();
  const [businessUnitRolePermissions, setBusinessUnitRolePermissions] = useState<BusinessUnitRolePermission[]>([]);
  const [savingBusinessUnitPermissionId, setSavingBusinessUnitPermissionId] = useState<string | null>(null);
  const [businessUnitPermissionError, setBusinessUnitPermissionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<BusinessUnitRolePermission[]>(
        "/api/admin/business-unit-role-permissions",
        "Не удалось загрузить права ролей бизнес-юнита",
      )
      .then((permissions) => {
        if (!cancelled) setBusinessUnitRolePermissions(permissions);
      })
      .catch((error) => {
        if (!cancelled) {
          setBusinessUnitPermissionError(error instanceof Error ? error.message : "Не удалось загрузить права ролей бизнес-юнита");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleBusinessUnitPermission(permission: BusinessUnitRolePermission) {
    setSavingBusinessUnitPermissionId(permission.id);
    setBusinessUnitPermissionError("");
    try {
      const updated = await apiClient.patch<BusinessUnitRolePermission>(
        `/api/admin/business-unit-role-permissions/${permission.id}`,
        { enabled: !permission.enabled },
        "Не удалось обновить право роли бизнес-юнита",
      );
      setBusinessUnitRolePermissions((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      setBusinessUnitPermissionError(error instanceof Error ? error.message : "Не удалось обновить право роли бизнес-юнита");
    } finally {
      setSavingBusinessUnitPermissionId(null);
    }
  }

  return (
    <article className="panel project-card admin-roles-page">
      <section className="admin-role-section business-unit-role-section" aria-labelledby="business-unit-role-heading">
        <div className="admin-role-section-heading">
          <div>
            <h2 id="business-unit-role-heading">Роли бизнес-юнита</h2>
            <p>Действуют только внутри бизнес-юнита, в котором пользователю назначена роль.</p>
          </div>
        </div>
        {businessUnitPermissionError && <p className="business-unit-error">{businessUnitPermissionError}</p>}
        <div className="permission-table business-unit-permission-table">
          <div className="permission-head">
            <span>Роль</span>
            {businessUnitPermissions.map((item) => <span key={item.permission}>{item.label}</span>)}
          </div>
          {businessUnitRoles.map((role) => {
            const permissionsByName = new Map(
              businessUnitRolePermissions
                .filter((item) => item.role === role.role)
                .map((item) => [item.permission, item]),
            );
            return (
              <div className="permission-row" key={role.role}>
                <strong>{role.label}</strong>
                {businessUnitPermissions.map((item) => {
                  const permission = permissionsByName.get(item.permission);
                  return (
                    <label className="permission-toggle" key={item.permission}>
                      <input
                        type="checkbox"
                        checked={permission?.enabled ?? false}
                        disabled={!permission || savingBusinessUnitPermissionId === permission.id}
                        aria-label={`${role.label}: ${item.label}`}
                        onChange={() => permission && void toggleBusinessUnitPermission(permission)}
                      />
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      <section className="admin-role-section" aria-labelledby="system-role-heading">
        <div className="admin-role-section-heading">
          <div>
            <h2 id="system-role-heading">Системные роли</h2>
            <p>Действуют во всей системе независимо от выбранного бизнес-юнита.</p>
          </div>
          <button type="button" onClick={() => void reloadAdminConfig()}>
            Обновить
          </button>
        </div>
        <div className="permission-table">
          <div className="permission-head">
            <span>Право</span>
            <span>{userRoleLabel("ADMIN")}</span>
            <span>{userRoleLabel("PROJECT_MANAGER")}</span>
            <span>{userRoleLabel("EXECUTIVE_VIEWER")}</span>
          </div>
          {adminPermissionOrder.map((permissionName: string) => {
            const permissionsByRole = new Map<UserRole, RolePermission>(
              (rolePermissions as RolePermission[])
                .filter((item) => item.permission === permissionName)
                .map((item) => [item.role, item]),
            );
            return (
              <div className="permission-row" key={permissionName}>
                <strong>{adminPermissionLabel(permissionName)}</strong>
                {(["ADMIN", "PROJECT_MANAGER", "EXECUTIVE_VIEWER"] as UserRole[]).map((role) => {
                  const permission = permissionsByRole.get(role);
                  return (
                    <label className="permission-toggle" key={role}>
                      <input
                        type="checkbox"
                        checked={permission?.enabled ?? false}
                        disabled={role === "ADMIN" || !permission || savingRolePermissionId === permission.id}
                        onChange={() => permission && void toggleRolePermission(permission)}
                      />
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>
    </article>
  );
}
