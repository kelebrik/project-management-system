import { useI18n } from "../i18n/I18nProvider";
import { useEffect } from "react";
import { Archive, KeyRound, X } from "lucide-react";
import type { Toast } from "../hooks/useAppFeedbackState";

type SystemBannersProps = {
  toasts: Toast[];
  isAuthenticated: boolean;
  isClosedProject: boolean;
  onDismissToast: (id: number) => void;
  onLogin: () => void;
};

/** How long a toast stays; an error stays until it is closed or the next attempt succeeds. */
const AUTO_DISMISS_MS: Record<Toast["tone"], number | null> = {
  success: 4500,
  error: null,
  // Warnings explain something unexpected and take longer to read.
  warning: 12000,
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const after = AUTO_DISMISS_MS[toast.tone];
    if (after === null) return;
    const timeoutId = window.setTimeout(() => onDismiss(toast.id), after);
    return () => window.clearTimeout(timeoutId);
  }, [toast.id, toast.tone, onDismiss]);

  return (
    <div className={`toast ${toast.tone}`} role="status">
      <button
        type="button"
        aria-label={t("feedback.dismiss")}
        onClick={() => onDismiss(toast.id)}
      >
        <X size={14} />
      </button>
      <strong>
        {toast.tone === "error" ? t("feedback.error") : toast.tone === "warning" ? t("feedback.warning") : t("feedback.done")}
      </strong>
      <p>{toast.message}</p>
    </div>
  );
}

export function SystemBanners({
  toasts,
  isAuthenticated,
  isClosedProject,
  onDismissToast,
  onLogin,
}: SystemBannersProps) {
  const { t } = useI18n();
  return (
    <>
      <div
        className="toast-stack"
        aria-live="assertive"
        aria-atomic="false"
        role="log"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismissToast} />
        ))}
      </div>
      {!isAuthenticated && (
        <div className="readonly-banner main-readonly-banner">
          <KeyRound size={16} />
          <span>{t("feedback.readonly")}</span>
          <button type="button" onClick={onLogin}>
            {t("auth.login")}
          </button>
        </div>
      )}
      {isClosedProject && (
        <div className="readonly-banner closed-project-banner">
          <Archive size={16} />
          <span>
            {t("feedback.closed")}
          </span>
        </div>
      )}
    </>
  );
}
