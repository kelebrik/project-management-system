import { usePageContext } from "./PageContext";
import type { RolePermission, UserRole } from "../app/adminTypes";

export function AdminRolesPageContent() {
  const ctx = usePageContext();
  const {
    adminPermissionLabel,
    adminPermissionOrder,
    reloadAdminConfig,
    rolePermissions,
    savingRolePermissionId,
    toggleRolePermission,
    userRoleLabel,
  } = ctx;

  return (
                    <article className="panel project-card">
                      <div className="panel-title">
                        <div>
                          <h2>Администрирование: роли и права</h2>
                          <p>Матрица доступов по системным ролям</p>
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
                          <span>{userRoleLabel("TEAM_MEMBER")}</span>
                          <span>{userRoleLabel("EXECUTIVE_VIEWER")}</span>
                        </div>
                        {adminPermissionOrder.map((permissionName) => {
                          const permissionsByRole = new Map<UserRole, RolePermission>(
                            rolePermissions
                              .filter((item) => item.permission === permissionName)
                              .map((item) => [item.role, item]),
                          );
                          return (
                            <div className="permission-row" key={permissionName}>
                              <strong>{adminPermissionLabel(permissionName)}</strong>
                              {(
                                [
                                  "ADMIN",
                                  "PROJECT_MANAGER",
                                  "TEAM_MEMBER",
                                  "EXECUTIVE_VIEWER",
                                ] as UserRole[]
                              ).map((role) => {
                                const permission = permissionsByRole.get(role);
                                return (
                                  <label className="permission-toggle" key={role}>
                                    <input
                                      type="checkbox"
                                      checked={permission?.enabled ?? false}
                                      disabled={
                                        role === "ADMIN" ||
                                        !permission ||
                                        savingRolePermissionId === permission.id
                                      }
                                      onChange={() =>
                                        permission && void toggleRolePermission(permission)
                                      }
                                    />
                                  </label>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </article>
              );
}
