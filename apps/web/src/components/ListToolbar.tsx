import { useI18n } from "../i18n/I18nProvider";
import { Search, X } from "lucide-react";
import type { ReactNode } from "react";

type ListToolbarProps = {
  label: string;
  query: string;
  onQueryChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  children?: ReactNode;
};

export function ListToolbar({ label, query, onQueryChange, onClear, placeholder, children }: ListToolbarProps) {
  const { t } = useI18n();
  return (
    <div className="unified-list-toolbar" role="search" aria-label={label}>
      <label className="unified-list-search">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">{label}</span>
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={placeholder ?? t("search.listPlaceholder")} />
        {query && <button type="button" onClick={() => (onClear ? onClear() : onQueryChange(""))} aria-label={t("search.clear")}><X size={14} /></button>}
      </label>
      {children}
    </div>
  );
}
