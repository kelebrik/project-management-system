import { useI18n } from "../i18n/I18nProvider";
type SaveStateIndicatorProps = {
  saving?: boolean;
  dirty?: boolean;
  savedAt?: string | null;
};

export function SaveStateIndicator({ saving = false, dirty = false, savedAt }: SaveStateIndicatorProps) {
  const { t } = useI18n();
  if (saving) return <span className="save-state saving">{t("save.saving")}</span>;
  if (dirty) return <span className="save-state dirty">{t("save.dirty")}</span>;
  return <span className="save-state saved">{savedAt ? t("save.savedAt", { time: savedAt }) : t("save.saved")}</span>;
}
