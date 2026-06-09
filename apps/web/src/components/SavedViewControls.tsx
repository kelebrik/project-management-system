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
  return (
    <div className="saved-view-controls" aria-label="Сохраненные представления">
      <label>
        Представление
        <select
          value=""
          onChange={(event) => {
            const view = savedViews.find((item) => item.id === event.target.value);
            if (view) onSelect(view);
            event.currentTarget.value = "";
          }}
        >
          <option value="">
            {savedViews.length > 0 ? "Выбрать сохраненное" : "Нет сохраненных"}
          </option>
          {savedViews.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
              {view.isShared ? " / общее" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Новое представление
        <input
          value={savedViewName}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Название вида"
          disabled={!isAuthenticated}
        />
      </label>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled || !isAuthenticated}
        title={
          isAuthenticated
            ? "Сохранить текущие фильтры и настройки колонок"
            : "Для сохранения нужно войти"
        }
      >
        {saving ? "Сохраняю..." : "Сохранить вид"}
      </button>
    </div>
  );
}
