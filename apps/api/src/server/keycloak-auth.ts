import type { Express, Request } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import { recordAuditEvent } from '../services/audit.js';
import { AUTH_COOKIE_SECURE, createSession } from './auth.js';
import { logEvent } from './logger.js';

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
};

type TokenResponse = {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type KeycloakProfile = {
  email: string;
  name: string;
};

const keycloakStateCookieName = process.env.KEYCLOAK_STATE_COOKIE_NAME ?? 'pms_keycloak_state';
const defaultRedirectPath = '/';

let discoveryCache: { endpoint: string; value: OidcDiscovery; expiresAt: number } | null = null;

function keycloakConfig() {
  const discoveryEndpoint = process.env.KEYCLOAK_OIDCS_DISCOVERY_ENDPOINT?.trim();
  const clientId = process.env.KEYCLOAK_CLIENT_ID?.trim();
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET?.trim();
  const hostname = process.env.KEYCLOAK_HOSTNAME?.trim();
  return {
    discoveryEndpoint,
    clientId,
    clientSecret,
    hostname,
    enabled: Boolean(discoveryEndpoint && clientId && clientSecret),
  };
}

export function isKeycloakEnabled() {
  return keycloakConfig().enabled;
}

function externalBaseUrl(req: Request) {
  const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol;
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host');
  return `${proto}://${host}`;
}

function callbackUrl(req: Request) {
  return `${externalBaseUrl(req)}/api/auth/keycloak/callback`;
}

function safeRedirectPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return defaultRedirectPath;
  }
  return value;
}

function stateCookie(value: string, maxAgeSeconds: number) {
  const parts = [
    `${keycloakStateCookieName}=${encodeURIComponent(value)}`,
    'Path=/api/auth/keycloak',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    'SameSite=Lax',
  ];
  if (AUTH_COOKIE_SECURE) parts.push('Secure');
  return parts.join('; ');
}

function clearStateCookie() {
  const parts = [
    `${keycloakStateCookieName}=`,
    'Path=/api/auth/keycloak',
    'HttpOnly',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'SameSite=Lax',
  ];
  if (AUTH_COOKIE_SECURE) parts.push('Secure');
  return parts.join('; ');
}

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const item of header.split(';')) {
    const [rawName, ...rawValue] = item.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }
  return null;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split('.');
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeProfile(value: Record<string, unknown> | null): KeycloakProfile | null {
  if (!value) return null;
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
  if (!email) return null;
  const nameCandidates = [value.name, value.preferred_username, value.given_name]
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return { email, name: nameCandidates[0] ?? email };
}

async function loadDiscovery(endpoint: string) {
  if (discoveryCache?.endpoint === endpoint && discoveryCache.expiresAt > Date.now()) {
    return discoveryCache.value;
  }
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Keycloak discovery failed: HTTP ${response.status}`);
  }
  const value = (await response.json()) as Partial<OidcDiscovery>;
  if (!value.authorization_endpoint || !value.token_endpoint) {
    throw new Error('Keycloak discovery response does not include OIDC endpoints');
  }
  const discovery: OidcDiscovery = {
    authorization_endpoint: value.authorization_endpoint,
    token_endpoint: value.token_endpoint,
    userinfo_endpoint: value.userinfo_endpoint,
  };
  discoveryCache = { endpoint, value: discovery, expiresAt: Date.now() + 5 * 60 * 1000 };
  return discovery;
}

async function exchangeCode(req: Request, code: string, discovery: OidcDiscovery) {
  const { clientId, clientSecret } = keycloakConfig();
  if (!clientId || !clientSecret) {
    throw new Error('Keycloak client credentials are not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl(req),
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const token = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || token.error) {
    const message = token.error_description || token.error || `HTTP ${response.status}`;
    throw new Error(`Keycloak token exchange failed: ${message}`);
  }
  return token;
}

async function loadUserInfo(discovery: OidcDiscovery, accessToken: string) {
  if (!discovery.userinfo_endpoint) return null;
  const response = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return (await response.json()) as Record<string, unknown>;
}

async function profileFromToken(discovery: OidcDiscovery, token: TokenResponse) {
  const idTokenProfile = normalizeProfile(token.id_token ? decodeJwtPayload(token.id_token) : null);
  if (idTokenProfile) return idTokenProfile;
  if (token.access_token) {
    const userInfoProfile = normalizeProfile(await loadUserInfo(discovery, token.access_token));
    if (userInfoProfile) return userInfoProfile;
  }
  throw new Error('Keycloak profile does not include email');
}

async function upsertKeycloakUser(profile: KeycloakProfile) {
  const lastLoginAt = new Date();
  const existing = await prisma.user.findUnique({ where: { email: profile.email } });
  const activeAdminCount = await prisma.user.count({
    where: { role: 'ADMIN', isActive: true },
  });
  const shouldBootstrapAdmin = activeAdminCount === 0;
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: existing.name?.trim() ? existing.name : profile.name,
        role: shouldBootstrapAdmin ? 'ADMIN' : existing.role,
        isActive: true,
        lastLoginAt,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
      },
    });
  }
  return prisma.user.create({
    data: {
      email: profile.email,
      name: profile.name,
      role: shouldBootstrapAdmin ? 'ADMIN' : 'EXECUTIVE_VIEWER',
      isActive: true,
      lastLoginAt,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
    },
  });
}

export function registerKeycloakAuthRoutes(app: Express) {
  app.get('/api/auth/keycloak/status', (_req, res) => {
    const config = keycloakConfig();
    res.json({ enabled: config.enabled, hostname: config.hostname ?? null });
  });

  app.get('/api/auth/keycloak/login', async (req, res, next) => {
    try {
      const config = keycloakConfig();
      if (!config.enabled || !config.discoveryEndpoint || !config.clientId) {
        res.status(503).json({ error: 'Keycloak не настроен' });
        return;
      }

      const discovery = await loadDiscovery(config.discoveryEndpoint);
      const state = randomBytes(24).toString('base64url');
      const redirectPath = safeRedirectPath(req.query.redirect);
      const stateValue = Buffer.from(JSON.stringify({ state, redirectPath })).toString('base64url');
      const authorizationUrl = new URL(discovery.authorization_endpoint);
      authorizationUrl.searchParams.set('client_id', config.clientId);
      authorizationUrl.searchParams.set('redirect_uri', callbackUrl(req));
      authorizationUrl.searchParams.set('response_type', 'code');
      authorizationUrl.searchParams.set('scope', 'openid email profile');
      authorizationUrl.searchParams.set('state', state);

      res.setHeader('Set-Cookie', stateCookie(stateValue, 10 * 60));
      res.redirect(authorizationUrl.toString());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/keycloak/callback', async (req, res, next) => {
    try {
      const config = keycloakConfig();
      if (!config.enabled || !config.discoveryEndpoint) {
        res.status(503).send('Keycloak is not configured');
        return;
      }

      const rawCookie = readCookie(req, keycloakStateCookieName);
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (!rawCookie || !code || !state) {
        res.status(400).send('Invalid Keycloak callback');
        return;
      }

      const parsedState = JSON.parse(Buffer.from(rawCookie, 'base64url').toString('utf8')) as {
        state?: unknown;
        redirectPath?: unknown;
      };
      if (typeof parsedState.state !== 'string' || !safeEqual(parsedState.state, state)) {
        res.status(400).send('Invalid Keycloak state');
        return;
      }

      const discovery = await loadDiscovery(config.discoveryEndpoint);
      const token = await exchangeCode(req, code, discovery);
      const profile = await profileFromToken(discovery, token);
      const user = await upsertKeycloakUser(profile);
      await createSession(user.id, req, res);
      res.append('Set-Cookie', clearStateCookie());
      await recordAuditEvent({
        req,
        actor: user,
        action: 'auth.keycloak_login',
        objectType: 'User',
        objectId: user.id,
        metadata: { email: user.email },
      });
      res.redirect(safeRedirectPath(parsedState.redirectPath));
    } catch (error) {
      logEvent('error', 'auth.keycloak_callback_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  });
}
