import { useI18n } from "../i18n/I18nProvider";
import { ClipboardCheck, KeyRound, LogOut, Users } from "lucide-react";


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
  const { t } = useI18n();
  return (
    <>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <ClipboardCheck size={20} />
        </span>
        <span className="brand-text">
          <b>{t("auth.product")}</b>
        </span>
      </div>
      <div className="sidebar-user">
        <span className="sidebar-user-icon" aria-hidden="true">
          <Users size={16} />
        </span>
        <span className="sidebar-user-text">
          <b>{currentUser?.name ?? t("identity.readonly")}</b>
          <small>
            {currentUser
              ? t(currentUser.role === "ADMIN" ? "identity.admin" : "identity.user")
              : t("identity.loginRequired")}
          </small>
        </span>
        <button
          type="button"
          onClick={currentUser ? onLogout : onLogin}
          aria-label={currentUser ? t("auth.logout") : t("auth.login")}
          title={currentUser ? t("auth.logout") : t("identity.loginRequired")}
        >
          {currentUser ? <LogOut size={15} /> : <KeyRound size={15} />}
        </button>
      </div>
    </>
  );
}
