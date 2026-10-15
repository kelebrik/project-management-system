/**
 * A comment as a checklist, kept as plain text so tables, imports and exports
 * read it as is: a line starting with "☐" is an open item, with "☑" a done
 * one, any other line is plain text. A comment written before is plain text.
 */
export const OPEN_MARK = "☐";
export const DONE_MARK = "☑";
export const NEW_ITEM = `${OPEN_MARK} `;

export type ChecklistLine = { kind: "item"; done: boolean; text: string } | { kind: "text"; text: string };

// A mark at the start of a line, then a space or the end of the line (saving trims "☐ " to "☐").
const ITEM = /^([☐☑])(?: (.*)|)$/u;

// A line as read, without the carriage return of a comment written on Windows.
const bare = (line: string) => (line.endsWith("\r") ? line.slice(0, -1) : line);

/** The comment's lines, each an item or plain text, in order; empty lines kept. */
export function parseChecklist(text: string): ChecklistLine[] {
  if (text === "") return [];
  return text.split("\n").map((raw) => {
    const line = bare(raw);
    const match = ITEM.exec(line);
    return match ? { kind: "item", done: match[1] === DONE_MARK, text: match[2] ?? "" } : { kind: "text", text: line };
  });
}

/** The comment with one item ticked or unticked: only that line's mark changes. */
export function toggleItem(text: string, lineIndex: number) {
  const lines = text.split("\n");
  const line = lines[lineIndex];
  if (line === undefined || !ITEM.test(bare(line))) return text;
  lines[lineIndex] = (line.startsWith(OPEN_MARK) ? DONE_MARK : OPEN_MARK) + line.slice(1);
  return lines.join("\n");
}

/** What a comment becomes when its editing starts: an empty one starts as an item. */
export function startEditing(text: string) {
  return text.trim() === "" ? NEW_ITEM : text;
}

/** What is saved: a comment of empty items and blank lines only is no comment; any text is kept as typed. */
export function textToSave(text: string) {
  return parseChecklist(text).every((line) => line.text.trim() === "") ? "" : text;
}

/**
 * Enter in the comment: a new item on the next line, or, on an empty item, the
 * mark taken away (leaving the list, as in Confluence). Shift+Enter: a plain new
 * line. A selection is replaced, as typing does.
 */
export function insertOnEnter(value: string, start: number, end: number, shift: boolean): { value: string; caret: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  if (shift) return { value: `${before}\n${after}`, caret: start + 1 };
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEndInAfter = after.indexOf("\n");
  const line = before.slice(lineStart) + (lineEndInAfter === -1 ? after : after.slice(0, lineEndInAfter));
  if (start === end && /^[☐☑] ?$/u.test(line)) {
    const rest = lineEndInAfter === -1 ? "" : after.slice(lineEndInAfter);
    return { value: value.slice(0, lineStart) + rest, caret: lineStart };
  }
  return { value: `${before}\n${NEW_ITEM}${after}`, caret: start + 1 + NEW_ITEM.length };
}
