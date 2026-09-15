import { useI18n } from "../i18n/I18nProvider";
import type { RolePermission, UserRole } from "../app/adminTypes";
import { usePageContext } from "./PageContext";

export function AdminRolesPageContent() {
  const { t } = useI18n();
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
            <h2 id="system-role-heading">{t("admin.roles.title")}</h2>
            <p>{t("admin.roles.description")}</p>
          </div>
          <button type="button" onClick={() => void reloadAdminConfig()}>
            {t("admin.refresh")}
          </button>
        </div>
        <div className="permission-table">
          <div className="permission-head">
            <span>{t("admin.roles.permission")}</span>
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
                        title={isFixedUserPermission ? t("admin.roles.fixed") : undefined}
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
