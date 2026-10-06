import { Router, type Request, type Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { PUBLIC_DEMO_USER_ID, pageDocumentSchema, pagePeriods, pageScopeSchema, pageWidgetSchema, type PageDocument } from '@pms/shared';
import { prisma } from '../db.js';
import { currentUser, isPublicDemoMode } from '../server/auth.js';
import { readableProjectWhere } from '../server/business-units.js';
import { PAGE_QUERY_LIMIT, pageScopeProjects, runPageQueries } from '../services/pages/query.js';

/**
 * "My page" (in Development for now): a person's own pages and the answers
 * for their widgets. Pages are read and written by their owner only; someone
 * else's page is "not found". While the tool lives in Development it is open
 * to administrators; the public demo may look at templates and try a page
 * without saving it.
 */

export const PAGES_PER_PERSON = 50;
const DOCUMENT_MAX_BYTES = 150_000;
export const PAGE_QUERIES_PER_MINUTE = 120;

const titleSchema = z.string().trim().min(1, 'Назовите страницу').max(120);
const createSchema = z.object({ title: titleSchema, document: pageDocumentSchema });
const patchSchema = z.object({ title: titleSchema.optional(), document: pageDocumentSchema.optional(), expectedRevision: z.number().int().min(1) });
const querySchema = z.object({
  scope: pageScopeSchema,
  periodDays: z.number().int().refine((value) => (pagePeriods as readonly number[]).includes(value)),
  fresh: z.boolean().optional(),
  queries: z
    .array(z.object({ id: z.string().min(1).max(40), widget: pageWidgetSchema.pick({ type: true, data: true }), scope: pageScopeSchema.optional() }))
    .max(PAGE_QUERY_LIMIT),
});

type Access = { userId: string; canSave: boolean } | null;

/** Who may use the pages: administrators fully, the public demo without saving. */
function pagesAccess(req: Request, res: Response): Access {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return null;
  }
  if (isPublicDemoMode() && user.id === PUBLIC_DEMO_USER_ID) return { userId: user.id, canSave: false };
  if (user.role !== 'ADMIN') {
    res.status(403).json({ error: '«Моя страница» пока в разделе «Разработка» и открыта администраторам' });
    return null;
  }
  return { userId: user.id, canSave: true };
}

function savingAccess(req: Request, res: Response) {
  const access = pagesAccess(req, res);
  if (!access) return null;
  if (!access.canSave) {
    res.status(403).json({ error: 'В демо-режиме страницу можно собрать и посмотреть, но не сохранить' });
    return null;
  }
  return access;
}

function documentTooLarge(document: PageDocument) {
  return Buffer.byteLength(JSON.stringify(document)) > DOCUMENT_MAX_BYTES;
}

const pageResponse = (page: { id: string; title: string; document: unknown; revision: number; createdAt: Date; updatedAt: Date }) => ({
  id: page.id,
  title: page.title,
  document: page.document,
  revision: page.revision,
  createdAt: page.createdAt.toISOString(),
  updatedAt: page.updatedAt.toISOString(),
});

export function createPagesRouter() {
  const router = Router();
  const perUser = rateLimit({
    windowMs: 60_000,
    limit: PAGE_QUERIES_PER_MINUTE,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req: Request) => currentUser(req)?.id ?? ipKeyGenerator(req.ip ?? ''),
    message: { error: 'Слишком много запросов данных страницы. Повторите через минуту.' },
  });

  router.get('/pages', async (req, res) => {
    const access = pagesAccess(req, res);
    if (!access) return;
    const pages = access.canSave
      ? await prisma.dashboardPage.findMany({ where: { ownerId: access.userId }, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, document: true, revision: true, createdAt: true, updatedAt: true } })
      : [];
    res.json({ canSave: access.canSave, limit: PAGES_PER_PERSON, pages: pages.map(pageResponse) });
  });

  /** The projects and portfolios a page may be made for. */
  router.get('/pages/scope-options', perUser, async (req, res) => {
    if (!pagesAccess(req, res)) return;
    const projects = await pageScopeProjects(await readableProjectWhere(req), { mode: 'all' });
    res.json({ projects, portfolios: [...new Set(projects.map((project) => project.portfolio).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')) });
  });

  router.post('/pages/query', perUser, async (req, res) => {
    if (!pagesAccess(req, res)) return;
    const body = querySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    res.json(await runPageQueries(await readableProjectWhere(req), body.data));
  });

  router.post('/pages', async (req, res) => {
    const access = savingAccess(req, res);
    if (!access) return;
    const body = createSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    if (documentTooLarge(body.data.document)) {
      res.status(413).json({ error: 'Страница слишком большая' });
      return;
    }
    if ((await prisma.dashboardPage.count({ where: { ownerId: access.userId } })) >= PAGES_PER_PERSON) {
      res.status(409).json({ error: `У вас уже ${PAGES_PER_PERSON} страниц — удалите ненужные` });
      return;
    }
    const page = await prisma.dashboardPage.create({ data: { ownerId: access.userId, title: body.data.title, document: body.data.document } });
    res.status(201).json(pageResponse(page));
  });

  router.get('/pages/:pageId', async (req, res) => {
    const access = savingAccess(req, res);
    if (!access) return;
    const page = await prisma.dashboardPage.findFirst({ where: { id: req.params.pageId, ownerId: access.userId } });
    if (!page) {
      res.status(404).json({ error: 'Страница не найдена' });
      return;
    }
    res.json(pageResponse(page));
  });

  router.patch('/pages/:pageId', async (req, res) => {
    const access = savingAccess(req, res);
    if (!access) return;
    const body = patchSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    if (body.data.document && documentTooLarge(body.data.document)) {
      res.status(413).json({ error: 'Страница слишком большая' });
      return;
    }
    // The revision moves with every save; a save based on an older one is refused, not merged.
    const updated = await prisma.dashboardPage.updateMany({
      where: { id: req.params.pageId, ownerId: access.userId, revision: body.data.expectedRevision },
      data: {
        ...(body.data.title !== undefined ? { title: body.data.title } : {}),
        ...(body.data.document ? { document: body.data.document } : {}),
        revision: { increment: 1 },
      },
    });
    const page = await prisma.dashboardPage.findFirst({ where: { id: req.params.pageId, ownerId: access.userId } });
    if (!page) {
      res.status(404).json({ error: 'Страница не найдена' });
      return;
    }
    if (updated.count === 0) {
      res.status(409).json({ error: 'Страницу изменили в другой вкладке — обновите её', page: pageResponse(page) });
      return;
    }
    res.json(pageResponse(page));
  });

  router.post('/pages/:pageId/duplicate', async (req, res) => {
    const access = savingAccess(req, res);
    if (!access) return;
    const page = await prisma.dashboardPage.findFirst({ where: { id: req.params.pageId, ownerId: access.userId } });
    if (!page) {
      res.status(404).json({ error: 'Страница не найдена' });
      return;
    }
    if ((await prisma.dashboardPage.count({ where: { ownerId: access.userId } })) >= PAGES_PER_PERSON) {
      res.status(409).json({ error: `У вас уже ${PAGES_PER_PERSON} страниц — удалите ненужные` });
      return;
    }
    const copy = await prisma.dashboardPage.create({ data: { ownerId: access.userId, title: `${page.title} (копия)`.slice(0, 120), document: page.document as object } });
    res.status(201).json(pageResponse(copy));
  });

  router.delete('/pages/:pageId', async (req, res) => {
    const access = savingAccess(req, res);
    if (!access) return;
    const deleted = await prisma.dashboardPage.deleteMany({ where: { id: req.params.pageId, ownerId: access.userId } });
    if (deleted.count === 0) {
      res.status(404).json({ error: 'Страница не найдена' });
      return;
    }
    res.status(204).end();
  });

  return router;
}
