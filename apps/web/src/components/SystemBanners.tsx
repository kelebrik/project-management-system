import { Archive, KeyRound } from "lucide-react";

type SystemBannersProps = {
  error: string | null;
  isAuthenticated: boolean;
  isClosedProject: boolean;
  notice: string | null;
  onErrorDismiss: () => void;
  onLogin: () => void;
  onNoticeDismiss: () => void;
};

export function SystemBanners({
  error,
  isAuthenticated,
  isClosedProject,
  notice,
  onErrorDismiss,
  onLogin,
  onNoticeDismiss,
}: SystemBannersProps) {
  return (
    <>
      <div className="toast-stack" aria-live="polite">
        {error && (
          <div className="toast error">
            <button
              type="button"
              aria-label="Закрыть уведомление об ошибке"
              onClick={onErrorDismiss}
            >
              x
            </button>
            <strong>Ошибка</strong>
            <p>{error}</p>
          </div>
        )}
        {notice && (
          <div className="toast success">
            <button
              type="button"
              aria-label="Закрыть уведомление"
              onClick={onNoticeDismiss}
            >
              x
            </button>
            <strong>Готово</strong>
            <p>{notice}</p>
          </div>
        )}
      </div>
      {!isAuthenticated && (
        <div className="readonly-banner">
          <KeyRound size={16} />
          <span>
            Режим только для просмотра. Для создания и изменения данных нужно
            войти в систему.
          </span>
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
