import { History } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import "../styles/draft-recovery.css";

type DraftRecoveryNoticeProps = {
  savedAt: string;
  onContinue: () => void;
  onDiscard: () => void;
};

/** «Есть незавершённый черновик»: go on with what was typed before, or drop it. */
export function DraftRecoveryNotice({ savedAt, onContinue, onDiscard }: DraftRecoveryNoticeProps) {
  const { t, formatters: { dateTime } } = useI18n();
  return (
    <div className="draft-recovery" role="status">
      <History size={15} aria-hidden="true" />
      <span>{t("draft.found", { when: dateTime(savedAt) })}</span>
      <button type="button" className="draft-recovery-continue" onClick={onContinue}>
        {t("draft.continue")}
      </button>
      <button type="button" className="draft-recovery-discard" onClick={onDiscard}>
        {t("draft.discard")}
      </button>
    </div>
  );
}
