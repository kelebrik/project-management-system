import { usePageContext } from "./PageContext";
import type { UserRole } from "../app/adminTypes";

export function AdminUsersPageContent() {
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
                        <h2>Администрирование: пользователи</h2>
                        <p>Базовые учетные записи, роли и доступ в систему</p>
                      </div>
                    </div>
                    {currentUser?.role === "ADMIN" ? (
                      <>
                        <form className="user-create-form" onSubmit={createUser}>
                          <label>
                            Имя
                            <input
                              value={newUserForm.name}
                              onChange={(event) =>
                                setNewUserForm({
                                  ...newUserForm,
                                  name: event.target.value,
                                })
                              }
                              placeholder="Иван Иванов"
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
                            Роль
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
                              <option value="PROJECT_MANAGER">
                                {userRoleLabel("PROJECT_MANAGER")}
                              </option>
                              <option value="TEAM_MEMBER">
                                {userRoleLabel("TEAM_MEMBER")}
                              </option>
                              <option value="EXECUTIVE_VIEWER">
                                {userRoleLabel("EXECUTIVE_VIEWER")}
                              </option>
                            </select>
                          </label>
                          <label>
                            Пароль
                            <input
                              type="password"
                              value={newUserForm.password}
                              onChange={(event) =>
                                setNewUserForm({
                                  ...newUserForm,
                                  password: event.target.value,
                                })
                              }
                              placeholder="Минимум 8 символов"
                            />
                          </label>
                          <button type="submit" disabled={creatingUser}>
                            {creatingUser ? "Создаю..." : "Создать пользователя"}
                          </button>
                        </form>
                        <div className="project-admin-table user-admin-table">
                          <div className="project-admin-head user-admin-head">
                            <span>Имя</span>
                            <span>Email</span>
                            <span>Роль</span>
                            <span>Активен</span>
                            <span>Последний вход</span>
                            <span>Новый пароль</span>
                            <span />
                          </div>
                          {users.map((user) => {
                            const draft = userDrafts[user.id] ?? userToDraft(user);
                            return (
                              <div className="project-admin-row user-admin-row" key={user.id}>
                                <label>
                                  <span>Имя</span>
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
                                  <span>Роль</span>
                                  <select
                                    value={draft.role}
                                    onChange={(event) =>
                                      updateUserDraft(user.id, {
                                        role: event.target.value as UserRole,
                                      })
                                    }
                                  >
                                    <option value="ADMIN">{userRoleLabel("ADMIN")}</option>
                                    <option value="PROJECT_MANAGER">
                                      {userRoleLabel("PROJECT_MANAGER")}
                                    </option>
                                    <option value="TEAM_MEMBER">
                                      {userRoleLabel("TEAM_MEMBER")}
                                    </option>
                                    <option value="EXECUTIVE_VIEWER">
                                      {userRoleLabel("EXECUTIVE_VIEWER")}
                                    </option>
                                  </select>
                                </label>
                                <label className="checkbox-field">
                                  <span>Активен</span>
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
                                  <span>Последний вход</span>
                                  <b>{date(user.lastLoginAt)}</b>
                                </div>
                                <label>
                                  <span>Новый пароль</span>
                                  <input
                                    type="password"
                                    value={draft.password}
                                    onChange={(event) =>
                                      updateUserDraft(user.id, {
                                        password: event.target.value,
                                      })
                                    }
                                    placeholder={
                                      user.hasPassword ? "Не менять" : "Задать пароль"
                                    }
                                  />
                                </label>
                                <div className="project-admin-actions">
                                  <button
                                    type="button"
                                    onClick={() => void saveUser(user.id)}
                                    disabled={savingUserId === user.id}
                                  >
                                    {savingUserId === user.id
                                      ? "Сохраняю..."
                                      : "Сохранить"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {users.length === 0 && (
                            <div className="empty-state">
                              Пользователи еще не созданы.
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="empty-state">
                        Управление пользователями доступно только администратору.
                      </div>
                    )}
                  </article>
              );
}
