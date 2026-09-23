import assert from "node:assert/strict";
import test from "node:test";
import { auditLabelCatalog, createAuditLabels } from "./auditLabels";

test("every English audit label is free of Russian text", () => {
  for (const [group, labels] of Object.entries(auditLabelCatalog)) {
    for (const [key, label] of Object.entries(labels)) {
      assert.doesNotMatch(label.en, /[А-Яа-яЁё]/, `${group}.${key}`);
      assert.ok(label.ru, `${group}.${key} has a Russian label`);
    }
  }
});

test("audit labels follow the interface language", () => {
  const en = createAuditLabels("en");
  const ru = createAuditLabels("ru");
  assert.equal(en.auditActionLabel("issue.thread_link.create"), "Thread link added");
  assert.equal(ru.auditActionLabel("issue.thread_link.create"), "Добавление ссылки на тред");
  assert.equal(en.auditObjectLabel({ objectType: "WebhookEndpoint", projectId: null }), "Webhook");
  assert.equal(en.auditFieldLabel("uiState"), "Project view");
  assert.equal(en.auditActionLabel("unknown.action"), "unknown.action");
});
