import { useState } from "react";
import { PAGE_METRIC_GROUPS, PAGE_QUESTIONS, type PageQuestion } from "@pms/shared";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import { useI18n } from "../../../i18n/I18nProvider";

/** "+ Widget": questions grouped by topic; a question adds a ready widget. */
export function QuestionPalette({ onPick, onClose }: { onPick: (question: PageQuestion) => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const trap = useFocusTrap<HTMLDivElement>(true, onClose);
  const needle = search.trim().toLocaleLowerCase(locale);
  const groups = [...Object.entries(PAGE_METRIC_GROUPS).map(([key, label]) => [key, label[locale]] as const), ["design", t("ui.pages.palette.design")] as const];
  return (
    <div className="mp-modal-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div aria-label={t("ui.pages.palette.title")} aria-modal="true" className="mp-modal mp-palette" ref={trap} role="dialog">
        <div className="mp-modal-head">
          <h2>{t("ui.pages.palette.title")}</h2>
          <input aria-label={t("ui.pages.palette.search")} onChange={(event) => setSearch(event.target.value)} placeholder={t("ui.pages.palette.search")} type="search" value={search} />
          <button aria-label={t("ui.pages.close")} onClick={onClose} type="button">×</button>
        </div>
        <div className="mp-palette-groups">
          {groups.map(([group, label]) => {
            const questions = PAGE_QUESTIONS.filter((question) => question.group === group && (!needle || question.label[locale].toLocaleLowerCase(locale).includes(needle)));
            if (questions.length === 0) return null;
            return (
              <section key={group}>
                <h3>{label}</h3>
                <div className="mp-palette-items">
                  {questions.map((question) => (
                    <button key={question.id} onClick={() => onPick(question)} type="button">
                      <span>{question.label[locale]}</span>
                      <small>{t(`ui.pages.palette.kind.${question.widget.type}` as "ui.pages.palette.kind.kpi")} · {question.widget.w}×{question.widget.h}</small>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
