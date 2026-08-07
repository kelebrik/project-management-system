import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarIdentity } from "./SidebarIdentity";

test("application header uses the product name and plan icon", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(
    React.createElement(SidebarIdentity, {
      currentUser: null,
      onLogin: () => undefined,
      onLogout: () => undefined,
    }),
  );

  assert.match(html, /Управление проектами/);
  assert.match(html, /lucide-clipboard-check/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /Система УП|Контур управления/);
});
