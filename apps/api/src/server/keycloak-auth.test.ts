import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';

import type { PrismaClient } from '@prisma/client';
import { prismaClientProvider } from '../db.js';
import { completeKeycloakSignIn, externalBaseUrl, keycloakUserRole, upsertKeycloakUser } from './keycloak-auth.js';

test('first Keycloak user becomes the system administrator', () => {
  assert.equal(keycloakUserRole(null, 0), 'ADMIN');
  assert.equal(keycloakUserRole('EXECUTIVE_VIEWER', 0), 'ADMIN');
});

test('later Keycloak users keep their provisioned role or get the viewer role', () => {
  assert.equal(keycloakUserRole('PROJECT_MANAGER', 1), 'PROJECT_MANAGER');
  assert.equal(keycloakUserRole(null, 1), 'EXECUTIVE_VIEWER');
});

function requestWithHeaders(headers: Record<string, string>, protocol = 'http') {
  return {
    protocol,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

test('external Keycloak callback URL uses https even behind an http proxy hop', () => {
  const previousPublicUrl = process.env.PUBLIC_APP_URL;
  const previousBaseUrl = process.env.APP_BASE_URL;
  delete process.env.PUBLIC_APP_URL;
  delete process.env.APP_BASE_URL;
  try {
    const baseUrl = externalBaseUrl(
      requestWithHeaders({
        host: 'nt-starosfw-tvmanagement-adv-msk01.sberdevices.ru',
        'x-forwarded-proto': 'http',
      }),
    );

    assert.equal(
      baseUrl,
      'https://nt-starosfw-tvmanagement-adv-msk01.sberdevices.ru',
    );
  } finally {
    if (previousPublicUrl === undefined) {
      delete process.env.PUBLIC_APP_URL;
    } else {
      process.env.PUBLIC_APP_URL = previousPublicUrl;
    }
    if (previousBaseUrl === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = previousBaseUrl;
    }
  }
});

async function upsertWith(existing: Record<string, unknown> | null) {
  const updates: unknown[] = [];
  const creates: unknown[] = [];
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () =>
    ({
      user: {
        findUnique: async () => existing,
        count: async () => 0,
        update: async (args: any) => {
          updates.push(args.data);
          return { ...existing, ...args.data };
        },
        create: async (args: any) => {
          creates.push(args.data);
          return { id: 'new', ...args.data };
        },
      },
    }) as unknown as PrismaClient;
  try {
    const user = await upsertKeycloakUser({ email: 'a@example.test', name: 'A' } as any);
    return { user, updates, creates };
  } finally {
    prismaClientProvider.get = previous;
  }
}

test('a Keycloak sign-in does not switch a disabled user back on or touch the account', async () => {
  const disabled = { id: 'u1', email: 'a@example.test', name: 'A', role: 'EXECUTIVE_VIEWER', isActive: false, lastLoginAt: null };
  const { user, updates } = await upsertWith(disabled);
  assert.equal(user.isActive, false);
  // Not even with no active administrators left does a disabled account become one.
  assert.equal(user.role, 'EXECUTIVE_VIEWER');
  assert.deepEqual(updates, []);
});

test('an active user keeps being active and a new user is created active', async () => {
  const active = { id: 'u1', email: 'a@example.test', name: 'A', role: 'PROJECT_MANAGER', isActive: true, lastLoginAt: null };
  const kept = await upsertWith(active);
  assert.equal(kept.user.isActive, true);
  assert.equal((kept.updates[0] as any).isActive, undefined);
  const created = await upsertWith(null);
  assert.equal((created.creates[0] as any).isActive, true);
});

function signInResponse() {
  const cookies: string[] = [];
  return {
    cookies,
    statusCode: 200,
    body: '' as unknown,
    redirectedTo: '',
    append(name: string, value: string) {
      if (name === 'Set-Cookie') cookies.push(value);
      return this;
    },
    removeHeader(name: string) {
      if (name === 'Set-Cookie') cookies.length = 0;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    type() {
      return this;
    },
    send(value: unknown) {
      this.body = value;
      return this;
    },
    redirect(path: string) {
      this.redirectedTo = path;
    },
  };
}

async function signIn(user: Record<string, unknown>, stillActive: boolean | Error = true, closeFails = false) {
  const audits: string[] = [];
  const sessions: string[] = [];
  const closed: string[] = [];
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () =>
    ({
      auditEvent: { create: async (args: any) => audits.push(args.data.action) },
      auditFieldChange: { createMany: async () => ({}) },
    }) as unknown as PrismaClient;
  const res = signInResponse();
  try {
    await completeKeycloakSignIn({
      user: user as any,
      req: { get: () => undefined, headers: {} } as unknown as Request,
      res: res as any,
      redirectPath: '/portfolio',
      // Like createSession, which sets (not appends) the cookie header.
      openSession: (async (userId: string, _req: unknown, response: any) => {
        sessions.push(userId);
        response.cookies.length = 0;
        response.cookies.push('pms_session=abc');
      }) as any,
      stillActive: async () => {
        if (stillActive instanceof Error) throw stillActive;
        return stillActive;
      },
      closeSessions: async (userId) => {
        closed.push(userId);
        if (closeFails) throw new Error('database down');
      },
    });
  } catch {
    // The route hands errors to the app's error handler; what matters is the cookie.
  } finally {
    prismaClientProvider.get = previous;
  }
  return { res, audits, sessions, closed };
}

test('a switched-off account gets no session, a 403 and a refusal in the audit log', async () => {
  const { res, audits, sessions } = await signIn({ id: 'u1', email: 'a@example.test', isActive: false });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(sessions, []);
  assert.deepEqual(audits, ['auth.keycloak_login_refused']);
  assert.ok(res.cookies.some((cookie) => /Max-Age=0/i.test(cookie)), 'the state cookie is cleared');
  assert.equal(res.redirectedTo, '');
});

test('an account switched off while signing in loses the new session', async () => {
  const { res, audits, sessions, closed } = await signIn({ id: 'u1', email: 'a@example.test', isActive: true }, false);
  assert.deepEqual(sessions, ['u1']);
  assert.deepEqual(closed, ['u1']);
  assert.equal(res.statusCode, 403);
  assert.ok(!res.cookies.includes('pms_session=abc'), 'the session cookie is not sent');
  assert.deepEqual(audits, ['auth.keycloak_login_refused']);
});

test('an active account signs in and is redirected', async () => {
  const { res, audits, sessions } = await signIn({ id: 'u1', email: 'a@example.test', isActive: true });
  assert.deepEqual(sessions, ['u1']);
  assert.deepEqual(audits, ['auth.keycloak_login']);
  assert.equal(res.redirectedTo, '/portfolio');
  // Both the session and the cleared state cookie reach the browser.
  assert.ok(res.cookies.includes('pms_session=abc'));
  assert.ok(res.cookies.some((cookie) => /Max-Age=0/i.test(cookie)));
});

test('a failing recheck or cleanup never lets the session cookie out', async () => {
  const recheckFails = await signIn({ id: 'u1', email: 'a@example.test', isActive: true }, new Error('database down'));
  assert.ok(!recheckFails.res.cookies.includes('pms_session=abc'));
  assert.equal(recheckFails.res.redirectedTo, '');
  assert.equal(recheckFails.res.statusCode, 403);
  assert.deepEqual(recheckFails.closed, ['u1']);
  assert.deepEqual(recheckFails.audits, ['auth.keycloak_login_refused']);
  const cleanupFails = await signIn({ id: 'u1', email: 'a@example.test', isActive: true }, false, true);
  assert.ok(!cleanupFails.res.cookies.includes('pms_session=abc'));
  assert.equal(cleanupFails.res.statusCode, 403);
  assert.deepEqual(cleanupFails.audits, ['auth.keycloak_login_refused']);
});
