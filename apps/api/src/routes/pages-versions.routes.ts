import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { PUBLIC_DEMO_USER_ID, pageDocumentSchema, type PageDocument } from '@pms/shared';
import { prisma } from '../db.js';
import { currentUser, isPublicDemoMode } from '../server/auth.js';
import { readableProjectWhere } from '../server/business-units.js';
import { PageScopeTooLargeError, runPageQueries } from '../services/pages/query.js';

/**
 * Versions, releases and links of "My page". A version is a copy of the page
 * kept on purpose, to go back to. A release is the page as shown at a
 * meeting: the document and the answers of that moment, frozen. A link lets
 * anyone signed in open the page (live, with their own access to projects) or
 * a release (only if they may read every project of it); only the hash of the
 * token is kept, a link can expire and be revoked.
 */

export const PAGE_REVISIONS_KEPT = 30;
export const PAGE_RELEASES_KEPT = 20;
const SHARES_PER_PAGE = 20;
const labelSchema = z.object({ label: z.string().trim().max(120).default('') });
const shareSchema = z.object({ releaseId: z.string().min(1).max(64).nullable().optional(), days: z.number().int().min(1).max(90).nullable().optional() });
const restoreSchema = z.object({ expectedRevision: z.number().int().min(1) });

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** The owner's page, or a reply: only administrators save pages while they are in Development; others' pages are not found. */
async function ownPage(req: Request, res: Response) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return null;
  }
  if (isPublicDemoMode() && user.id === PUBLIC_DEMO_USER_ID) {
    res.status(403).json({ code: 'PAGES_DEMO_READ_ONLY', error: 'В демо-режиме страницу можно собрать и посмотреть, но не сохранить' });
    return null;
  }
  if (user.role !== 'ADMIN') {
    res.status(403).json({ code: 'PAGES_ADMIN_ONLY', error: '«Моя страница» пока в разделе «Разработка» и открыта администраторам' });
    return null;
  }
  const page = await prisma.dashboardPage.findFirst({ where: { id: String(req.params.pageId), ownerId: user.id } });
  if (!page) {
    res.status(404).json({ code: 'PAGE_NOT_FOUND', error: 'Страница не найдена' });
    return null;
  }
  return page;
}

function queriesOf(document: PageDocument) {
  return document.widgets.filter((widget) => widget.data).map((widget) => ({ id: widget.id, widget: { type: widget.type, data: widget.data }, ...(widget.scope ? { scope: widget.scope } : {}) }));
}

const revisionResponse = (row: { id: string; title: string; label: string; createdAt: Date }) => ({ id: row.id, title: row.title, label: row.label, createdAt: row.createdAt.toISOString() });

export function createPageVersionsRouter() {
  const router = Router();
  const perUser = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req: Request) => currentUser(req)?.id ?? ipKeyGenerator(req.ip ?? ''),
    message: { error: 'Слишком много запросов. Повторите через минуту.' },
  });

  router.get('/pages/:pageId/revisions', async (req, res) => {
    const page = await ownPage(req, res);
    if (!page) return;
    const rows = await prisma.dashboardPageRevision.findMany({ where: { pageId: page.id }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, label: true, createdAt: true } });
    res.json(rows.map(revisionResponse));
  });

  router.post('/pages/:pageId/revisions', async (req, res) => {
    const page = await ownPage(req, res);
    if (!page) return;
    const body = labelSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.dashboardPageRevision.create({ data: { pageId: page.id, title: page.title, document: page.document as object, label: body.data.label } });
      const old = await tx.dashboardPageRevision.findMany({ where: { pageId: page.id }, orderBy: { createdAt: 'desc' }, skip: PAGE_REVISIONS_KEPT, select: { id: true } });
      if (old.length) await tx.dashboardPageRevision.deleteMany({ where: { id: { in: old.map((entry) => entry.id) } } });
      return created;
    });
    res.status(201).json(revisionResponse(row));
  });

  /** Back to a version; what was there is kept as a version first, so a restore can be undone. */
  router.post('/pages/:pageId/revisions/:revisionId/restore', async (req, res) => {
    const page = await ownPage(req, res);
    if (!page) return;
    const body = restoreSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    const revision = await prisma.dashboardPageRevision.findFirst({ where: { id: req.params.revisionId, pageId: page.id } });
    const document = revision ? pageDocumentSchema.safeParse(revision.document) : null;
    if (!revision || !document?.success) {
      res.status(404).json({ code: 'PAGE_NOT_FOUND', error: 'Версия не найдена' });
      return;
    }
    const restored = await prisma.$transaction(async (tx) => {
      const updated = await tx.dashboardPage.updateMany({ where: { id: page.id, revision: body.data.expectedRevision }, data: { title: revision.title, document: document.data, revision: { increment: 1 } } });
      if (updated.count === 0) return null;
      await tx.dashboardPageRevision.create({ data: { pageId: page.id, title: page.title, document: page.document as object, label: 'Перед восстановлением' } });
      return tx.dashboardPage.findUniqueOrThrow({ where: { id: page.id } });
    });
    if (!restored) {
      res.status(409).json({ code: 'PAGE_CONFLICT', error: 'Страницу изменили в другой вкладке — обновите её' });
      return;
    }
    res.json({ id: restored.id, title: restored.title, document: restored.document, revision: restored.revision, createdAt: restored.createdAt.toISOString(), updatedAt: restored.updatedAt.toISOString() });
  });

  router.get('/pages/:pageId/releases', async (req, res) => {
    const page = await ownPage(req, res);
    if (!page) return;
    const rows = await prisma.dashboardPageRelease.findMany({ where: { pageId: page.id }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, label: true, createdAt: true } });
    res.json(rows.map(revisionResponse));
  });

  /** A release: the saved page with the answers of this moment, kept as they are. */
  router.post('/pages/:pageId/releases', perUser, async (req, res) => {
    const page = await ownPage(req, res);
    if (!page) return;
    const body = labelSchema.safeParse(req.body ?? {});
    const document = pageDocumentSchema.safeParse(page.document);
    if (!body.success || !document.success) {
      res.status(400).json({ error: body.success ? 'Страница повреждена' : body.error.flatten() });
      return;
    }
    let answer;
    try {
      answer = await runPageQueries(await readableProjectWhere(req), { scope: document.data.scope, periodDays: document.data.periodDays, queries: queriesOf(document.data), fresh: true });
    } catch (error) {
      if (!(error instanceof PageScopeTooLargeError)) throw error;
      res.status(400).json({ code: error.code, error: error.message });
      return;
    }
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.dashboardPageRelease.create({ data: { pageId: page.id, title: page.title, label: body.data.label, document: document.data, answers: answer, projectIds: answer.projects.map((project) => project.id) } });
      const old = await tx.dashboardPageRelease.findMany({ where: { pageId: page.id }, orderBy: { createdAt: 'desc' }, skip: PAGE_RELEASES_KEPT, select: { id: true } });
      if (old.length) await tx.dashboardPageRelease.deleteMany({ where: { id: { in: old.map((entry) => entry.id) } } });
      return created;
    });
    res.status(201).json(revisionResponse(row));
  });

  router.get('/pages/:pageId/releases/:releaseId', async (req, res) => {
    const page = await ownPage(req, res);
    if (!page) return;
    const release = await prisma.dashboardPageRelease.findFirst({ where: { id: req.params.releaseId, pageId: page.id } });
    if (!release) {
      res.status(404).json({ code: 'PAGE_NOT_FOUND', error: 'Выпуск не найден' });
      return;
    }
    res.json({ ...revisionResponse(release), document: release.document, answer: release.answers });
  });

  router.delete('/pages/:pageId/releases/:releaseId', async (req, res) => {
    const page = await ownPage(req, res);
    if (!page) return;
    const deleted = await prisma.dashboardPageRelease.deleteMany({ where: { id: req.params.releaseId, pageId: page.id } });
    res.status(deleted.count ? 204 : 404).end();
  });

  router.get('/pages/:pageId/shares', async (req, res) => {
    const page = await ownPage(req, res);
    if (!page) return;
    const rows = await prisma.dashboardPageShare.findMany({ where: { pageId: page.id }, orderBy: { createdAt: 'desc' }, select: { id: true, releaseId: true, expiresAt: true, revokedAt: true, createdAt: true, release: { select: { label: true, createdAt: true } } } });
    res.json(rows.map((row) => ({
      id: row.id,
      releaseId: row.releaseId,
      releaseLabel: row.release?.label ?? null,
      releaseAt: row.release?.createdAt.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revoked: row.revokedAt !== null,
      createdAt: row.createdAt.toISOString(),
    })));
  });

  /** A new link; the token is shown once and only its hash is kept. */
  router.post('/pages/:pageId/shares', async (req, res) => {
    const page = await ownPage(req, res);
    if (!page) return;
    const body = shareSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    if (body.data.releaseId && !(await prisma.dashboardPageRelease.findFirst({ where: { id: body.data.releaseId, pageId: page.id }, select: { id: true } }))) {
      res.status(404).json({ code: 'PAGE_NOT_FOUND', error: 'Выпуск не найден' });
      return;
    }
    if ((await prisma.dashboardPageShare.count({ where: { pageId: page.id, revokedAt: null } })) >= SHARES_PER_PAGE) {
      res.status(409).json({ error: `У страницы уже ${SHARES_PER_PAGE} ссылок — отзовите ненужные` });
      return;
    }
    const token = randomBytes(24).toString('base64url');
    const row = await prisma.dashboardPageShare.create({
      data: { pageId: page.id, releaseId: body.data.releaseId ?? null, tokenHash: hashToken(token), expiresAt: body.data.days ? new Date(Date.now() + body.data.days * 86_400_000) : null },
    });
    res.status(201).json({ id: row.id, token, expiresAt: row.expiresAt?.toISOString() ?? null });
  });

  router.delete('/pages/:pageId/shares/:shareId', async (req, res) => {
    const page = await ownPage(req, res);
    if (!page) return;
    const revoked = await prisma.dashboardPageShare.updateMany({ where: { id: req.params.shareId, pageId: page.id, revokedAt: null }, data: { revokedAt: new Date() } });
    res.status(revoked.count ? 204 : 404).end();
  });

  /**
   * What a link opens, for anyone signed in. A live page is answered with the
   * reader's own access to projects; a release only if the reader may read
   * every project it was made from.
   */
  router.get('/page-links/:token', perUser, async (req, res) => {
    if (!currentUser(req)) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    const share = await prisma.dashboardPageShare.findUnique({ where: { tokenHash: hashToken(String(req.params.token)) }, include: { page: true, release: true } });
    if (!share || share.revokedAt || (share.expiresAt && share.expiresAt < new Date())) {
      res.status(404).json({ code: 'PAGE_LINK_GONE', error: 'Ссылка недействительна: её отозвали, срок истёк или её не было' });
      return;
    }
    const readable = await readableProjectWhere(req);
    if (share.release) {
      const visible = await prisma.project.count({ where: { AND: [readable, { id: { in: share.release.projectIds } }] } });
      if (visible < share.release.projectIds.length) {
        res.status(403).json({ code: 'PAGE_LINK_FORBIDDEN', error: 'В выпуске есть проекты, которые вам недоступны' });
        return;
      }
      res.json({ title: share.release.title, document: share.release.document, release: { label: share.release.label, createdAt: share.release.createdAt.toISOString() }, answer: share.release.answers });
      return;
    }
    const document = pageDocumentSchema.safeParse(share.page.document);
    if (!document.success) {
      res.status(404).json({ code: 'PAGE_LINK_GONE', error: 'Страница повреждена' });
      return;
    }
    try {
      const answer = await runPageQueries(readable, { scope: document.data.scope, periodDays: document.data.periodDays, queries: queriesOf(document.data) });
      res.json({ title: share.page.title, document: document.data, release: null, answer });
    } catch (error) {
      if (!(error instanceof PageScopeTooLargeError)) throw error;
      res.status(400).json({ code: error.code, error: error.message });
    }
  });

  return router;
}
