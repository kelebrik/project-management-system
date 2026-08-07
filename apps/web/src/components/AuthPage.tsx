import { ClipboardCheck, KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";

type AuthPageProps = {
  error: string | null;
  keycloakEnabled: boolean;
  onKeycloakLogin: () => void;
  onPasswordLogin: (email: string, password: string) => Promise<void>;
};

export function AuthPage({
  error,
  keycloakEnabled,
  onKeycloakLogin,
  onPasswordLogin,
}: AuthPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submitPasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onPasswordLogin(email, password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="logo" aria-hidden="true">
            <ClipboardCheck size={22} />
          </div>
          <div className="brand-text">
            <b>Управление проектами</b>
          </div>
        </div>
        <div className="auth-title">
          <KeyRound size={22} />
          <div>
            <h1>Вход в систему</h1>
            <p>Введите email и пароль пользователя</p>
          </div>
        </div>
        {error && (
          <div className="auth-error">
            <strong>Ошибка</strong>
            <span>{error}</span>
          </div>
        )}
        <form className="auth-form" onSubmit={submitPasswordLogin}>
          {keycloakEnabled && (
            <>
              <button type="button" onClick={onKeycloakLogin}>
                Войти через SSO
              </button>
              <div className="auth-divider">или</div>
            </>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? "Проверяю..." : "Войти"}
          </button>
        </form>
      </section>
    </main>
  );
}
