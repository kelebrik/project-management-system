import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  createWbsImportTemplateBuffer,
  parseWbsImportWorkbook,
  WbsImportValidationError,
} from './wbs-import.js';

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Импорт задач');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test('WBS import template can be parsed back with task rows', () => {
  const template = createWbsImportTemplateBuffer();
  const workbook = XLSX.read(template, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  XLSX.utils.sheet_add_aoa(
    sheet,
    [
      ['Подготовить макеты', 'В работе', '01.07.2026', '03.07.2026'],
      ['Отключенная работа', 'Отменено', '2026-07-04', '2026-07-04'],
    ],
    { origin: 'A2' },
  );
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const rows = parseWbsImportWorkbook(buffer);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.title, 'Подготовить макеты');
  assert.equal(rows[0]?.status, 'IN_PROGRESS');
  assert.equal(rows[0]?.startDate?.toISOString().slice(0, 10), '2026-07-01');
  assert.equal(rows[0]?.dueDate?.toISOString().slice(0, 10), '2026-07-03');
  assert.equal(rows[1]?.status, 'CANCELLED');
});

test('WBS import parser reports row-level validation errors', () => {
  const buffer = workbookBuffer([
    ['Наименование', 'Статус', 'Дата начала', 'Дата окончания'],
    ['', 'В работе', '01.07.2026', '03.07.2026'],
    ['Задача с одной датой', 'Не начата', '01.07.2026', ''],
    ['Задача с неизвестным статусом', 'Новый статус', '', ''],
  ]);

  assert.throws(
    () => parseWbsImportWorkbook(buffer),
    (error) => {
      assert.ok(error instanceof WbsImportValidationError);
      assert.deepEqual(error.errors, [
        'Строка 2: заполните наименование задачи',
        'Строка 3: укажите обе даты или оставьте обе даты пустыми',
        'Строка 4: неизвестный статус "Новый статус"',
      ]);
      return true;
    },
  );
});
