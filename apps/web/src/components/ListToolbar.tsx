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

export function ListToolbar({ label, query, onQueryChange, onClear, placeholder = "Поиск по названию, коду или ответственному", children }: ListToolbarProps) {
  return (
    <div className="unified-list-toolbar" role="search" aria-label={label}>
      <label className="unified-list-search">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">{label}</span>
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={placeholder} />
        {query && <button type="button" onClick={() => (onClear ? onClear() : onQueryChange(""))} aria-label="Очистить поиск"><X size={14} /></button>}
      </label>
      {children}
    </div>
  );
}
