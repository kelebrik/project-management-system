import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import test from "node:test";
import { csvCell, guessDelimiter, parseDelimited, writeCsv } from "./csv";
import { normalizeTable } from "./tableDocument";
import { columnName, readXlsx, serialToIsoDate, writeXlsx } from "./xlsx";
import { crc32, readZip } from "./zip";

/** A deflated ZIP, the way Excel and Google Sheets write them. */
function deflatedZip(files: Record<string, string>, declaredSize?: number) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [fileName, content] of Object.entries(files)) {
    const name = Buffer.from(fileName);
    const data = Buffer.from(content);
    const packed = deflateRawSync(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(declaredSize ?? data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc32(data), 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(declaredSize ?? data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += 30 + name.length + packed.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, centralBytes, end]));
}

test("normalizeTable trims, pads and drops empty trailing rows", () => {
  assert.deepEqual(normalizeTable([[" Код ", "Название"], ["1", "Старт", "лишнее"], ["", ""]]), {
    headers: ["Код", "Название", ""],
    rows: [["1", "Старт", "лишнее"]],
  });
});

test("CSV and text pasted from Google Sheets are read with quotes and line breaks", () => {
  assert.equal(guessDelimiter("a\tb\n1\t2"), "\t");
  assert.equal(guessDelimiter("a;b,c;d"), ";");
  assert.deepEqual(parseDelimited('Код;Название\r\n1.1;"Сборка; ""альфа""\nвторая строка"\r\n'), {
    headers: ["Код", "Название"],
    rows: [["1.1", 'Сборка; "альфа"\nвторая строка']],
  });
  assert.deepEqual(parseDelimited("Код\tСрок\n1\t2026-10-01").rows, [["1", "2026-10-01"]]);
});

test("CSV export defuses formulas and round-trips", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("a;b"), '"a;b"');
  assert.deepEqual(parseDelimited(`${csvCell("Код")};${csvCell("-3")}\n1;${csvCell("+7 999")}`).rows, [["1", "+7 999"]]);
  assert.deepEqual(parseDelimited("Код;Сдвиг").headers, ["Код", "Сдвиг"]);
  const table = { headers: ["Код", "Название"], rows: [["1", 'Сборка "альфа"; бета']] };
  const csv = writeCsv(table);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.deepEqual(parseDelimited(csv), table);
});

test("an .xlsx written here reads back exactly, codes and dates as text", async () => {
  assert.equal(columnName(0), "A");
  assert.equal(columnName(27), "AB");
  const table = { headers: ["Код", "Название", "Срок"], rows: [["1.10", "Сборка <альфа> & бета", "2026-10-01"], ["2", "", ""]] };
  assert.deepEqual(await readXlsx(writeXlsx(table, "Структура: план")), table);
});

test("an Excel workbook with shared strings, numbers and date styles is read as displayed", async () => {
  assert.equal(serialToIsoDate(46296), "2026-10-01");
  const bytes = deflatedZip({
    "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="План" sheetId="1" r:id="rId7"/><sheet name="Второй" sheetId="2" r:id="rId8"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId8" Target="worksheets/sheet2.xml"/><Relationship Id="rId7" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": '<sst><si><t>Код</t></si><si><r><t>Назва</t></r><r><t>ние</t></r></si><si><t>Срок</t></si><si><t>Старт &amp; сборка</t></si></sst>',
    "xl/styles.xml": '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
      '<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" s="1"><v>46296</v></c></row>' +
      '<row r="4"><c r="A4" t="str"><v>1.1</v></c><c r="C4" s="2"><v>46297</v></c><c r="D4" t="b"><v>1</v></c></row></sheetData></worksheet>',
    "xl/worksheets/sheet2.xml": "<worksheet><sheetData/></worksheet>",
  });
  assert.deepEqual(await readXlsx(bytes), {
    headers: ["Код", "Название", "Срок", ""],
    rows: [
      ["1", "Старт & сборка", "2026-10-01", ""],
      ["", "", "", ""],
      ["1.1", "", "2026-10-02", "TRUE"],
    ],
  });
});

test("hostile workbooks neither hang nor lose data silently", async () => {
  const started = Date.now();
  const bytes = deflatedZip({
    "xl/workbook.xml": '<workbook><sheets><sheet name="x" sheetId="1" r:id="(a+)+X"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="${"a".repeat(50_000)}" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Код</t></is></c></row></sheetData></worksheet>',
  });
  assert.deepEqual((await readXlsx(bytes)).headers, ["Код"]);
  assert.ok(Date.now() - started < 2000);
  assert.equal(serialToIsoDate(46296.75), "2026-10-01");
  assert.throws(() => normalizeTable([["Код"], ["x".repeat(4001)]]), /CELL_TOO_LONG/);
  assert.throws(() => normalizeTable([Array.from({ length: 61 }, (_, index) => `c${index}`)]), /TOO_MANY_COLUMNS/);
  assert.equal(normalizeTable([["Код", ...Array(100).fill("")], ["1"]]).headers.length, 1);
});

test("broken or oversized archives are refused", async () => {
  await assert.rejects(readXlsx(new Uint8Array([1, 2, 3])), /NOT_ZIP/);
  await assert.rejects(readZip(deflatedZip({ "a.txt": "x".repeat(2000) }), 1000), /UNPACKED_TOO_LARGE/);
  // A bomb: it says one byte and unpacks into megabytes; unpacking stops at the declared size.
  await assert.rejects(readZip(deflatedZip({ "a.txt": "x".repeat(5_000_000) }, 1), 1000), /BROKEN_ZIP/);
  const bytes = deflatedZip({ "a.txt": "hello" });
  bytes[30 + "a.txt".length] ^= 0xff;
  await assert.rejects(readZip(bytes, 1000));
});
