/**
 * The neutral table every import and export goes through: a header row and
 * rows of plain text cells. Excel files, CSV and text pasted from Google
 * Sheets are read into it; the Structure is written out of it.
 */
export type TableDocument = { headers: string[]; rows: string[][] };

export const TABLE_LIMITS = { rows: 3000, columns: 60, cellChars: 4000, fileBytes: 5_000_000 } as const;

/** Trims cells, drops empty trailing rows and columns, and pads rows to the header width. Too much data is an error, never cut. */
export function normalizeTable(raw: string[][]): TableDocument {
  const rows = raw.map((row) => {
    const cells = row.map((cell) => (cell ?? "").toString().replace(/\r/g, "").trim());
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    return cells;
  });
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
  const [headerRow = [], ...body] = rows;
  if (body.length > TABLE_LIMITS.rows) throw new Error(`too many rows: ${body.length}`);
  const width = Math.max(headerRow.length, ...body.map((row) => row.length));
  if (width > TABLE_LIMITS.columns) throw new Error("TOO_MANY_COLUMNS");
  if (rows.some((row) => row.some((cell) => cell.length > TABLE_LIMITS.cellChars))) throw new Error("CELL_TOO_LONG");
  const pad = (row: string[]) => Array.from({ length: width }, (_, index) => row[index] ?? "");
  return { headers: pad(headerRow), rows: body.map(pad) };
}
