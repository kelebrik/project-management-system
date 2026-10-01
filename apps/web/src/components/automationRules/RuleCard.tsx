import { AUTOMATION_LIMITS, type AutomationTemplate } from "@pms/shared";
import { X } from "lucide-react";
import { useState } from "react";
import { apiClient } from "../../api/client";
import { notificationText, type RulePreview, type RuleSettings, type RulesOverview } from "../../app/automationRules";
import { useI18n } from "../../i18n/I18nProvider";

/** One template of a project: on or off, its threshold, who is told, and what it would have said. */
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
  const [minDays, setMinDays] = useState(Number(rule?.params.minDays ?? 3));
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
        { enabled, params: template === "MILESTONE_SHIFT" ? { minDays } : {}, recipientIds, ...(rule ? { version: rule.version } : {}) },
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
      setPreview(await apiClient.get<RulePreview>(`/api/projects/${projectId}/automation-rules/${template}/preview${template === "MILESTONE_SHIFT" ? `?minDays=${minDays}` : ""}`, t("ui.rules.failed")));
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
      {template === "MILESTONE_SHIFT" && (
        <label>
          {t("ui.rules.minDays")}
          <input disabled={!canWrite || busy} max={AUTOMATION_LIMITS.minDaysMax} min={1} onChange={(event) => setMinDays(Math.max(1, Math.min(AUTOMATION_LIMITS.minDaysMax, Number(event.target.value) || 1)))} type="number" value={minDays} />
        </label>
      )}
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
