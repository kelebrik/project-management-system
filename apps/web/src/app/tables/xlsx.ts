import { normalizeTable, TABLE_LIMITS, type TableDocument } from "./tableDocument";
import { readZip, writeZip } from "./zip";

const escapeXml = (value: string) =>
  value
    // XML 1.0 has no place for control characters other than tab and line breaks.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const unescapeXml = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[lower];
  });

/** A1-style column letters for a zero-based index, and back. */
export function columnName(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function columnIndex(reference: string) {
  const letters = /^[A-Z]+/i.exec(reference)?.[0].toUpperCase() ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/**
 * An .xlsx workbook with one sheet. Every cell is written as text (inline
 * string), so codes like 1.10 and dates stay exactly as they look, except plain
 * numbers in the columns named numeric; the header row is bold and frozen.
 */
export function writeXlsx(table: TableDocument, sheetName = "Sheet1", numericColumns: ReadonlySet<number> = new Set()) {
  // Columns named as numeric keep plain numbers as numbers, so the sheet can add them up.
  const cell = (value: string, index: number, rowIndex: number, style: number) =>
    rowIndex > 1 && numericColumns.has(index) && /^-?\d+(\.\d+)?$/.test(value)
      ? `<c r="${columnName(index)}${rowIndex}" s="${style}"><v>${value}</v></c>`
      : `<c r="${columnName(index)}${rowIndex}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  const row = (cells: string[], rowIndex: number, style: number) => `<row r="${rowIndex}">${cells.map((value, index) => cell(value, index, rowIndex, style)).join("")}</row>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${[
    row(table.headers, 1, 1),
    ...table.rows.map((cells, index) => row(cells, index + 2, 0)),
  ].join("")}</sheetData></worksheet>`;
  const safeName = escapeXml(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  return writeZip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "xl/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" applyFont="1" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
}

const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** Which cell styles show a date: built-in date formats and custom ones with day/month/year parts. */
function dateStyles(stylesXml: string | undefined) {
  if (!stylesXml) return new Set<number>();
  const custom = new Map<number, string>();
  for (const match of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(Number(match[1]), unescapeXml(match[2]));
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? "";
  const styles = new Set<number>();
  [...cellXfs.matchAll(/<xf\b([^>]*?)\/?>/g)].forEach((match, index) => {
    const id = Number(/numFmtId="(\d+)"/.exec(match[1])?.[1] ?? 0);
    const code = (custom.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, "");
    if (DATE_FORMAT_IDS.has(id) || (/[dy]/i.test(code) && !/[h]/i.test(code))) styles.add(index);
  });
  return styles;
}

/** A spreadsheet day number (1900 system) as YYYY-MM-DD. */
export function serialToIsoDate(serial: number) {
  // The whole part is the day; a fraction is the time of that day.
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return Number.isNaN(date.getTime()) ? String(serial) : date.toISOString().slice(0, 10);
}

const textOf = (xml: string) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => unescapeXml(match[1])).join("");

/** The first sheet of an .xlsx as a table; values are read as displayed text, dates as YYYY-MM-DD. */
export async function readXlsx(bytes: Uint8Array): Promise<TableDocument> {
  // Only the workbook's XML parts; pictures and the like are never unpacked.
  const files = await readZip(bytes, TABLE_LIMITS.fileBytes * 20, (name) => /^xl\/.*\.(xml|rels)$/.test(name));
  const decoder = new TextDecoder();
  const text = (name: string) => {
    const data = files.get(name);
    return data ? decoder.decode(data) : undefined;
  };
  const workbook = text("xl/workbook.xml");
  const rels = text("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw new Error("NOT_XLSX");
  const firstSheetId = /<sheet\b[^>]*r:id="([^"]+)"/.exec(workbook)?.[1];
  const target = [...rels.matchAll(/<Relationship\b([^>]*)>/g)]
    .map((match) => ({ id: /\bId="([^"]*)"/.exec(match[1])?.[1], target: /\bTarget="([^"]*)"/.exec(match[1])?.[1] }))
    .find((relationship) => firstSheetId !== undefined && relationship.id === firstSheetId)?.target;
  const sheetPath = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target}`) : "xl/worksheets/sheet1.xml";
  const sheet = text(sheetPath);
  if (!sheet) throw new Error("NOT_XLSX");
  const shared = [...(text("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textOf(match[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")));
  const dates = dateStyles(text("xl/styles.xml"));
  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1] ?? rows.length + 1);
    if (rowNumber > TABLE_LIMITS.rows + 1) throw new Error(`too many rows: ${rowNumber - 1}`);
    const cells: string[] = [];
    let next = 0;
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const reference = /\br="([A-Z]+)\d*"/i.exec(attributes)?.[1];
      const index = reference ? columnIndex(reference) : next;
      next = index + 1;
      const body = cellMatch[2] ?? "";
      const type = /\bt="(\w+)"/.exec(attributes)?.[1];
      const style = Number(/\bs="(\d+)"/.exec(attributes)?.[1] ?? -1);
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
      else if (raw !== undefined) {
        const number = Number(raw);
        value = type !== "str" && type !== "e" && dates.has(style) && Number.isFinite(number) ? serialToIsoDate(number) : unescapeXml(raw);
      }
      if (value === "") continue;
      if (index >= TABLE_LIMITS.columns) throw new Error("TOO_MANY_COLUMNS");
      cells[index] = value;
    }
    rows[rowNumber - 1] = Array.from(cells, (cell) => cell ?? "");
  }
  return normalizeTable(Array.from(rows, (row) => row ?? []));
}
