import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/client";
import type { Lesson, LessonDraft } from "../../app/lessons";
import { useConfirm } from "../../hooks/useConfirm";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useI18n } from "../../i18n/I18nProvider";
import "../../styles/lessons.css";
import { LessonEditor } from "./LessonEditor";

const EMPTY: LessonDraft = { category: "OTHER", title: "", text: "", recommendation: "", sourceKind: "MANUAL", sourceRef: null };

/**
 * The project's lessons: the ones saved, a draft gathered from the project's
 * records (moves of the goal by reason, problems, risks that came true,
 * critical issues, decisions) to edit and keep, and a lesson written by hand.
 * Lessons can be written after the project closes too.
 */
export function LessonsDrawer({ projectId, canWrite, onClose }: { projectId: string; canWrite: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const containerRef = useFocusTrap<HTMLElement>(true, onClose);
  const confirm = useConfirm();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [drafts, setDrafts] = useState<LessonDraft[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiClient
      .get<Lesson[]>(`/api/projects/${projectId}/lessons`, t("ui.lessons.failed"))
      .then(setLessons)
      .catch((failure) => setError(failure instanceof Error ? failure.message : t("ui.lessons.failed")));
    if (canWrite) {
      apiClient
        .get<LessonDraft[]>(`/api/projects/${projectId}/lessons/draft?locale=${locale}`, t("ui.lessons.failed"))
        .then(setDrafts)
        .catch(() => setDrafts([]));
    }
  }, [canWrite, locale, projectId, t]);
  useEffect(load, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setEditing(null);
      setAdding(false);
      load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.lessons.failed"));
    } finally {
      setBusy(false);
    }
  };
  const create = (lesson: LessonDraft) => run(() => apiClient.post(`/api/projects/${projectId}/lessons`, lesson, t("ui.lessons.failed")));

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose}>
      <aside aria-labelledby="lessons-title" aria-modal="true" className="side-drawer lessons-drawer" onClick={(event) => event.stopPropagation()} ref={containerRef} role="dialog" tabIndex={-1}>
        <div className="drawer-title">
          <h2 id="lessons-title">{t("ui.lessons.title")}</h2>
          <button aria-label={t("ui.decisions.close")} onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>
        <p className="lessons-intro">{t("ui.lessons.intro")}</p>
        {error && (
          <p className="automation-error" role="alert">
            {error}
          </p>
        )}
        <section aria-label={t("ui.lessons.saved")}>
          <h3>{t("ui.lessons.saved")}</h3>
          {lessons.length === 0 && <p className="lessons-empty">{t("ui.lessons.none")}</p>}
          {lessons.map((lesson) =>
            editing === lesson.id ? (
              <LessonEditor
                busy={busy}
                initial={lesson}
                key={lesson.id}
                onCancel={() => setEditing(null)}
                onSave={(next) => void run(() => apiClient.patch(`/api/lessons/${lesson.id}`, { category: next.category, title: next.title, text: next.text, recommendation: next.recommendation }, t("ui.lessons.failed")))}
                saveLabel={t("ui.lessons.save")}
              />
            ) : (
              <article className="lesson-card" key={lesson.id}>
                <span className="lesson-category">{t(`ui.lessons.cat.${lesson.category}`)}</span>
                <strong>{lesson.title}</strong>
                {lesson.text && <p>{lesson.text}</p>}
                {lesson.recommendation && <p className="lesson-advice">{t("ui.lessons.advice", { text: lesson.recommendation })}</p>}
                {canWrite && (
                  <div className="lesson-actions">
                    <button disabled={busy} onClick={() => setEditing(lesson.id)} type="button">
                      {t("ui.decisions.edit")}
                    </button>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (await confirm({ title: t("ui.lessons.deleteTitle"), message: lesson.title, confirmLabel: t("ui.decisions.delete") })) {
                          void run(() => apiClient.delete(`/api/lessons/${lesson.id}`, t("ui.lessons.failed")));
                        }
                      }}
                      type="button"
                    >
                      {t("ui.decisions.delete")}
                    </button>
                  </div>
                )}
              </article>
            ),
          )}
          {canWrite &&
            (adding ? (
              <LessonEditor busy={busy} initial={EMPTY} onCancel={() => setAdding(false)} onSave={(lesson) => void create(lesson)} saveLabel={t("ui.lessons.save")} />
            ) : (
              <button disabled={busy} onClick={() => setAdding(true)} type="button">
                {t("ui.lessons.add")}
              </button>
            ))}
        </section>
        {canWrite && drafts.length > 0 && (
          <section aria-label={t("ui.lessons.draft")}>
            <h3>{t("ui.lessons.draft")}</h3>
            <p className="lessons-intro">{t("ui.lessons.draftHint")}</p>
            {drafts.map((draft) => (
              <div className="lesson-draft" key={draft.sourceRef ?? draft.title}>
                <span className="lesson-source">{t(`ui.lessons.source.${draft.sourceKind}`)}</span>
                <LessonEditor busy={busy} initial={draft} onSave={(lesson) => void create(lesson)} saveLabel={t("ui.lessons.keep")} />
              </div>
            ))}
          </section>
        )}
      </aside>
    </div>,
    document.body,
  );
}
