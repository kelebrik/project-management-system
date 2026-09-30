import { useState } from "react";
import { LESSON_CATEGORIES, type LessonDraft } from "../../app/lessons";
import { useI18n } from "../../i18n/I18nProvider";

/** The fields of one lesson, for a draft to save or a saved lesson to change. */
export function LessonEditor({
  initial,
  busy,
  saveLabel,
  onSave,
  onCancel,
}: {
  initial: LessonDraft;
  busy: boolean;
  saveLabel: string;
  onSave: (lesson: LessonDraft) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [lesson, setLesson] = useState(initial);
  const set = (patch: Partial<LessonDraft>) => setLesson((current) => ({ ...current, ...patch }));
  return (
    <div className="lesson-editor">
      <div className="lesson-editor-row">
        <label>
          {t("ui.lessons.category")}
          <select disabled={busy} onChange={(event) => set({ category: event.target.value as LessonDraft["category"] })} value={lesson.category}>
            {LESSON_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`ui.lessons.cat.${category}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="lesson-title-field">
          {t("ui.lessons.fieldTitle")}
          <input disabled={busy} maxLength={300} onChange={(event) => set({ title: event.target.value })} value={lesson.title} />
        </label>
      </div>
      <label>
        {t("ui.lessons.fieldText")}
        <textarea disabled={busy} maxLength={4000} onChange={(event) => set({ text: event.target.value })} value={lesson.text} />
      </label>
      <label>
        {t("ui.lessons.fieldAdvice")}
        <textarea disabled={busy} maxLength={4000} onChange={(event) => set({ recommendation: event.target.value })} value={lesson.recommendation} />
      </label>
      <div className="lesson-actions">
        <button className="primary" disabled={busy || lesson.title.trim().length < 3} onClick={() => onSave(lesson)} type="button">
          {saveLabel}
        </button>
        {onCancel && (
          <button disabled={busy} onClick={onCancel} type="button">
            {t("ui.decisions.cancel")}
          </button>
        )}
      </div>
    </div>
  );
}
