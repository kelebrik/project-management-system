import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/client";
import { useI18n } from "../../i18n/I18nProvider";

type Answer = { catalog: Array<{ id: string; name: string }>; selected: string[]; known: { epicLinkFieldId: string | null; storyPointsFieldId: string | null }; max: number };

/**
 * Up to ten extra Jira fields kept with each issue of the project, picked by
 * a system administrator from the fields Jira's answers have named. They are
 * read from the next sync on.
 */
export function JiraExtraFieldsPanel({ projectId, revision }: { projectId: string; revision: number }) {
  const { t } = useI18n();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "done" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    apiClient
      .get<Answer>(`/api/projects/${projectId}/jira/extra-fields`, t("ui.jiraFields.failed"))
      .then((next) => {
        if (!alive) return;
        setAnswer(next);
        setChosen(next.selected);
      })
      .catch((failure) => alive && setMessage({ tone: "error", text: failure instanceof Error ? failure.message : t("ui.jiraFields.failed") }));
    return () => {
      alive = false;
    };
  }, [projectId, revision, t]);

  const names = useMemo(() => new Map((answer?.catalog ?? []).map((field) => [field.id, field.name])), [answer]);
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (answer?.catalog ?? []).filter((field) => !chosen.includes(field.id) && (!needle || `${field.name} ${field.id}`.toLocaleLowerCase().includes(needle))).slice(0, 30);
  }, [answer, chosen, query]);
  if (!answer) return message ? <p className="automation-error">{message.text}</p> : null;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await apiClient.put(`/api/projects/${projectId}/jira/extra-fields`, { fieldIds: chosen }, t("ui.jiraFields.failed"));
      setAnswer({ ...answer, selected: chosen });
      setMessage({ tone: "done", text: t("ui.jiraFields.saved") });
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : t("ui.jiraFields.failed") });
    } finally {
      setBusy(false);
    }
  };
  const changed = chosen.join("|") !== answer.selected.join("|");
  return (
    <section className="panel jira-extra-fields">
      <h3>{t("ui.jiraFields.title")}</h3>
      <p className="wbs-table-hint">{t("ui.jiraFields.hint", { max: answer.max })}</p>
      <p className="wbs-table-hint">
        {t("ui.jiraFields.known", {
          epic: answer.known.epicLinkFieldId ? `${names.get(answer.known.epicLinkFieldId) ?? ""} (${answer.known.epicLinkFieldId})` : t("ui.jiraFields.notFound"),
          points: answer.known.storyPointsFieldId ? `${names.get(answer.known.storyPointsFieldId) ?? ""} (${answer.known.storyPointsFieldId})` : t("ui.jiraFields.notFound"),
        })}
      </p>
      {answer.catalog.length === 0 ? (
        <p>{t("ui.jiraFields.emptyCatalog")}</p>
      ) : (
        <>
          <ul className="jira-extra-fields-chosen">
            {chosen.map((id) => (
              <li key={id}>
                {names.get(id) ?? id} <small>{id}</small>
                <button aria-label={t("ui.jiraFields.remove", { name: names.get(id) ?? id })} disabled={busy} onClick={() => setChosen((current) => current.filter((value) => value !== id))} type="button">
                  ×
                </button>
              </li>
            ))}
          </ul>
          {chosen.length < answer.max && (
            <>
              <input aria-label={t("ui.jiraFields.search")} disabled={busy} onChange={(event) => setQuery(event.target.value)} placeholder={t("ui.jiraFields.search")} value={query} />
              <ul className="jira-extra-fields-options">
                {shown.map((field) => (
                  <li key={field.id}>
                    <button disabled={busy} onClick={() => setChosen((current) => [...current, field.id])} type="button">
                      {field.name} <small>{field.id}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className="primary" disabled={busy || !changed} onClick={() => void save()} type="button">
            {t("ui.jiraFields.save")}
          </button>
        </>
      )}
      {message && <p className={message.tone === "error" ? "automation-error" : "wbs-table-hint"} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}
    </section>
  );
}
