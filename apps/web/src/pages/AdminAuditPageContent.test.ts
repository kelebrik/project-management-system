import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminAuditPageContent } from "./AdminAuditPageContent";
import { PageContextProvider } from "./PageContext";
import { I18nProvider } from "../i18n/I18nProvider";

test("audit page renders field changes without a formatter in page context", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { initialLocale: "ru", children: React.createElement(PageContextProvider,
      {
        value: {
          auditActionLabel: (action: string) => action,
          auditEvents: [
            {
              id: "event-1",
              action: "wbs_item.update",
              actorName: "User",
              actorEmail: null,
              objectType: "WbsItem",
              objectId: "item-1",
              ipAddress: null,
              createdAt: "2026-08-04T11:33:48.489Z",
              changes: [
                {
                  id: "change-1",
                  field: "status",
                  oldText: "IN_PROGRESS",
                  newText: "DONE",
                },
              ],
            },
          ],
          auditObjectLabel: () => "Элемент Структуры",
          dateTime: (value: string) => value,
          reloadAuditEvents: () => undefined,
        },
        children: React.createElement(AdminAuditPageContent),
      }) },
    ),
  );

  assert.match(html, /Статус/);
  assert.match(html, /IN_PROGRESS/);
  assert.match(html, /DONE/);
});

test("audit page shows English labels in the English interface", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(
    React.createElement(I18nProvider, {
      initialLocale: "en",
      children: React.createElement(PageContextProvider, {
        value: {
          auditEvents: [
            {
              id: "event-1",
              action: "project.update",
              actorName: "User",
              actorEmail: null,
              objectType: "Project",
              projectId: "project-1",
              objectId: "project-1",
              ipAddress: null,
              createdAt: "2026-09-22T10:09:00.000Z",
              changes: [{ id: "change-1", field: "status", oldText: null, newText: "ACTIVE" }],
              wbsTombstone: { id: "t-1", restoredAt: null, itemCount: 2, expiresAt: "2026-10-22T10:09:00.000Z" },
            },
          ],
          dateTime: (value: string) => value,
          reloadAuditEvents: () => undefined,
          restoreWbsTombstone: () => undefined,
        },
        children: React.createElement(AdminAuditPageContent),
      }),
    }),
  );

  assert.match(html, /Project updated/);
  assert.match(html, /Status/);
  assert.match(html, /not set/);
  assert.match(html, /Items deleted: 2/);
  assert.doesNotMatch(html, /[А-Яа-яЁё]/);
});
