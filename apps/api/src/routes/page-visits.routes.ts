import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { appViewKeys, projectAppViewKeys } from '@pms/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import type { CurrentUser } from '../server/auth.js';
import {
  buildPageVisitAnalyticsReport,
  clampTimezoneOffset,
  pageVisitReportRange,
  pageVisitRetentionCutoff,
  pageVisitRetentionDays,
} from '../services/page-visit-analytics.js';

const pageVisitSchema = z
  .object({
    eventId: z.uuid(),
    anonymousId: z.uuid().optional(),
    pageKey: z.enum(appViewKeys),
    projectId: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
const projectPageKeys = new Set<string>(projectAppViewKeys);
const pruneIntervalMs = 60 * 60 * 1_000;
let nextPruneAt = 0;

type PageVisitsRouterContext = {
  currentUser: (req: Request) => CurrentUser | null;
  requireAdmin: import('express').RequestHandler;
};

function configuredWebOrigins() {
  const configured = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  if (configured === '*') return process.env.NODE_ENV === 'production' ? [] : '*';
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isTrustedPageVisitRequest(req: Request) {
  const allowed = configuredWebOrigins();
  if (allowed === '*') return true;
  const source = req.get('origin') ?? req.get('referer');
  if (!source) return false;
  try {
    const sourceOrigin = new URL(source).origin;
    const requestOrigin = req.host
      ? new URL(`${req.protocol}://${req.host}`).origin
      : null;
    return allowed.includes(sourceOrigin) || sourceOrigin === requestOrigin;
  } catch {
    return false;
  }
}

export function anonymousVisitorHash(anonymousId: string) {
  return createHmac(
    'sha256',
    process.env.ANALYTICS_HASH_SALT ?? 'pms-page-visits-v1',
  )
    .update(anonymousId)
    .digest('hex');
}

export function shouldRecordPageVisit(role: string | null, trustedRequest: boolean) {
  return role !== 'ADMIN' && trustedRequest;
}

async function pruneOldPageVisits(force = false, now = new Date()) {
  if (!force && now.getTime() < nextPruneAt) return;
  nextPruneAt = now.getTime() + pruneIntervalMs;
  await prisma.pageVisit.deleteMany({
    where: { occurredAt: { lt: pageVisitRetentionCutoff(now) } },
  });
}

export function createPageVisitsRouter(context: PageVisitsRouterContext) {
  const router = Router();

  router.post('/page-visits', async (req, res) => {
    const user = context.currentUser(req);
    if (!shouldRecordPageVisit(user?.role ?? null, isTrustedPageVisitRequest(req))) {
      res.status(204).end();
      return;
    }
    const parsed = pageVisitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (!user && !parsed.data.anonymousId) {
      res.status(400).json({ error: 'Не указан анонимный посетитель' });
      return;
    }

    const isProjectPage = projectPageKeys.has(parsed.data.pageKey);
    if (isProjectPage && !parsed.data.projectId) {
      res.status(400).json({ error: 'Для страницы проекта не указан проект' });
      return;
    }
    const project = parsed.data.projectId && isProjectPage
      ? await prisma.project.findUnique({
          where: { id: parsed.data.projectId },
          select: { id: true, code: true, name: true },
        })
      : null;
    if (isProjectPage && !project) {
      res.status(204).end();
      return;
    }

    try {
      await prisma.pageVisit.create({
        data: {
          eventId: parsed.data.eventId,
          actorType: user ? 'USER' : 'ANONYMOUS',
          userId: user?.id ?? null,
          userName: user?.name ?? null,
          anonymousVisitorHash: user
            ? null
            : anonymousVisitorHash(parsed.data.anonymousId as string),
          projectId: project?.id ?? null,
          projectCode: project?.code ?? null,
          projectName: project?.name ?? null,
          pageKey: parsed.data.pageKey,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }
    res.status(204).end();
    void pruneOldPageVisits().catch((error) => {
      console.error('Не удалось очистить старую аналитику посещений', error);
    });
  });

  router.get('/admin/page-visits', context.requireAdmin, async (req, res) => {
    const timezoneOffsetMinutes = clampTimezoneOffset(req.query.timezoneOffsetMinutes);
    const now = new Date();
    const range = pageVisitReportRange(now, timezoneOffsetMinutes);
    await pruneOldPageVisits(true, now);
    const rows = await prisma.pageVisit.findMany({
      where: { occurredAt: { gte: range.from, lt: range.to } },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { occurredAt: 'asc' },
    });
    res.json(
      buildPageVisitAnalyticsReport({
        rows,
        now,
        timezoneOffsetMinutes,
        retentionDays: pageVisitRetentionDays(),
      }),
    );
  });

  return router;
}
