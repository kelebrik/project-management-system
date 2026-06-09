import { KeyRound } from "lucide-react";
import type { FormEvent } from "react";
import type { AuthFormState, AuthMode } from "../app/adminTypes";

type AuthPageProps = {
  authForm: AuthFormState;
  authMode: Extract<AuthMode, "setup" | "login">;
  error: string | null;
  onContinueReadOnly: () => void;
  onFormChange: (form: AuthFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
};

export function AuthPage({
  authForm,
  authMode,
  error,
  onContinueReadOnly,
  onFormChange,
  onSubmit,
  submitting,
}: AuthPageProps) {
  const isSetup = authMode === "setup";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="logo">УП</div>
          <div>
            <strong>Система УП</strong>
            <span>Контур управления</span>
          </div>
        </div>
        <div className="auth-title">
          <KeyRound size={22} />
          <div>
            <h1>{isSetup ? "Первичная настройка" : "Вход в систему"}</h1>
            <p>
              {isSetup
                ? "Создайте первого администратора системы"
                : "Введите email и пароль пользователя"}
            </p>
          </div>
        </div>
        {error && (
          <div className="auth-error">
            <strong>Ошибка</strong>
            <span>{error}</span>
          </div>
        )}
        <form className="auth-form" onSubmit={onSubmit}>
          {isSetup && (
            <label>
              Имя администратора
              <input
                value={authForm.name}
                onChange={(event) =>
                  onFormChange({ ...authForm, name: event.target.value })
                }
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={authForm.email}
              onChange={(event) =>
                onFormChange({ ...authForm, email: event.target.value })
              }
              autoComplete="email"
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={authForm.password}
              onChange={(event) =>
                onFormChange({ ...authForm, password: event.target.value })
              }
              autoComplete={isSetup ? "new-password" : "current-password"}
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting
              ? "Проверяю..."
              : isSetup
                ? "Создать администратора"
                : "Войти"}
          </button>
          {authMode === "login" && (
            <button
              type="button"
              className="secondary"
              onClick={onContinueReadOnly}
            >
              Продолжить только просмотр
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
