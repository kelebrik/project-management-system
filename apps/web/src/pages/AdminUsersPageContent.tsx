import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";
import type { UserRole } from "../app/adminTypes";

export function AdminUsersPageContent() {
  const { t } = useI18n();
  const ctx = usePageContext();
  const {
    createUser,
    creatingUser,
    currentUser,
    date,
    newUserForm,
    saveUser,
    savingUserId,
    setNewUserForm,
    updateUserDraft,
    userDrafts,
    userRoleLabel,
    users,
    userToDraft,
  } = ctx;

  return (
                  <article className="panel project-card">
                    <div className="panel-title">
                      <div>
                        <p>{t("admin.users.description")}</p>
                      </div>
                    </div>
                    {currentUser?.role === "ADMIN" ? (
                      <>
                        <form className="user-create-form" onSubmit={createUser}>
                          <label>
                            {t("admin.name")}
                            <input
                              value={newUserForm.name}
                              onChange={(event) =>
                                setNewUserForm({
                                  ...newUserForm,
                                  name: event.target.value,
                                })
                              }
                              placeholder={t("admin.users.placeholder")}
                            />
                          </label>
                          <label>
                            Email
                            <input
                              type="email"
                              value={newUserForm.email}
                              onChange={(event) =>
                                setNewUserForm({
                                  ...newUserForm,
                                  email: event.target.value,
                                })
                              }
                              placeholder="user@company.ru"
                            />
                          </label>
                          <label>
                            {t("admin.role")}
                            <select
                              value={newUserForm.role}
                              onChange={(event) =>
                                setNewUserForm({
                                  ...newUserForm,
                                  role: event.target.value as UserRole,
                                })
                              }
                            >
                              <option value="ADMIN">{userRoleLabel("ADMIN")}</option>
                              <option value="EXECUTIVE_VIEWER">
                                {userRoleLabel("EXECUTIVE_VIEWER")}
                              </option>
                            </select>
                          </label>
                          <button type="submit" disabled={creatingUser}>
                            {creatingUser ? t("admin.users.creating") : t("admin.users.create")}
                          </button>
                        </form>
                        <div className="project-admin-table user-admin-table">
                          <div className="project-admin-head user-admin-head">
                            <span>{t("admin.name")}</span>
                            <span>Email</span>
                            <span>{t("admin.role")}</span>
                            <span>{t("admin.active")}</span>
                            <span>{t("admin.users.lastLogin")}</span>
                            <span />
                          </div>
                          {users.map((user) => {
                            const draft = userDrafts[user.id] ?? userToDraft(user);
                            return (
                              <div className="project-admin-row user-admin-row" key={user.id}>
                                <label>
                                  <span>{t("admin.name")}</span>
                                  <input
                                    value={draft.name}
                                    onChange={(event) =>
                                      updateUserDraft(user.id, {
                                        name: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  <span>Email</span>
                                  <input
                                    type="email"
                                    value={draft.email}
                                    onChange={(event) =>
                                      updateUserDraft(user.id, {
                                        email: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  <span>{t("admin.role")}</span>
                                  <select
                                    value={draft.role}
                                    onChange={(event) =>
                                      updateUserDraft(user.id, {
                                        role: event.target.value as UserRole,
                                      })
                                    }
                                  >
                                    <option value="ADMIN">{userRoleLabel("ADMIN")}</option>
                                    <option value="EXECUTIVE_VIEWER">
                                      {userRoleLabel("EXECUTIVE_VIEWER")}
                                    </option>
                                  </select>
                                </label>
                                <label className="checkbox-field">
                                  <span>{t("admin.active")}</span>
                                  <input
                                    type="checkbox"
                                    checked={draft.isActive}
                                    onChange={(event) =>
                                      updateUserDraft(user.id, {
                                        isActive: event.target.checked,
                                      })
                                    }
                                  />
                                </label>
                                <div className="project-admin-readonly">
                                  <span>{t("admin.users.lastLogin")}</span>
                                  <b>{date(user.lastLoginAt)}</b>
                                </div>
                                <div className="project-admin-actions">
                                  <button
                                    type="button"
                                    onClick={() => void saveUser(user.id)}
                                    disabled={savingUserId === user.id}
                                  >
                                    {savingUserId === user.id
                                      ? t("fields.saving")
                                      : t("fields.save")}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {users.length === 0 && (
                            <div className="empty-state">
                              {t("admin.users.empty")}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="empty-state">
                        {t("admin.users.restricted")}
                      </div>
                    )}
                  </article>
              );
}
