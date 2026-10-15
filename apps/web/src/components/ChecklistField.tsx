import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { DONE_MARK, insertOnEnter, OPEN_MARK, parseChecklist, startEditing, textToSave, toggleItem } from "../app/checklistText";
import { pendingBuffers } from "../app/wbsBuffers";

type ChecklistFieldProps = {
  value: string;
  /** Names the field for screen readers, with the row it belongs to. */
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  /** Called once per finished edit or tick, only when the text changed. */
  onCommit: (value: string) => void;
  /** Says how to name an item's tick box for screen readers. */
  itemLabel: (text: string, done: boolean) => string;
};

/**
 * A comment shown as a checklist, as in Confluence: items with tick boxes and
 * plain lines. A tick saves at once. A click on the text edits it: Enter starts
 * a new item, Shift+Enter a plain line, Enter on an empty item leaves the list;
 * Escape gives up the edit, leaving the field or Ctrl/Cmd+Enter saves it. While
 * typed text is not saved, the page counts it as unsaved.
 */
export function ChecklistField({ value, label, placeholder, readOnly, onCommit, itemLabel }: ChecklistFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const startRef = useRef("");
  const doneRef = useRef(false);
  const caretRef = useRef<number | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [bufferId] = useState(() => ({}));
  const editing = draft !== null;

  useEffect(() => () => {
    pendingBuffers.delete(bufferId);
  }, [bufferId]);

  // The caret where an Enter left it, and the box as tall as its text.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    fitHeight(area);
    if (caretRef.current !== null) {
      area.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  }, [draft]);
  // A column made narrower or wider wraps the text anew: the box follows.
  useEffect(() => {
    const area = areaRef.current;
    if (!area || typeof ResizeObserver === "undefined") return;
    let width = area.clientWidth;
    const observer = new ResizeObserver(() => {
      if (area.clientWidth === width) return;
      width = area.clientWidth;
      fitHeight(area);
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [editing]);
  // Leaving the editor by a key gives the focus back to the field, so the keyboard goes on from there.
  const viewRef = useRef<HTMLDivElement | null>(null);
  const refocusRef = useRef(false);
  useEffect(() => {
    if (editing || !refocusRef.current) return;
    refocusRef.current = false;
    viewRef.current?.focus();
  }, [editing]);

  const edit = () => {
    if (readOnly || editing) return;
    const start = startEditing(value);
    startRef.current = start;
    doneRef.current = false;
    caretRef.current = start.length;
    setDraft(start);
  };

  const change = (next: string) => {
    setDraft(next);
    // Only text really typed is unsaved; opening an empty field is not.
    if (next !== startRef.current) pendingBuffers.add(bufferId);
    else pendingBuffers.delete(bufferId);
  };

  const finish = (save: boolean) => {
    if (doneRef.current || draft === null) return;
    doneRef.current = true;
    pendingBuffers.delete(bufferId);
    setDraft(null);
    // Nothing typed: nothing to save, whatever came meanwhile from elsewhere stays.
    if (!save || draft === startRef.current) return;
    const next = textToSave(draft);
    if (next.trim() !== value.trim()) onCommit(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Typing and moving in the text are the comment's, not the table's; shortcuts with Ctrl or Cmd
    // (search in the page, the command palette) still reach the page.
    if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      refocusRef.current = true;
      finish(false);
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      refocusRef.current = true;
      finish(true);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const area = event.currentTarget;
      const result = insertOnEnter(area.value, area.selectionStart, area.selectionEnd, event.shiftKey);
      caretRef.current = result.caret;
      change(result.value);
    }
  };

  if (editing) {
    return (
      <textarea
        aria-label={label}
        autoFocus
        className="checklist-editor"
        data-editable-key-handler="local"
        onBlur={() => finish(true)}
        onChange={(event) => change(event.target.value)}
        onKeyDown={onKeyDown}
        // Text pasted here is the comment's, not rows and columns of the table.
        onPaste={(event) => event.stopPropagation()}
        ref={areaRef}
        rows={1}
        value={draft}
      />
    );
  }

  const lines = parseChecklist(value);
  return (
    <div
      aria-label={label}
      className={`checklist-field${readOnly ? " read-only" : ""}`}
      onClick={edit}
      ref={viewRef}
      onKeyDown={(event) => {
        if (readOnly) return;
        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          event.stopPropagation();
          edit();
        }
      }}
      role="group"
      tabIndex={readOnly ? undefined : 0}
    >
      {lines.length === 0 && <span className="checklist-placeholder">{readOnly ? "—" : placeholder}</span>}
      {lines.map((line, index) =>
        line.kind === "item" ? (
          <div className={`checklist-item${line.done ? " done" : ""}`} key={index}>
            <button
              aria-checked={line.done}
              aria-label={itemLabel(line.text, line.done)}
              className="checklist-box"
              disabled={readOnly}
              onClick={(event) => {
                event.stopPropagation();
                onCommit(toggleItem(value, index));
              }}
              // Enter and Space tick the box; they do not open the editor around it.
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") event.stopPropagation();
              }}
              role="checkbox"
              type="button"
            >
              {line.done ? DONE_MARK : OPEN_MARK}
            </button>
            <span>{line.text}</span>
          </div>
        ) : (
          <div className="checklist-text" key={index}>
            {line.text || " "}
          </div>
        ),
      )}
    </div>
  );
}

/** Makes a text box as tall as its text. */
function fitHeight(area: HTMLTextAreaElement) {
  area.style.height = "auto";
  area.style.height = `${area.scrollHeight}px`;
}
