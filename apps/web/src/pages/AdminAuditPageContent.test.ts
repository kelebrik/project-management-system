import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminAuditPageContent } from "./AdminAuditPageContent";
import { PageContextProvider } from "./PageContext";

test("audit page renders field changes without a formatter in page context", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(
    React.createElement(
      PageContextProvider,
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
      },
    ),
  );

  assert.match(html, /Статус/);
  assert.match(html, /IN_PROGRESS/);
  assert.match(html, /DONE/);
});
