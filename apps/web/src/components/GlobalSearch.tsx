import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SearchResult } from "../app/domainTypes";
import { useI18n } from "../i18n/I18nProvider";

type GlobalSearchProps = {
  className?: string;
  /** Changes on every page change; the search folds away at once when it does. */
  routeKey?: string;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (value: string) => void;
  onSelect: (result: SearchResult) => void;
  open: boolean;
  query: string;
  results: SearchResult[];
};

import type { SimpleTranslationKey as TranslationKey } from "../i18n/types";

type SearchScope = "all" | SearchResult["type"];

/**
 * The search folds to its magnifier to leave the header to the sections. It
 * opens on hover, click, Tab or Ctrl K and folds back after this long without
 * use — typing or moving through results counts as use, a cursor left in the
 * field does not — unless the pointer is over it. A page change folds it at once.
 */
export const SEARCH_IDLE_COLLAPSE_MS = 10_000;

const searchScopes: Array<{ value: SearchScope; label: TranslationKey }> = [
  { value: "all", label: "search.all" },
  { value: "project", label: "nav.projects" },
  { value: "wbs", label: "search.structure" },
  { value: "raid", label: "search.raid" },
  { value: "issue", label: "search.issues" },
];

export function GlobalSearch({
  className = "",
  routeKey,
  loading,
  onOpenChange,
  onQueryChange,
  onSelect,
  open,
  query,
  results,
}: GlobalSearchProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scope, setScope] = useState<SearchScope>("all");
  const [expanded, setExpanded] = useState(false);
  // Results belong to the field in use: hovering a folded search or a late answer must not show them.
  const [focused, setFocused] = useState(false);
  const collapseTimerRef = useRef(0);
  const hoverRef = useRef(false);

  const stopCollapse = () => window.clearTimeout(collapseTimerRef.current);
  const collapse = () => {
    stopCollapse();
    setExpanded(false);
    onOpenChange(false);
    if (document.activeElement === inputRef.current) inputRef.current?.blur();
  };
  /** Waits for a quiet spell before folding; any use of the field restarts the wait. */
  const scheduleCollapse = () => {
    stopCollapse();
    collapseTimerRef.current = window.setTimeout(() => {
      // The pointer resting on the search keeps it open; leaving restarts the wait.
      if (hoverRef.current) return;
      collapse();
    }, SEARCH_IDLE_COLLAPSE_MS);
  };
  const expand = () => {
    setExpanded(true);
    scheduleCollapse();
  };
  // Fold away as soon as the user lands on another page.
  const firstRouteRef = useRef(routeKey);
  useEffect(() => {
    if (routeKey === firstRouteRef.current) return;
    firstRouteRef.current = routeKey;
    collapse();
    // collapse reads refs and stable setters; only a new page should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);
  useEffect(() => () => window.clearTimeout(collapseTimerRef.current), []);
  const normalizedQuery = query.trim();
  const shouldShowPopover = expanded && focused && open && normalizedQuery.length >= 2;
  const scopedResults = useMemo(
    () => (scope === "all" ? results : results.filter((result) => result.type === scope)),
    [results, scope],
  );
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, scopedResults.length - 1));
  const groupedResults = useMemo(() => {
    const groups = new Map<TranslationKey, SearchResult[]>();
    scopedResults.forEach((result) => {
      const label =
        result.type === "project"
          ? "nav.projects"
          : result.type === "wbs"
            ? "search.structure"
            : result.type === "raid"
              ? "search.raid"
              : result.type === "issue"
                ? "search.issues"
                : "search.other";
      groups.set(label, [...(groups.get(label) ?? []), result]);
    });
    return Array.from(groups.entries());
  }, [scopedResults]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const isSearchShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isSearchShortcut) return;
      event.preventDefault();
      setExpanded(true);
      inputRef.current?.focus();
      onOpenChange(normalizedQuery.length >= 2);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [normalizedQuery.length, onOpenChange]);

  const selectResult = (result: SearchResult) => {
    onSelect(result);
    onOpenChange(false);
  };

  return (
    <div
      className={`global-search ${expanded ? "expanded" : "collapsed"} ${className}`.trim()}
      onMouseEnter={() => {
        hoverRef.current = true;
        expand();
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
        scheduleCollapse();
      }}
    >
      {/* The label wraps the field, so a click on the magnifier focuses it and opens the search. */}
      <label title={expanded ? undefined : t("search.placeholder")}>
        <Search size={16} />
        <input
          aria-label={t("search.placeholder")}
          ref={inputRef}
          value={query}
          onBlur={() => {
            setFocused(false);
            scheduleCollapse();
          }}
          onChange={(event) => {
            setActiveIndex(0);
            onQueryChange(event.target.value);
            scheduleCollapse();
          }}
          onFocus={() => {
            setFocused(true);
            setExpanded(true);
            scheduleCollapse();
            onOpenChange(normalizedQuery.length >= 2);
          }}
          onKeyDown={(event) => {
            scheduleCollapse();
            if (!shouldShowPopover || scopedResults.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => (current + 1) % scopedResults.length);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex(
                (current) =>
                  (current - 1 + scopedResults.length) % scopedResults.length,
              );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              selectResult(scopedResults[safeActiveIndex]);
            }
            if (event.key === "Escape") {
              onOpenChange(false);
            }
          }}
          placeholder={t("search.placeholder")}
        />
        <kbd>Ctrl K</kbd>
      </label>
      {shouldShowPopover && (
        <div className="global-search-popover">
          <div className="search-scope-tabs" role="tablist" aria-label={t("search.scope")}>
            {searchScopes.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={scope === item.value}
                className={scope === item.value ? "active" : ""}
                key={item.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setActiveIndex(0);
                  setScope(item.value);
                }}
              >
                {t(item.label)}
              </button>
            ))}
          </div>
          {loading && <span className="search-muted">{t("search.loading")}</span>}
          {!loading && (
            <div className="global-search-results">
              {groupedResults.map(([group, groupResults]) => (
                <section key={group}>
                  <span className="search-result-group">{t(group)}</span>
                  {groupResults.map((result) => {
                    const flatIndex = scopedResults.findIndex(
                      (item) =>
                        item.type === result.type && item.id === result.id,
                    );
                    return (
                      <button
                        type="button"
                        className={flatIndex === safeActiveIndex ? "active" : ""}
                        key={`${result.type}:${result.id}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => selectResult(result)}
                      >
                        <span className="search-result-project">
                          {result.projectCode
                            ? `${result.projectCode}${result.projectName ? ` - ${result.projectName}` : ""}`
                            : t("search.noProject")}
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
          {!loading && scopedResults.length === 0 && (
            <span className="search-muted">{t("search.empty")}</span>
          )}
        </div>
      )}
    </div>
  );
}
