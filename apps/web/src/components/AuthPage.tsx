import { KeyRound } from "lucide-react";

type AuthPageProps = {
  error: string | null;
  keycloakEnabled: boolean;
  keycloakStatusResolved: boolean;
  onKeycloakLogin: () => void;
};

export function AuthPage({
  error,
  keycloakEnabled,
  keycloakStatusResolved,
  onKeycloakLogin,
}: AuthPageProps) {
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
            <h1>Вход в систему</h1>
            <p>Используйте корпоративную учётную запись</p>
          </div>
        </div>
        {error && (
          <div className="auth-error">
            <strong>Ошибка</strong>
            <span>{error}</span>
          </div>
        )}
        <div className="auth-form">
          <button type="button" disabled={!keycloakEnabled} onClick={onKeycloakLogin}>
            Войти через SSO
          </button>
          {keycloakStatusResolved && !keycloakEnabled && (
            <div className="auth-error">
              <strong>Вход недоступен</strong>
              <span>Keycloak не настроен. Обратитесь к администратору.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
