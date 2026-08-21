import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthPage } from "./AuthPage";

test("authentication page offers only Keycloak SSO", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(
    React.createElement(AuthPage, {
      error: null,
      keycloakEnabled: true,
      keycloakStatusResolved: true,
      onKeycloakLogin: () => undefined,
    }),
  );

  assert.match(html, /Войти через SSO/);
  assert.match(html, /Управление проектами/);
  assert.match(html, /lucide-clipboard-check/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /Система УП|Контур управления/);
  assert.doesNotMatch(html, /type="password"/);
  assert.doesNotMatch(html, /Продолжить только просмотр/);
  assert.doesNotMatch(html, /<form/);
});

test("authentication page blocks login when Keycloak is not configured", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(
    React.createElement(AuthPage, {
      error: null,
      keycloakEnabled: false,
      keycloakStatusResolved: true,
      onKeycloakLogin: () => undefined,
    }),
  );

  assert.match(html, /disabled/);
  assert.match(html, /Keycloak не настроен/);
});
