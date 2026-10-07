import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useI18n } from "../../i18n/I18nProvider";

/** What "My page" can do, said once when it opens; "Do not show again" remembers it in this browser. */
export function PagesIntro({ onClose, onHide }: { onClose: () => void; onHide: () => void }) {
  const { t } = useI18n();
  const trap = useFocusTrap<HTMLDivElement>(true, onClose);
  const points = [
    ["ui.pages.intro.start", "ui.pages.intro.startText"],
    ["ui.pages.intro.sheet", "ui.pages.intro.sheetText"],
    ["ui.pages.intro.widget", "ui.pages.intro.widgetText"],
    ["ui.pages.intro.data", "ui.pages.intro.dataText"],
    ["ui.pages.intro.share", "ui.pages.intro.shareText"],
    ["ui.pages.intro.expert", "ui.pages.intro.expertText"],
  ] as const;
  return (
    <div className="mp-modal-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div aria-labelledby="mp-intro-title" aria-modal="true" className="mp-modal mp-intro" ref={trap} role="dialog">
        <div className="mp-modal-head">
          <h2 id="mp-intro-title">{t("ui.pages.intro.title")}</h2>
          <span className="mp-toolbar-gap" />
          <button aria-label={t("ui.pages.close")} onClick={onClose} type="button">×</button>
        </div>
        <div className="mp-intro-body">
          <p className="mp-lead">{t("ui.pages.description")}</p>
          <ul>
            {points.map(([title, text]) => (
              <li key={title}>
                <b>{t(title)}.</b> {t(text)}
              </li>
            ))}
          </ul>
        </div>
        <div className="mp-intro-actions">
          <button onClick={onHide} type="button">{t("ui.pages.intro.hide")}</button>
          <button className="primary" onClick={onClose} type="button">{t("ui.pages.intro.ok")}</button>
        </div>
      </div>
    </div>
  );
}
