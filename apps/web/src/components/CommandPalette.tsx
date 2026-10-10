import { Command, CornerDownLeft, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { filterCommands, readRecentCommands, rememberCommand, type PaletteCommand, type PaletteGroup } from "../app/commandPalette";
import type { SearchResult } from "../app/domainTypes";
import { SEARCH_TAB_LABEL, searchScopeOf } from "../app/searchScopes";
import { useGlobalSearch } from "../app/useGlobalSearch";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useI18n } from "../i18n/I18nProvider";

const GROUP_LABELS = {
  recent: "ui.palette.recent",
  actions: "ui.palette.actions",
  sections: "ui.palette.sections",
  goto: "ui.palette.goto",
  projects: "ui.palette.projects",
} as const;

type Row =
  | { kind: "command"; key: string; group: PaletteGroup; command: PaletteCommand }
  | { kind: "result"; key: string; result: SearchResult };

type CommandPaletteProps = {
  onClose: () => void;
  commands: PaletteCommand[];
  onSelectSearchResult: (result: SearchResult) => void;
};

/**
 * Ctrl K: one field for every action and place — commands of the app filtered
 * at once, in either keyboard layout, and the projects' rows found by the
 * server search below them. Mounted only while open, so each opening starts
 * with an empty field and the first row active.
 */
export function CommandPalette({ onClose, commands, onSelectSearchResult }: CommandPaletteProps) {
  const { t } = useI18n();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Tab stays inside, Esc closes, and the focus goes back where it was.
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const search = useGlobalSearch();
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecentCommands());
  const query = search.query;

  const rows = useMemo<Row[]>(() => {
    const entries = filterCommands(commands, query, recentIds).slice(0, query.trim() ? 30 : 60);
    return [
      ...entries.map((entry) => ({ kind: "command" as const, key: `${entry.group}:${entry.command.id}`, group: entry.group, command: entry.command })),
      ...(query.trim().length >= 2 ? search.results : []).map((result) => ({ kind: "result" as const, key: `result:${result.type}:${result.id}`, result })),
    ];
  }, [commands, query, recentIds, search.results]);


  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId]);

  const run = (row: Row) => {
    onClose();
    if (row.kind === "result") {
      onSelectSearchResult(row.result);
      return;
    }
    setRecentIds(rememberCommand(row.command.id));
    row.command.run();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (rows.length ? (index + 1) % rows.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (rows.length ? (index - 1 + rows.length) % rows.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) run(row);
    }
  };

  let lastHeading = "";
  return (
    <div className="command-palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="command-palette" role="dialog" aria-modal="true" aria-label={t("ui.palette.title")} onKeyDown={onKeyDown}>
        <div className="command-palette-field">
          <Search aria-hidden="true" size={18} />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={rows[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            aria-autocomplete="list"
            aria-label={t("ui.palette.title")}
            placeholder={t("ui.palette.placeholder")}
            value={query}
            onChange={(event) => {
              search.setQuery(event.target.value);
              setActiveIndex(0);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-palette-list" id={listId} role="listbox" aria-label={t("ui.palette.title")}>
          {rows.map((row, index) => {
            const heading = row.kind === "command" ? t(GROUP_LABELS[row.group]) : t(SEARCH_TAB_LABEL[searchScopeOf(row.result.type)]);
            const showHeading = heading !== lastHeading;
            lastHeading = heading;
            return (
              <div key={row.key} role="presentation">
                {showHeading && <div className="command-palette-heading" role="presentation">{heading}</div>}
                <div
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`command-palette-row ${index === activeIndex ? "active" : ""}`}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => run(row)}
                >
                  {row.kind === "command" ? (
                    <>
                      <b>{row.command.label}</b>
                      {row.command.hint && <small>{row.command.hint}</small>}
                    </>
                  ) : (
                    <>
                      <b>{row.result.title}</b>
                      <small>{[row.result.projectCode, row.result.subtitle].filter(Boolean).join(" · ")}</small>
                    </>
                  )}
                  {index === activeIndex && <CornerDownLeft aria-hidden="true" size={14} />}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && !search.loading && <p className="command-palette-empty">{t("ui.palette.nothing")}</p>}
          {search.loading && <p className="command-palette-empty">{t("ui.palette.searching")}</p>}
        </div>
        <footer className="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t("ui.palette.move")}</span>
          <span><kbd>Enter</kbd> {t("ui.palette.open")}</span>
          <span><Command aria-hidden="true" size={12} /><kbd>K</kbd> {t("ui.palette.toggle")}</span>
        </footer>
      </div>
    </div>
  );
}
