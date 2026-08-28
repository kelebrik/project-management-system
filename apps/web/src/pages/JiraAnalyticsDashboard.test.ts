import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { JiraSemanticAggregatePublic, JiraSemanticWidget } from "@pms/shared";

import { JiraWidgetFilters } from "../components/JiraWidgetFilters";

Object.assign(globalThis, { React });

const aggregate = {
  id: "aggregate-issues",
  version: 1,
  publishedVersion: 1,
  draft: null,
  published: {
    name: "Тикеты",
    outputFields: [
      { key: "issueKey", type: "string" },
      { key: "status", type: "string" },
    ],
    asOfSupport: "supported",
  },
} as unknown as JiraSemanticAggregatePublic;

function renderEditor(filterLogic: JiraSemanticWidget["filterLogic"]) {
  const widget = {
    id: "widget-risk",
    title: "Тикеты под риском",
    aggregateId: aggregate.id,
    aggregateVersion: 1,
    placement: "active",
    selectedFields: ["issueKey", "status"],
    filterLogic,
    filters: [
      { id: "filter-1", field: "status", operator: "equals", value: "Open" },
      { id: "filter-2", field: "status", operator: "notEquals", value: "Cancelled" },
      { id: "filter-3", field: "issueKey", operator: "contains", value: "CVTE" },
    ],
    dateField: null,
    asOf: null,
    metric: "count",
    groupBy: "none",
    sortBy: "default",
    sortDirection: "desc",
    visualization: "table",
    width: "half",
  } satisfies JiraSemanticWidget;

  return renderToStaticMarkup(React.createElement(JiraWidgetFilters, {
    widget,
    onChange: () => undefined,
  }));
}

test("widget editor renders one accessible logic connector between every condition", () => {
  const html = renderEditor("and");

  assert.equal((html.match(/class="jira-widget-filter-connector"/g) ?? []).length, 2);
  assert.equal((html.match(/Связь с предыдущим условием: И</g) ?? []).length, 2);
  assert.match(html, /role="group" aria-labelledby="[^"]+"/);
  assert.match(html, /aria-pressed="true">Все \(И\)<\/button>/);
  assert.match(html, /aria-pressed="false">Любое \(ИЛИ\)<\/button>/);
});

test("widget editor connectors follow the selected OR mode", () => {
  const html = renderEditor("or");

  assert.equal((html.match(/Связь с предыдущим условием: ИЛИ</g) ?? []).length, 2);
  assert.match(html, /aria-pressed="false">Все \(И\)<\/button>/);
  assert.match(html, /aria-pressed="true">Любое \(ИЛИ\)<\/button>/);
});
