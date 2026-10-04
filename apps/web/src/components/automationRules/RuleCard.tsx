import { AUTOMATION_LIMITS, type AutomationTemplate } from "@pms/shared";
import type { SimpleTranslationKey } from "../../i18n/types";
import { X } from "lucide-react";
import { useState } from "react";
import { apiClient } from "../../api/client";
import { notificationText, type RulePreview, type RuleSettings, type RulesOverview } from "../../app/automationRules";
import { useI18n } from "../../i18n/I18nProvider";

type ParamField = { key: string; label: SimpleTranslationKey; min: number; max: number; fallback: number };

/** The thresholds a template takes, with the same bounds the server checks. */
const PARAM_FIELDS: Partial<Record<AutomationTemplate, ParamField[]>> = {
  MILESTONE_SHIFT: [{ key: "minDays", label: "ui.rules.minDays", min: 1, max: AUTOMATION_LIMITS.minDaysMax, fallback: 3 }],
  DECISION_WAITING: [{ key: "days", label: "ui.rules.param.days", min: 1, max: 60, fallback: 3 }],
  ISSUE_OVERDUE: [{ key: "graceDays", label: "ui.rules.param.graceDays", min: 0, max: 30, fallback: 0 }],
  WORK_DUE_SOON: [{ key: "days", label: "ui.rules.param.days", min: 1, max: 30, fallback: 3 }],
  MILESTONE_AT_RISK: [
    { key: "days", label: "ui.rules.param.days", min: 1, max: 60, fallback: 7 },
    { key: "minProgress", label: "ui.rules.param.minProgress", min: 1, max: 100, fallback: 50 },
  ],
  CHANGE_REQUEST_PENDING: [{ key: "days", label: "ui.rules.param.days", min: 1, max: 60, fallback: 5 }],
};

/** One template of a project: on or off, its thresholds, who is told, and what it would have said. */
export function RuleCard({
  projectId,
  template,
  rule,
  users,
  canWrite,
  onSaved,
}: {
  projectId: string;
  template: AutomationTemplate;
  rule: RuleSettings | null;
  users: RulesOverview["users"];
  canWrite: boolean;
  onSaved: (rule: RuleSettings) => void;
}) {
  const { t, formatters } = useI18n();
  const [enabled, setEnabled] = useState(rule?.enabled ?? false);
  const fields = PARAM_FIELDS[template] ?? [];
  const [params, setParams] = useState<Record<string, number>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, Number(rule?.params[field.key] ?? field.fallback)])),
  );
  const [recipientIds, setRecipientIds] = useState<string[]>(rule?.recipientIds ?? []);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? id;
  const candidates = users.filter((user) => !recipientIds.includes(user.id));

  const save = async () => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const saved = await apiClient.put<RuleSettings>(
        `/api/projects/${projectId}/automation-rules/${template}`,
        { enabled, params, recipientIds, ...(rule ? { version: rule.version } : {}) },
        t("ui.rules.saveFailed"),
      );
      onSaved(saved);
      setStatus(t("ui.rules.saved"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.rules.saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  const loadPreview = async () => {
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
      setPreview(await apiClient.get<RulePreview>(`/api/projects/${projectId}/automation-rules/${template}/preview${query ? `?${query}` : ""}`, t("ui.rules.failed")));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.rules.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article aria-labelledby={`rule-${template}`} className={`rule-card ${rule?.enabled ? "on" : ""}`}>
      <h3 id={`rule-${template}`}>
        {t(`ui.rules.template.${template}`)}
        <label className="rule-toggle">
          <input checked={enabled} disabled={!canWrite || busy} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
          {t("ui.rules.enabled")}
        </label>
      </h3>
      <p>{t(`ui.rules.templateHint.${template}`)}</p>
      {fields.map((field) => (
        <label key={field.key}>
          {t(field.label)}
          <input
            disabled={!canWrite || busy}
            max={field.max}
            min={field.min}
            onChange={(event) => {
              const value = Math.max(field.min, Math.min(field.max, Number(event.target.value) || field.min));
              setParams((current) => ({ ...current, [field.key]: value }));
            }}
            type="number"
            value={params[field.key]}
          />
        </label>
      ))}
      <div>
        <span className="rule-label">{t("ui.rules.recipients")}</span>
        <div className="rule-recipients">
          {recipientIds.length === 0 && <small>{t("ui.rules.noRecipients")}</small>}
          {recipientIds.map((id) => (
            <span key={id}>
              {nameOf(id)}
              {canWrite && (
                <button aria-label={t("ui.rules.removeRecipient", { name: nameOf(id) })} disabled={busy} onClick={() => setRecipientIds((current) => current.filter((value) => value !== id))} type="button">
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
        {canWrite && recipientIds.length < AUTOMATION_LIMITS.recipients && (
          <select
            aria-label={t("ui.rules.addRecipient")}
            disabled={busy}
            onChange={(event) => {
              const id = event.target.value;
              if (id) setRecipientIds((current) => [...current, id]);
            }}
            value=""
          >
            <option value="">{t("ui.rules.addRecipient")}</option>
            {candidates.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="rule-actions">
        {canWrite && (
          <button className="primary" disabled={busy} onClick={() => void save()} type="button">
            {t("ui.rules.save")}
          </button>
        )}
        <button disabled={busy} onClick={() => void loadPreview()} type="button">
          {t("ui.rules.preview")}
        </button>
        {status && <span role="status">{status}</span>}
      </div>
      {error && (
        <p className="automation-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div>
          <p>{t(`ui.rules.preview${preview.mode}`, { days: preview.days, total: preview.total })}</p>
          {preview.items.length === 0 ? (
            <p>{t("ui.rules.previewNone")}</p>
          ) : (
            <ul className="rule-preview">
              {preview.items.map((item, index) => (
                <li key={index}>
                  {item.at && <time dateTime={item.at}>{formatters.date(item.at)}: </time>}
                  {notificationText(item.params, t, (value) => formatters.date(value))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
