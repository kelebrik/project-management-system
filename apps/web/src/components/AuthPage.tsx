import { ClipboardCheck, KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { LanguageToggle } from "./LanguageToggle";

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
  const { t } = useI18n();
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
      <div className="auth-language-toggle"><LanguageToggle sidebarCollapsed={false} /></div>
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="logo" aria-hidden="true">
            <ClipboardCheck size={22} />
          </div>
          <div className="brand-text">
            <b>{t("auth.product")}</b>
          </div>
        </div>
        <div className="auth-title">
          <KeyRound size={22} />
          <div>
            <h1>{t("auth.signIn")}</h1>
            <p>{t("auth.subtitle")}</p>
          </div>
        </div>
        {error && (
          <div className="auth-error">
            <strong>{t("auth.error")}</strong>
            <span>{error}</span>
          </div>
        )}
        <form className="auth-form" onSubmit={submitPasswordLogin}>
          {keycloakEnabled && (
            <>
              <button type="button" onClick={onKeycloakLogin}>
                {t("auth.sso")}
              </button>
              <div className="auth-divider">{t("auth.or")}</div>
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
            {t("auth.password")}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? t("auth.checking") : t("auth.login")}
          </button>
        </form>
      </section>
    </main>
  );
}
