import type { RolePermission, UserRole } from "../app/adminTypes";
import { usePageContext } from "./PageContext";

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
      <section className="admin-role-section" aria-labelledby="system-role-heading">
        <div className="admin-role-section-heading">
          <div>
            <h2 id="system-role-heading">Системные роли</h2>
            <p>Две системные роли. Роль РП назначается правом редактирования конкретного проекта.</p>
          </div>
          <button type="button" onClick={() => void reloadAdminConfig()}>
            Обновить
          </button>
        </div>
        <div className="permission-table">
          <div className="permission-head">
            <span>Право</span>
            <span>{userRoleLabel("ADMIN")}</span>
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
                {(["ADMIN", "EXECUTIVE_VIEWER"] as UserRole[]).map((role) => {
                  const permission = permissionsByRole.get(role);
                  const isFixedUserPermission =
                    role === "EXECUTIVE_VIEWER" &&
                    (permissionName === "project.read" || permissionName === "project.create");
                  return (
                    <label className="permission-toggle" key={role}>
                      <input
                        type="checkbox"
                        checked={permission?.enabled ?? false}
                        disabled={
                          role === "ADMIN" ||
                          isFixedUserPermission ||
                          !permission ||
                          savingRolePermissionId === permission.id
                        }
                        title={isFixedUserPermission ? "Закреплено системной политикой" : undefined}
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
