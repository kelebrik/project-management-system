import type { RolePermission, UserRole } from "../app/adminTypes";
import { usePageContext } from "./PageContext";

const businessUnitRoles = [
  { role: "Администратор бизнес-юнита", permissions: [true, true, true, true] },
  { role: "Руководитель проектов", permissions: [true, true, false, false] },
  { role: "Наблюдатель", permissions: [true, false, false, false] },
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

  return (
    <article className="panel project-card admin-roles-page">
      <section className="admin-role-section business-unit-role-section" aria-labelledby="business-unit-role-heading">
        <div className="admin-role-section-heading">
          <div>
            <h2 id="business-unit-role-heading">Роли бизнес-юнита</h2>
            <p>Действуют только внутри бизнес-юнита, в котором пользователю назначена роль.</p>
          </div>
        </div>
        <div className="permission-table business-unit-permission-table">
          <div className="permission-head">
            <span>Роль</span>
            <span>Просмотр всех проектов</span>
            <span>Создание проектов</span>
            <span>Администрирование всех проектов</span>
            <span>Управление участниками</span>
          </div>
          {businessUnitRoles.map((item) => (
            <div className="permission-row" key={item.role}>
              <strong>{item.role}</strong>
              {item.permissions.map((enabled, index) => (
                <label className="permission-toggle" key={`${item.role}-${index}`}>
                  <input type="checkbox" checked={enabled} disabled aria-label={enabled ? "Разрешено" : "Запрещено"} />
                </label>
              ))}
            </div>
          ))}
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
