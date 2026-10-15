import assert from "node:assert/strict";
import test from "node:test";
import { insertOnEnter, parseChecklist, startEditing, textToSave, toggleItem } from "./checklistText";

test("a comment reads as items and plain lines; a comment written before is plain text", () => {
  assert.deepEqual(parseChecklist("☐ Согласовать платы\n☑ Получить образцы\nПримечание\n\n☐"), [
    { kind: "item", done: false, text: "Согласовать платы" },
    { kind: "item", done: true, text: "Получить образцы" },
    { kind: "text", text: "Примечание" },
    { kind: "text", text: "" },
    // A trailing "☐ " saved trimmed is still an item.
    { kind: "item", done: false, text: "" },
  ]);
  assert.deepEqual(parseChecklist("Обычный комментарий"), [{ kind: "text", text: "Обычный комментарий" }]);
  // A mark inside a line, or one stuck to a word, is text.
  assert.deepEqual(parseChecklist("см. ☐ ниже\n☐x"), [{ kind: "text", text: "см. ☐ ниже" }, { kind: "text", text: "☐x" }]);
  assert.deepEqual(parseChecklist(""), []);
});

test("ticking an item changes only its mark, nothing else of the text", () => {
  const text = "☐ Раз\n\n  отступ \n☑ Два";
  assert.equal(toggleItem(text, 0), "☑ Раз\n\n  отступ \n☑ Два");
  assert.equal(toggleItem(text, 3), "☐ Раз\n\n  отступ \n☐ Два");
  // A plain line or no line: unchanged.
  assert.equal(toggleItem(text, 2), text);
  assert.equal(toggleItem(text, 9), text);
});

test("Enter adds an item, Shift+Enter a plain line, Enter on an empty item leaves the list", () => {
  // At the end of an item.
  assert.deepEqual(insertOnEnter("☐ Раз", 5, 5, false), { value: "☐ Раз\n☐ ", caret: 8 });
  // In the middle of an item: the rest goes to the new one.
  assert.deepEqual(insertOnEnter("☐ Раздва", 5, 5, false), { value: "☐ Раз\n☐ два", caret: 8 });
  // After a plain line, Enter also starts an item.
  assert.deepEqual(insertOnEnter("Текст", 5, 5, false), { value: "Текст\n☐ ", caret: 8 });
  assert.deepEqual(insertOnEnter("☐ Раз", 5, 5, true), { value: "☐ Раз\n", caret: 6 });
  // On an empty item, open or done, the mark goes.
  assert.deepEqual(insertOnEnter("☐ Раз\n☐ ", 8, 8, false), { value: "☐ Раз\n", caret: 6 });
  assert.deepEqual(insertOnEnter("☐ Раз\n☑ \n☐ Три", 8, 8, false), { value: "☐ Раз\n\n☐ Три", caret: 6 });
  // A selection over lines is replaced by the new item.
  assert.deepEqual(insertOnEnter("☐ Раз\n☐ Два", 3, 9, false), { value: "☐ Р\n☐ ва", caret: 6 });
});

test("an empty comment starts as an item, and a comment of empty items is saved as none", () => {
  assert.equal(startEditing(""), "☐ ");
  assert.equal(startEditing("  "), "☐ ");
  assert.equal(startEditing("Было"), "Было");
  assert.equal(textToSave("☐ "), "");
  assert.equal(textToSave("☐ \n☐"), "");
  assert.equal(textToSave("☐ Раз"), "☐ Раз");
});

test("marks inside text are text, and a comment written on Windows reads the same", () => {
  // Saving keeps text made of the marks themselves.
  assert.equal(textToSave("☐☑"), "☐☑");
  assert.equal(textToSave("☐ ☑"), "☐ ☑");
  assert.equal(textToSave("\n\n"), "");
  const windows = "☐ Раз\r\n☑ Два\r\nТекст";
  assert.deepEqual(parseChecklist(windows), [
    { kind: "item", done: false, text: "Раз" },
    { kind: "item", done: true, text: "Два" },
    { kind: "text", text: "Текст" },
  ]);
  // Ticking keeps the line ends as they were.
  assert.equal(toggleItem(windows, 0), "☑ Раз\r\n☑ Два\r\nТекст");
});
