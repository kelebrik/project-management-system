import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthPage } from "./AuthPage";

test("authentication page offers password login and optional Keycloak SSO", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(
    React.createElement(AuthPage, {
      error: null,
      keycloakEnabled: true,
      onKeycloakLogin: () => undefined,
      onPasswordLogin: async () => undefined,
    }),
  );

  assert.match(html, /Войти через SSO/);
  assert.match(html, /Управление проектами/);
  assert.match(html, /lucide-clipboard-check/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /Система УП|Контур управления/);
  assert.match(html, /type="password"/);
  assert.match(html, /type="email"/);
  assert.doesNotMatch(html, /Продолжить только просмотр/);
  assert.match(html, /<form/);
});

test("authentication page keeps password login when Keycloak is not configured", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(
    React.createElement(AuthPage, {
      error: null,
      keycloakEnabled: false,
      onKeycloakLogin: () => undefined,
      onPasswordLogin: async () => undefined,
    }),
  );

  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /Войти через SSO|Keycloak не настроен/);
});
