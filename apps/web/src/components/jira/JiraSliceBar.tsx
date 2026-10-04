import { JIRA_EMPTY_SLICE, JIRA_SLICE_FIELDS, jiraSliceIsEmpty, type JiraAnalyticsSlice, type JiraSliceField } from "@pms/shared";
import { Link2, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import type { useJiraSlice } from "../../hooks/useJiraSlice";
import { useI18n } from "../../i18n/I18nProvider";

type Facets = { values?: Record<JiraSliceField, { values: Array<{ value: string; count: number }>; truncated: boolean }> };
type SliceState = ReturnType<typeof useJiraSlice>;

/** One field of the bar: the values the project's issues have, any of which may be picked. */
function FieldPicker({ field, chosen, options, onChange }: { field: JiraSliceField; chosen: string[]; options: Array<{ value: string; count: number }>; onChange: (next: string[]) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const label = (value: string) => (value === "" ? t("ui.jiraSlice.notSet") : field === "statusCategories" ? t(`ui.jiraSlice.category.${value as "new" | "indeterminate" | "done"}`) : value);
  const needle = query.trim().toLocaleLowerCase();
  const shown = options.filter((option) => !needle || label(option.value).toLocaleLowerCase().includes(needle));
  const toggle = (value: string) => onChange(chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value]);
  return (
    <details className={`jira-slice-field${chosen.length > 0 ? " active" : ""}`}>
      <summary>
        {t(`ui.jiraSlice.field.${field}`)}
        {chosen.length > 0 ? `: ${chosen.length === 1 ? label(chosen[0]) : chosen.length}` : ""}
      </summary>
      <div className="jira-slice-menu">
        {options.length > 10 && <input aria-label={t("ui.jiraSlice.find")} onChange={(event) => setQuery(event.target.value)} placeholder={t("ui.jiraSlice.find")} value={query} />}
        {shown.length === 0 && <span className="wbs-table-hint">{t("ui.jiraSlice.noValues")}</span>}
        {shown.map((option) => (
          <label key={option.value}>
            <input checked={chosen.includes(option.value)} onChange={() => toggle(option.value)} type="checkbox" />
            <span>{label(option.value)}</span>
            <small>{option.count}</small>
          </label>
        ))}
        {chosen.length > 0 && (
          <button className="link-button" onClick={() => onChange([])} type="button">
            {t("ui.jiraSlice.clearField")}
          </button>
        )}
      </div>
    </details>
  );
}

/**
 * The bar above all widgets of «Jira work»: filters every widget counts by,
 * saved slices (personal or for everyone) and a link that opens the same view.
 */
export function JiraSliceBar({ projectId, state, revision, userId, isAdmin }: { projectId: string; state: SliceState; revision: number; userId: string | null; isAdmin: boolean }) {
  const { t } = useI18n();
  const [facets, setFacets] = useState<Facets | null>(null);
  const [saving, setSaving] = useState<{ name: string; shared: boolean } | null>(null);
  const [message, setMessage] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const { slice, setSlice, saved, activeId } = state;

  useEffect(() => {
    let alive = true;
    apiClient
      .get<Facets>(`/api/projects/${projectId}/jira/analytics-facets`)
      .then((next) => alive && setFacets(next))
      .catch(() => alive && setFacets(null));
    return () => {
      alive = false;
    };
  }, [projectId, revision]);

  const change = (field: JiraSliceField, values: string[]) => setSlice({ ...slice, [field]: values } as JiraAnalyticsSlice);
  const run = async (action: () => Promise<unknown>, done: string) => {
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "done", text: done });
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : t("ui.jiraSlice.failed") });
    }
  };
  const copyLink = () =>
    run(async () => {
      await navigator.clipboard.writeText(state.link());
    }, t("ui.jiraSlice.linkCopied"));

  return (
    <div className="jira-slice-bar" role="group" aria-label={t("ui.jiraSlice.title")}>
      {saved.length > 0 && (
        <select aria-label={t("ui.jiraSlice.saved")} onChange={(event) => {
          const view = saved.find((entry) => entry.id === event.target.value);
          setSlice(view ? view.slice : JIRA_EMPTY_SLICE, view?.id ?? null);
        }} value={activeId ?? ""}>
          <option value="">{t("ui.jiraSlice.savedNone")}</option>
          {saved.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
              {view.isShared ? ` · ${t("ui.jiraSlice.sharedMark")}` : ""}
            </option>
          ))}
        </select>
      )}
      {JIRA_SLICE_FIELDS.map((field) => (
        <FieldPicker chosen={slice[field] as string[]} field={field} key={field} onChange={(values) => change(field, values)} options={facets?.values?.[field]?.values ?? (slice[field] as string[]).map((value) => ({ value, count: 0 }))} />
      ))}
      {!jiraSliceIsEmpty(slice) && (
        <button className="secondary-button" onClick={() => setSlice(JIRA_EMPTY_SLICE)} type="button">
          <X size={16} /> {t("ui.jiraSlice.reset")}
        </button>
      )}
      <button className="secondary-button" onClick={() => void copyLink()} title={t("ui.jiraSlice.copyLink")} type="button">
        <Link2 size={16} /> {t("ui.jiraSlice.copyLink")}
      </button>
      {!jiraSliceIsEmpty(slice) && !activeId && !saving && (
        <button className="secondary-button" onClick={() => setSaving({ name: "", shared: false })} type="button">
          <Save size={16} /> {t("ui.jiraSlice.save")}
        </button>
      )}
      {activeId && (isAdmin || saved.find((view) => view.id === activeId)?.ownerId === userId) && (
        <button aria-label={t("ui.jiraSlice.delete")} className="icon-button danger" onClick={() => void run(() => state.remove(activeId), t("ui.jiraSlice.deleted"))} title={t("ui.jiraSlice.delete")} type="button">
          <Trash2 size={16} />
        </button>
      )}
      {saving && (
        <form className="jira-slice-save" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await state.save(saving.name.trim(), saving.shared);
            setSaving(null);
          }, t("ui.jiraSlice.savedDone"));
        }}>
          <input aria-label={t("ui.jiraSlice.name")} autoFocus maxLength={120} onChange={(event) => setSaving({ ...saving, name: event.target.value })} placeholder={t("ui.jiraSlice.name")} value={saving.name} />
          <label>
            <input checked={saving.shared} onChange={(event) => setSaving({ ...saving, shared: event.target.checked })} type="checkbox" />
            {t("ui.jiraSlice.forEveryone")}
          </label>
          <button className="primary-button" disabled={!saving.name.trim()} type="submit">{t("ui.jiraSlice.saveConfirm")}</button>
          <button className="secondary-button" onClick={() => setSaving(null)} type="button">{t("ui.jiraSlice.cancel")}</button>
        </form>
      )}
      {state.linkUnavailable && <span className="automation-warning">{t("ui.jiraSlice.linkUnavailable")}</span>}
      {message && <span className={message.tone === "error" ? "automation-error" : "wbs-table-hint"} role={message.tone === "error" ? "alert" : "status"}>{message.text}</span>}
    </div>
  );
}
