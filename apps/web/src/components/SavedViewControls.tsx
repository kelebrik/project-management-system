import { useI18n } from "../i18n/I18nProvider";
import type { SavedView } from "../app/domainTypes";

type SavedViewControlsProps = {
  disabled: boolean;
  isAuthenticated: boolean;
  onNameChange: (value: string) => void;
  onSave: () => void;
  onSelect: (view: SavedView) => void;
  saving: boolean;
  savedViewName: string;
  savedViews: SavedView[];
};

export function SavedViewControls({
  disabled,
  isAuthenticated,
  onNameChange,
  onSave,
  onSelect,
  saving,
  savedViewName,
  savedViews,
}: SavedViewControlsProps) {
  const { t } = useI18n();
  return (
    <div className="saved-view-controls" aria-label={t("views.saved")}>
      <label>
        {t("views.view")}
        <select
          value=""
          onChange={(event) => {
            const view = savedViews.find((item) => item.id === event.target.value);
            if (view) onSelect(view);
            event.currentTarget.value = "";
          }}
        >
          <option value="">
            {savedViews.length > 0 ? t("views.select") : t("views.empty")}
          </option>
          {savedViews.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
              {view.isShared ? ` / ${t("views.shared")}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("views.new")}
        <input
          value={savedViewName}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={t("views.name")}
          disabled={!isAuthenticated}
        />
      </label>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled || !isAuthenticated}
        title={
          isAuthenticated
            ? t("views.saveHint")
            : t("views.loginRequired")
        }
      >
        {saving ? t("common.saving") : t("views.save")}
      </button>
    </div>
  );
}
