import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedQuery = query.trim();
  const shouldShowPopover = open && normalizedQuery.length >= 2;
  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    results.forEach((result) => {
      const label =
        result.type === "project"
          ? "Проекты"
          : result.type === "wbs"
            ? "Структура"
            : result.type === "raid"
              ? "RAID"
              : result.type === "issue"
                ? "Вопросы"
                : "Остальное";
      groups.set(label, [...(groups.get(label) ?? []), result]);
    });
    return Array.from(groups.entries());
  }, [results]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const isSearchShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isSearchShortcut) return;
      event.preventDefault();
      inputRef.current?.focus();
      onOpenChange(normalizedQuery.length >= 2);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [normalizedQuery.length, onOpenChange]);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery, results.length]);

  const selectResult = (result: SearchResult) => {
    onSelect(result);
    onOpenChange(false);
  };

  return (
    <div className={`global-search ${className}`.trim()}>
      <label>
        <Search size={16} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => onOpenChange(normalizedQuery.length >= 2)}
          onKeyDown={(event) => {
            if (!shouldShowPopover || results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => (current + 1) % results.length);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex(
                (current) => (current - 1 + results.length) % results.length,
              );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              selectResult(results[activeIndex]);
            }
            if (event.key === "Escape") {
              onOpenChange(false);
            }
          }}
          placeholder="Поиск по проектам, задачам, рискам, вопросам"
        />
        <kbd>Ctrl K</kbd>
      </label>
      {shouldShowPopover && (
        <div className="global-search-popover">
          {loading && <span className="search-muted">Ищу...</span>}
          {!loading && (
            <div className="global-search-results">
              {groupedResults.map(([group, groupResults]) => (
                <section key={group}>
                  <span className="search-result-group">{group}</span>
                  {groupResults.map((result) => {
                    const flatIndex = results.findIndex(
                      (item) =>
                        item.type === result.type && item.id === result.id,
                    );
                    return (
                      <button
                        type="button"
                        className={flatIndex === activeIndex ? "active" : ""}
                        key={`${result.type}:${result.id}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => selectResult(result)}
                      >
                        <span className="search-result-project">
                          {result.projectCode
                            ? `${result.projectCode}${result.projectName ? ` - ${result.projectName}` : ""}`
                            : "Без проекта"}
                        </span>
                        <b>{result.title}</b>
                        <small>{result.subtitle}</small>
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
          {!loading && results.length === 0 && (
            <span className="search-muted">Ничего не найдено</span>
          )}
        </div>
      )}
    </div>
  );
}
