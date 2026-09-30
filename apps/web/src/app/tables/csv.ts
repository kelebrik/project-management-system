import { normalizeTable, type TableDocument } from "./tableDocument";

/** The separator the text most likely uses: tab (pasted from Google Sheets or Excel), then semicolon, then comma. */
export function guessDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (character: string) => firstLine.split(character).length - 1;
  if (count("\t") > 0) return "\t";
  return count(";") >= count(",") && count(";") > 0 ? ";" : ",";
}

/** Reads CSV or TSV with quoted cells, doubled quotes and line breaks inside quotes. */
export function parseDelimited(text: string, delimiter = guessDelimiter(text)): TableDocument {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell === "") quoted = true;
    else if (character === delimiter) {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") cell += character;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Undo the quote the export puts before formula-like cells.
  return normalizeTable(rows.map((cells) => cells.map((value) => (/^'[=+\-@]/.test(value) ? value.slice(1) : value))));
}

/** A cell a spreadsheet cannot read as a formula, quoted when it needs to be. */
export function csvCell(value: string, delimiter = ";") {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return text.includes(delimiter) || /["\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CSV for Excel: a byte order mark and semicolons. */
export function writeCsv(table: TableDocument) {
  return `\uFEFF${[table.headers, ...table.rows].map((row) => row.map((value) => csvCell(value)).join(";")).join("\r\n")}`;
}
