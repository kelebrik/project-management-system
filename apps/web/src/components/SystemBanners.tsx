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
        aria-label="Закрыть уведомление"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={14} />
      </button>
      <strong>{toast.tone === "error" ? "Ошибка" : "Готово"}</strong>
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
          <span>Только просмотр. Войдите, чтобы редактировать данные.</span>
          <button type="button" onClick={onLogin}>
            Войти
          </button>
        </div>
      )}
      {isClosedProject && (
        <div className="readonly-banner closed-project-banner">
          <Archive size={16} />
          <span>
            Проект закрыт. Данные доступны только для чтения, редактирование
            заблокировано для всех ролей.
          </span>
        </div>
      )}
    </>
  );
}
