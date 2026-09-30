import { X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/client";
import type { Decision } from "../../app/decisions";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useI18n } from "../../i18n/I18nProvider";

type Option = { id: string; label: string };
export type DecisionLinkOptions = { issues: Option[]; risks: Option[]; rows: Option[]; changes: Option[] };

/**
 * A new decision or a draft to edit: what is decided, why, what it settles, and
 * whether it is only proposed or already taken (by whom, when). A decision in
 * force can be replaced by a new one.
 */
export function DecisionForm({
  projectId,
  editing,
  supersedes,
  options,
  onSaved,
  onClose,
}: {
  projectId: string;
  editing: Decision | null;
  supersedes: Decision | null;
  options: DecisionLinkOptions;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const containerRef = useFocusTrap<HTMLElement>(true, onClose);
  const [title, setTitle] = useState(editing?.title ?? (supersedes ? supersedes.title : ""));
  const [context, setContext] = useState(editing?.context ?? "");
  const [decision, setDecision] = useState(editing?.decision ?? "");
  const [issueId, setIssueId] = useState(editing?.issueId ?? supersedes?.issueId ?? "");
  const [raidItemId, setRaidItemId] = useState(editing?.raidItemId ?? supersedes?.raidItemId ?? "");
  const [wbsItemId, setWbsItemId] = useState(editing?.wbsItemId ?? supersedes?.wbsItemId ?? "");
  const [changeRequestId, setChangeRequestId] = useState(editing?.changeRequestId ?? supersedes?.changeRequestId ?? "");
  // A replacement is written down as taken; a new decision may be only a proposal.
  const [taken, setTaken] = useState(Boolean(supersedes));
  const [decidedBy, setDecidedBy] = useState("");
  const [decidedAt, setDecidedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const links = { issueId: issueId || null, raidItemId: raidItemId || null, wbsItemId: wbsItemId || null, changeRequestId: changeRequestId || null };
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await apiClient.patch(`/api/decisions/${editing.id}`, { title, context, decision, ...links, expectedVersion: editing.version }, t("ui.decisions.saveFailed"));
      } else {
        await apiClient.post(
          `/api/projects/${projectId}/decisions`,
          {
            title,
            context,
            decision,
            ...links,
            mode: taken ? "RECORD" : "PROPOSE",
            ...(taken ? { decidedBy, decidedAt } : {}),
            ...(supersedes ? { supersedesId: supersedes.id } : {}),
          },
          t("ui.decisions.saveFailed"),
        );
      }
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.decisions.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const select = (label: string, value: string, set: (value: string) => void, list: Option[]) =>
    list.length > 0 && (
      <label>
        {label}
        <select disabled={saving} onChange={(event) => set(event.target.value)} value={value}>
          <option value="">{t("ui.decisions.noLink")}</option>
          {list.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );

  const heading = editing ? t("ui.decisions.edit") : supersedes ? t("ui.decisions.replaceTitle", { title: supersedes.title }) : t("ui.decisions.new");
  const canSave = title.trim().length >= 3 && (!taken || (decision.trim() && decidedBy.trim().length >= 2 && decidedAt));
  return createPortal(
    <div className="drawer-backdrop" onClick={onClose}>
      <aside aria-labelledby="decision-form-title" aria-modal="true" className="side-drawer decision-drawer" onClick={(event) => event.stopPropagation()} ref={containerRef} role="dialog" tabIndex={-1}>
        <div className="drawer-title">
          <h2 id="decision-form-title">{heading}</h2>
          <button aria-label={t("ui.decisions.close")} onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>
        <div className="decision-form">
          <label>
            {t("ui.decisions.fieldTitle")}
            <input disabled={saving} maxLength={300} onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
          <label>
            {t("ui.decisions.fieldDecision")}
            <textarea disabled={saving} maxLength={4000} onChange={(event) => setDecision(event.target.value)} value={decision} />
          </label>
          <label>
            {t("ui.decisions.fieldContext")}
            <textarea disabled={saving} maxLength={4000} onChange={(event) => setContext(event.target.value)} value={context} />
          </label>
          {select(t("ui.decisions.linkIssue"), issueId, setIssueId, options.issues)}
          {select(t("ui.decisions.linkRisk"), raidItemId, setRaidItemId, options.risks)}
          {select(t("ui.decisions.linkRow"), wbsItemId, setWbsItemId, options.rows)}
          {select(t("ui.decisions.linkChange"), changeRequestId, setChangeRequestId, options.changes)}
          {!editing && (
            <fieldset className="decision-mode">
              <legend>{t("ui.decisions.mode")}</legend>
              <label>
                <input checked={!taken} disabled={saving || Boolean(supersedes)} onChange={() => setTaken(false)} type="radio" />
                {t("ui.decisions.modePropose")}
              </label>
              <label>
                <input checked={taken} disabled={saving} onChange={() => setTaken(true)} type="radio" />
                {t("ui.decisions.modeRecord")}
              </label>
            </fieldset>
          )}
          {!editing && taken && (
            <div className="decision-row">
              <label>
                {t("ui.decisions.decidedBy")}
                <input disabled={saving} maxLength={200} onChange={(event) => setDecidedBy(event.target.value)} placeholder={t("ui.decisions.decidedByHint")} value={decidedBy} />
              </label>
              <label>
                {t("ui.decisions.decidedAt")}
                <input disabled={saving} onChange={(event) => setDecidedAt(event.target.value)} type="date" value={decidedAt} />
              </label>
            </div>
          )}
          {error && (
            <p className="automation-error" role="alert">
              {error}
            </p>
          )}
          <div className="decision-actions">
            <button className="primary" disabled={saving || !canSave} onClick={() => void save()} type="button">
              {t("ui.decisions.save")}
            </button>
            <button disabled={saving} onClick={onClose} type="button">
              {t("ui.decisions.cancel")}
            </button>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
