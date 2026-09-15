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

const AUTO_DISMISS_MS: Record<Toast["tone"], number> = {
  success: 4500,
  error: 8000,
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
    const timeoutId = window.setTimeout(
      () => onDismiss(toast.id),
      AUTO_DISMISS_MS[toast.tone],
    );
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
      <strong>{toast.tone === "error" ? t("feedback.error") : t("feedback.done")}</strong>
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
