import assert from "node:assert/strict";
import test from "node:test";
import { filterCommands, rememberCommand, readRecentCommands, scoreCommand, switchLayout, type PaletteCommand } from "./commandPalette";

const command = (id: string, group: PaletteCommand["group"], label: string, keywords: string[] = []): PaletteCommand => ({ id, group, label, keywords, run: () => undefined });
const commands = [
  command("goto:portfolio", "goto", "Портфель"),
  command("section:project-structure", "sections", "Структура"),
  command("action:new-issue", "actions", "Создать открытый вопрос", ["issue"]),
  command("project:p1", "projects", "CVTE968 · Телевизор"),
];

test("a query matches the label, a word in it, letters in order or a keyword", () => {
  assert.ok(scoreCommand(commands[0]!, "портфель") > scoreCommand(commands[0]!, "порт"));
  assert.ok(scoreCommand(commands[0]!, "пртф") > 0, "letters in order");
  assert.ok(scoreCommand(commands[3]!, "телев") > 0, "a later word");
  assert.ok(scoreCommand(commands[2]!, "issue") > 0, "a keyword");
  assert.equal(scoreCommand(commands[0]!, "xyz"), 0);
});

test("the wrong keyboard layout still finds the command", () => {
  assert.equal(switchLayout("cnhernehf"), "структура");
  assert.equal(switchLayout("ыекгсегкф"), "structura");
  assert.equal(filterCommands(commands, "cnhernehf", [])[0]?.command.id, "section:project-structure");
});

test("without a query recent commands lead, then the groups in their order", () => {
  const entries = filterCommands(commands, "", ["project:p1", "missing"]);
  assert.deepEqual(entries.map((entry) => [entry.group, entry.command.id]), [
    ["recent", "project:p1"],
    ["actions", "action:new-issue"],
    ["sections", "section:project-structure"],
    ["goto", "goto:portfolio"],
  ]);
});

test("recent commands are remembered newest first, without repeats, and survive a broken storage", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
  rememberCommand("a", storage);
  rememberCommand("b", storage);
  assert.deepEqual(rememberCommand("a", storage), ["a", "b"]);
  assert.deepEqual(readRecentCommands({ getItem: () => "{not json" }), []);
});
