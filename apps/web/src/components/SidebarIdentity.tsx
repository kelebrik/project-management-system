import { KeyRound, LogOut, Users } from "lucide-react";

import { userRoleLabel } from "../app/adminHelpers";
import type { CurrentUser } from "../app/adminTypes";

type SidebarIdentityProps = {
  currentUser: CurrentUser | null;
  onLogin: () => void;
  onLogout: () => void;
};

export function SidebarIdentity({
  currentUser,
  onLogin,
  onLogout,
}: SidebarIdentityProps) {
  return (
    <>
      <div className="brand">
        <span className="brand-mark">УП</span>
        <span className="brand-text">
          <b>Система УП</b>
          <small>Контур управления</small>
        </span>
      </div>
      <div className="sidebar-user">
        <span className="sidebar-user-icon" aria-hidden="true">
          <Users size={16} />
        </span>
        <span className="sidebar-user-text">
          <b>{currentUser?.name ?? "Только просмотр"}</b>
          <small>
            {currentUser
              ? userRoleLabel(currentUser.role)
              : "Вход нужен для редактирования"}
          </small>
        </span>
        <button
          type="button"
          onClick={currentUser ? onLogout : onLogin}
          aria-label={currentUser ? "Выйти" : "Войти"}
          title={currentUser ? "Выйти" : "Войти для редактирования"}
        >
          {currentUser ? <LogOut size={15} /> : <KeyRound size={15} />}
        </button>
      </div>
    </>
  );
}
