import { useState } from "react";
import { apiClient } from "../../api/client";
import { SHIFT_REASON_CATEGORIES } from "../../app/scheduleShifts";
import { SCHEDULE_SHIFTS_CHANGED_EVENT } from "../../app/scheduleShiftNotice";
import { useI18n } from "../../i18n/I18nProvider";

type RiskOption = { id: string; title: string };

/**
 * The reason for one or more moves: a category in one click, an optional note
 * and optionally the risk or problem behind it. Saving it tells the journal on
 * the page to reload.
 */
export function ShiftReasonForm({
  projectId,
  shiftIds,
  risks = [],
  initial,
  onDone,
  onCancel,
  cancelLabel,
}: {
  projectId: string;
  shiftIds: string[];
  risks?: RiskOption[];
  initial?: { category: string; text: string | null; raidItemId: string | null } | null;
  onDone: () => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const { t } = useI18n();
  const [category, setCategory] = useState(initial?.category ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [raidItemId, setRaidItemId] = useState(initial?.raidItemId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await apiClient.patch(
        `/api/projects/${projectId}/schedule-shifts/reason`,
        { shiftIds, category, text, raidItemId: raidItemId || null },
        t("ui.shifts.reasonFailed"),
      );
      window.dispatchEvent(new CustomEvent(SCHEDULE_SHIFTS_CHANGED_EVENT));
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.shifts.reasonFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shift-reason-form">
      <div className="shift-reason-categories" role="radiogroup" aria-label={t("ui.shifts.reasonCategory")}>
        {SHIFT_REASON_CATEGORIES.map((value) => (
          <button
            aria-checked={category === value}
            className={category === value ? "active" : ""}
            disabled={saving}
            key={value}
            onClick={() => setCategory(value)}
            role="radio"
            type="button"
          >
            {t(`ui.shifts.reason.${value}`)}
          </button>
        ))}
      </div>
      <input
        aria-label={t("ui.shifts.reasonText")}
        disabled={saving}
        maxLength={500}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("ui.shifts.reasonText")}
        value={text}
      />
      {risks.length > 0 && (
        <select aria-label={t("ui.shifts.reasonRisk")} disabled={saving} onChange={(event) => setRaidItemId(event.target.value)} value={raidItemId}>
          <option value="">{t("ui.shifts.reasonNoRisk")}</option>
          {risks.map((risk) => (
            <option key={risk.id} value={risk.id}>
              {risk.title}
            </option>
          ))}
        </select>
      )}
      {error && (
        <p className="automation-error" role="alert">
          {error}
        </p>
      )}
      <div className="shift-reason-actions">
        <button className="primary" disabled={saving || !category} onClick={() => void save()} type="button">
          {t("ui.shifts.reasonSave")}
        </button>
        <button disabled={saving} onClick={onCancel} type="button">
          {cancelLabel ?? t("ui.shifts.reasonCancel")}
        </button>
      </div>
    </div>
  );
}
