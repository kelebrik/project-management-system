import { Prisma } from '@prisma/client';
import type { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import { emitWebhookEvent } from '../../services/webhooks.js';
import { integrationSettings } from './defaults.js';
import {
  apiTokenPatchSchema,
  apiTokenSchema,
  webhookEndpointPatchSchema,
  webhookEndpointSchema,
} from './schemas.js';
import { adminSettingResponse, ensureAdminConfigDefaults } from './system.js';
import type { AdminRoutesContext } from './types.js';

function hashApiToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function apiTokenResponse(token: {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: Prisma.JsonValue;
  isActive: boolean;
  rateLimitPerMinute: number;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...token,
    scopes: Array.isArray(token.scopes) ? token.scopes : [],
  };
}

function webhookEndpointResponse(endpoint: {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: Prisma.JsonValue;
  isActive: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...endpoint,
    secret: endpoint.secret ? '' : null,
    hasSecret: Boolean(endpoint.secret),
    events: Array.isArray(endpoint.events) ? endpoint.events : [],
  };
}

export function registerAdminIntegrationRoutes(router: Router, context: AdminRoutesContext) {
  const { requireAdmin, currentUser } = context;

  router.get('/admin/integrations', requireAdmin, async (_req, res) => {
    await ensureAdminConfigDefaults();
    const [apiTokens, webhookEndpoints, webhookDeliveries, settings] = await Promise.all([
      prisma.apiToken.findMany({
        orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
        take: 100,
      }),
      prisma.webhookEndpoint.findMany({
        orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
        take: 100,
      }),
      prisma.webhookDelivery.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { endpoint: { select: { name: true } } },
      }),
      prisma.systemSetting.findMany({
        where: {
          key: {
            in: integrationSettings.map(([key]) => key),
          },
        },
        orderBy: { key: 'asc' },
      }),
    ]);

    res.json({
      apiTokens: apiTokens.map(apiTokenResponse),
      webhookEndpoints: webhookEndpoints.map(webhookEndpointResponse),
      webhookDeliveries,
      integrationSettings: settings.map(adminSettingResponse),
    });
  });

  router.post('/admin/api-tokens', requireAdmin, async (req, res) => {
    const parsed = apiTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const plainToken = `pms_${randomBytes(32).toString('base64url')}`;
    const token = await prisma.apiToken.create({
      data: {
        name: parsed.data.name,
        tokenHash: hashApiToken(plainToken),
        tokenPrefix: plainToken.slice(0, 12),
        scopes: parsed.data.scopes,
        rateLimitPerMinute: parsed.data.rateLimitPerMinute,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        createdById: currentUser(req)?.id ?? null,
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.api_token.create',
      objectType: 'ApiToken',
      objectId: token.id,
      afterValue: apiTokenResponse(token),
    });
    res.status(201).json({
      ...apiTokenResponse(token),
      token: plainToken,
    });
  });

  router.patch('/admin/api-tokens/:tokenId', requireAdmin, async (req, res) => {
    const parsed = apiTokenPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const tokenId = Array.isArray(req.params.tokenId) ? req.params.tokenId[0] : req.params.tokenId;
    if (!tokenId) {
      res.status(400).json({ error: 'API-токен не указан' });
      return;
    }
    const before = await prisma.apiToken.findUnique({ where: { id: tokenId } });
    if (!before) {
      res.status(404).json({ error: 'API-токен не найден' });
      return;
    }
    const updated = await prisma.apiToken.update({
      where: { id: tokenId },
      data: {
        name: parsed.data.name,
        scopes: parsed.data.scopes,
        rateLimitPerMinute: parsed.data.rateLimitPerMinute,
        expiresAt:
          parsed.data.expiresAt === undefined
            ? undefined
            : parsed.data.expiresAt
              ? new Date(parsed.data.expiresAt)
              : null,
        isActive: parsed.data.isActive,
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.api_token.update',
      objectType: 'ApiToken',
      objectId: updated.id,
      beforeValue: apiTokenResponse(before),
      afterValue: apiTokenResponse(updated),
    });
    res.json(apiTokenResponse(updated));
  });

  router.delete('/admin/api-tokens/:tokenId', requireAdmin, async (req, res) => {
    const tokenId = Array.isArray(req.params.tokenId) ? req.params.tokenId[0] : req.params.tokenId;
    if (!tokenId) {
      res.status(400).json({ error: 'API-токен не указан' });
      return;
    }
    const before = await prisma.apiToken.findUnique({ where: { id: tokenId } });
    if (!before) {
      res.status(404).json({ error: 'API-токен не найден' });
      return;
    }
    const updated = await prisma.apiToken.update({
      where: { id: tokenId },
      data: { isActive: false },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.api_token.disable',
      objectType: 'ApiToken',
      objectId: updated.id,
      beforeValue: apiTokenResponse(before),
      afterValue: apiTokenResponse(updated),
    });
    res.json(apiTokenResponse(updated));
  });

  router.post('/admin/webhooks', requireAdmin, async (req, res) => {
    const parsed = webhookEndpointSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        name: parsed.data.name,
        url: parsed.data.url,
        secret: parsed.data.secret || null,
        events: parsed.data.events,
        isActive: parsed.data.isActive,
        createdById: currentUser(req)?.id ?? null,
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.webhook.create',
      objectType: 'WebhookEndpoint',
      objectId: endpoint.id,
      afterValue: webhookEndpointResponse(endpoint),
    });
    res.status(201).json(webhookEndpointResponse(endpoint));
  });

  router.patch('/admin/webhooks/:endpointId', requireAdmin, async (req, res) => {
    const parsed = webhookEndpointPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const endpointId = Array.isArray(req.params.endpointId)
      ? req.params.endpointId[0]
      : req.params.endpointId;
    if (!endpointId) {
      res.status(400).json({ error: 'Webhook не указан' });
      return;
    }
    const before = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
    if (!before) {
      res.status(404).json({ error: 'Webhook не найден' });
      return;
    }
    const endpoint = await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: {
        name: parsed.data.name,
        url: parsed.data.url,
        secret: parsed.data.secret === undefined ? undefined : parsed.data.secret || null,
        events: parsed.data.events,
        isActive: parsed.data.isActive,
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.webhook.update',
      objectType: 'WebhookEndpoint',
      objectId: endpoint.id,
      beforeValue: webhookEndpointResponse(before),
      afterValue: webhookEndpointResponse(endpoint),
    });
    res.json(webhookEndpointResponse(endpoint));
  });

  router.delete('/admin/webhooks/:endpointId', requireAdmin, async (req, res) => {
    const endpointId = Array.isArray(req.params.endpointId)
      ? req.params.endpointId[0]
      : req.params.endpointId;
    if (!endpointId) {
      res.status(400).json({ error: 'Webhook не указан' });
      return;
    }
    const before = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
    if (!before) {
      res.status(404).json({ error: 'Webhook не найден' });
      return;
    }
    const endpoint = await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: { isActive: false },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.webhook.disable',
      objectType: 'WebhookEndpoint',
      objectId: endpoint.id,
      beforeValue: webhookEndpointResponse(before),
      afterValue: webhookEndpointResponse(endpoint),
    });
    res.json(webhookEndpointResponse(endpoint));
  });

  router.post('/admin/webhooks/:endpointId/test', requireAdmin, async (req, res) => {
    const endpointId = Array.isArray(req.params.endpointId)
      ? req.params.endpointId[0]
      : req.params.endpointId;
    if (!endpointId) {
      res.status(400).json({ error: 'Webhook не указан' });
      return;
    }
    const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
    if (!endpoint) {
      res.status(404).json({ error: 'Webhook не найден' });
      return;
    }
    await emitWebhookEvent({
      eventType: 'system.webhook.test',
      payload: {
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        triggeredBy: currentUser(req)?.email ?? 'api-token',
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.webhook.test',
      objectType: 'WebhookEndpoint',
      objectId: endpoint.id,
    });
    res.json({ ok: true });
  });
}
