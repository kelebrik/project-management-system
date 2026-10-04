import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import { useI18n } from "../../i18n/I18nProvider";

type JiraTask = { key: string; url: string; summary: string; status: string; statusCategory: string | null; priority: string; issueType: string; updatedAt: string };
type Answer = {
  login: string;
  defaultLogin: string;
  customLogin: boolean;
  status: "OK" | "NOT_CONFIGURED" | "NO_LOGIN" | "FAILED";
  groups: Array<{ project: { id: string; code: string; name: string }; tasks: JiraTask[] }>;
  truncated?: boolean;
};

/**
 * Open Jira issues assigned to the user and labelled for a project they may
 * read, by project. Jira is only read, through the server; the login is the
 * part of the e-mail before @ unless the user sets another one here.
 */
export function MyJiraTasks() {
  const { t, formatters } = useI18n();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiClient
      .get<Answer>("/api/my-work/jira", t("ui.myJira.failed"))
      .then(setAnswer)
      .catch((failure) => setError(failure instanceof Error ? failure.message : t("ui.myJira.failed")));
  }, [t]);
  useEffect(load, [load]);

  const saveLogin = async (value: string | null) => {
    setBusy(true);
    setError("");
    try {
      await apiClient.put("/api/my-work/jira-login", { login: value }, t("ui.myJira.loginFailed"));
      setEditing(false);
      setAnswer(null);
      load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.myJira.loginFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!answer) return error ? <p className="automation-error">{error}</p> : <p className="my-work-hint">{t("ui.myJira.loading")}</p>;
  const count = answer.groups.reduce((sum, group) => sum + group.tasks.length, 0);
  return (
    <>
      <div className="my-jira-login">
        {editing ? (
          <>
            <input aria-label={t("ui.myJira.login")} disabled={busy} maxLength={100} onChange={(event) => setLogin(event.target.value)} placeholder={answer.defaultLogin} value={login} />
            <button className="primary" disabled={busy} onClick={() => void saveLogin(login.trim() || null)} type="button">
              {t("ui.myJira.save")}
            </button>
            <button disabled={busy} onClick={() => setEditing(false)} type="button">
              {t("ui.myJira.cancel")}
            </button>
          </>
        ) : (
          <>
            <span className="my-work-hint">{t(answer.customLogin ? "ui.myJira.loginCustom" : "ui.myJira.loginDefault", { login: answer.login || "—" })}</span>
            <button className="link-button" onClick={() => (setLogin(answer.customLogin ? answer.login : ""), setEditing(true))} type="button">
              {t("ui.myJira.change")}
            </button>
            {answer.customLogin && (
              <button className="link-button" disabled={busy} onClick={() => void saveLogin(null)} type="button">
                {t("ui.myJira.reset", { login: answer.defaultLogin })}
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="automation-error">{error}</p>}
      {answer.status === "NOT_CONFIGURED" && <p className="my-work-hint">{t("ui.myJira.notConfigured")}</p>}
      {answer.status === "NO_LOGIN" && <p className="my-work-hint">{t("ui.myJira.noLogin")}</p>}
      {answer.status === "FAILED" && (
        <p className="automation-error">
          {t("ui.myJira.searchFailed")}{" "}
          <button className="link-button" onClick={() => (setError(""), load())} type="button">
            {t("ui.myJira.retry")}
          </button>
        </p>
      )}
      {answer.status === "OK" && count === 0 && <p>{t("ui.myJira.none")}</p>}
      {answer.truncated && <p className="my-work-hint">{t("ui.myJira.truncated")}</p>}
      {answer.groups.map((group) => (
        <section className="my-work-group" key={group.project.id}>
          <h3>
            {group.project.code} {group.project.name}
          </h3>
          <table className="my-work-team my-jira-table">
            <thead>
              <tr>
                <th>{t("ui.myJira.key")}</th>
                <th>{t("ui.myJira.summary")}</th>
                <th>{t("ui.myJira.status")}</th>
                <th>{t("ui.myJira.priority")}</th>
                <th>{t("ui.myJira.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {group.tasks.map((task) => (
                <tr key={task.key}>
                  <td>
                    <a href={task.url} rel="noreferrer" target="_blank">
                      {task.key}
                    </a>
                  </td>
                  <td>
                    {task.summary} <small>{task.issueType}</small>
                  </td>
                  <td>{task.status}</td>
                  <td>{task.priority}</td>
                  <td>{formatters.date(task.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
