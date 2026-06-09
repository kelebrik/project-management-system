import { Search } from "lucide-react";

import type { SearchResult } from "../app/domainTypes";

type GlobalSearchProps = {
  className?: string;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (value: string) => void;
  onSelect: (result: SearchResult) => void;
  open: boolean;
  query: string;
  results: SearchResult[];
};

export function GlobalSearch({
  className = "",
  loading,
  onOpenChange,
  onQueryChange,
  onSelect,
  open,
  query,
  results,
}: GlobalSearchProps) {
  const normalizedQuery = query.trim();
  const shouldShowPopover = open && normalizedQuery.length >= 2;

  return (
    <div className={`global-search ${className}`.trim()}>
      <label>
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => onOpenChange(normalizedQuery.length >= 2)}
          placeholder="Поиск по проектам, задачам, рискам, вопросам"
        />
      </label>
      {shouldShowPopover && (
        <div className="global-search-popover">
          {loading && <span className="search-muted">Ищу...</span>}
          {!loading &&
            results.map((result) => (
              <button
                type="button"
                key={`${result.type}:${result.id}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(result)}
              >
                <span className="search-result-project">
                  {result.projectCode
                    ? `${result.projectCode}${result.projectName ? ` - ${result.projectName}` : ""}`
                    : "Без проекта"}
                </span>
                <b>{result.title}</b>
                <small>{result.subtitle}</small>
              </button>
            ))}
          {!loading && results.length === 0 && (
            <span className="search-muted">Ничего не найдено</span>
          )}
        </div>
      )}
    </div>
  );
}
