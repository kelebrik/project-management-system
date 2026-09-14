type SaveStateIndicatorProps = {
  saving?: boolean;
  dirty?: boolean;
  savedAt?: string | null;
};

export function SaveStateIndicator({ saving = false, dirty = false, savedAt }: SaveStateIndicatorProps) {
  if (saving) return <span className="save-state saving">Сохраняется…</span>;
  if (dirty) return <span className="save-state dirty">Есть несохранённые изменения</span>;
  return <span className="save-state saved">{savedAt ? "Сохранено " + savedAt : "Сохранено"}</span>;
}
