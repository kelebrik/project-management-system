import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { readableProjectWhere } from '../server/business-units.js';
import { recordAuditEvent } from '../services/audit.js';
import { draftLessons, LESSON_CATEGORIES, LESSON_SOURCES } from '../services/lessons.js';
import { projectShiftLadders } from '../services/schedule-shifts.js';
import { projectWriter, readableProject } from './project-writer.js';
import { patchSchema } from './patch-schema.js';

const lessonSchema = z.object({
  category: z.enum(LESSON_CATEGORIES),
  title: z.string().trim().min(3).max(300),
  text: z.string().trim().max(4000).default(''),
  recommendation: z.string().trim().max(4000).default(''),
  sourceKind: z.enum(LESSON_SOURCES).default('MANUAL'),
  sourceRef: z.string().trim().max(200).nullable().optional(),
});
const editSchema = patchSchema(lessonSchema.pick({ category: true, title: true, text: true, recommendation: true }));
const PAGE = 50;

/**
 * Lessons of projects: a draft built from a project's records, lessons written
 * and kept (also after the project closes), and the register of all readable
 * projects' lessons, filtered and paged on the server.
 */
export function createLessonsRouter() {
  const router = Router();

  router.get('/projects/:projectId/lessons', async (req, res) => {
    const project = await readableProject(req, String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    res.json(await prisma.lesson.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } }));
  });

  router.get('/projects/:projectId/lessons/draft', async (req, res) => {
    const context = await projectWriter(req, res, String(req.params.projectId), { allowClosed: true });
    if (!context) return;
    const projectId = context.project.id;
    const [ladders, raid, issues, decisions, saved] = await Promise.all([
      projectShiftLadders(projectId).catch(() => []),
      prisma.raidItem.findMany({
        where: { projectId, OR: [{ type: 'DEPENDENCY' }, { type: 'RISK', status: 'BREACHED' }] },
        select: { id: true, type: true, title: true, status: true, mitigationPlan: true, contingencyPlan: true },
      }),
      prisma.issue.findMany({ where: { projectId, severity: { in: ['CRITICAL', 'HIGH'] }, closedDelayDays: { gt: 0 } }, select: { id: true, title: true, severity: true, closedDelayDays: true } }),
      prisma.decision.findMany({ where: { projectId, status: 'APPROVED' }, select: { id: true, title: true, decision: true } }),
      prisma.lesson.findMany({ where: { projectId, sourceRef: { not: null } }, select: { sourceRef: true } }),
    ]);
    const goal = ladders.find((ladder) => ladder.isActiveGoal) ?? null;
    const locale = req.query.locale === 'en' ? 'en' : 'ru';
    res.json(
      draftLessons(
        {
          goal: goal && { code: goal.code, title: goal.title, varianceDays: goal.varianceDays, unexplainedDays: goal.unexplainedDays, reasonDays: goal.reasonDays },
          problems: raid.filter((item) => item.type === 'DEPENDENCY'),
          breachedRisks: raid.filter((item) => item.type === 'RISK'),
          criticalIssues: issues,
          decisions,
        },
        new Set(saved.map((row) => row.sourceRef!)),
        locale,
      ),
    );
  });

  router.post('/projects/:projectId/lessons', async (req, res) => {
    const context = await projectWriter(req, res, String(req.params.projectId), { allowClosed: true });
    if (!context) return;
    const body = lessonSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Укажите категорию и название урока (от 3 символов)' });
      return;
    }
    const lesson = await prisma.lesson.create({
      data: {
        projectId: context.project.id,
        ...body.data,
        sourceRef: body.data.sourceRef ?? null,
        createdById: context.demo ? null : context.user.id,
        createdByName: context.user.name ?? context.user.email ?? null,
      },
    });
    await recordAuditEvent({ req, actor: context.user, action: 'lesson.create', objectType: 'Lesson', objectId: lesson.id, projectId: context.project.id, afterValue: lesson });
    res.status(201).json(lesson);
  });

  router.patch('/lessons/:lessonId', async (req, res) => {
    const lesson = await prisma.lesson.findUnique({ where: { id: String(req.params.lessonId) } });
    if (!lesson) {
      res.status(404).json({ error: 'Урок не найден' });
      return;
    }
    const context = await projectWriter(req, res, lesson.projectId, { allowClosed: true });
    if (!context) return;
    const body = editSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Некорректные поля урока' });
      return;
    }
    const updated = await prisma.lesson.update({ where: { id: lesson.id }, data: body.data });
    await recordAuditEvent({ req, actor: context.user, action: 'lesson.update', objectType: 'Lesson', objectId: lesson.id, projectId: lesson.projectId, beforeValue: lesson, afterValue: updated });
    res.json(updated);
  });

  router.delete('/lessons/:lessonId', async (req, res) => {
    const lesson = await prisma.lesson.findUnique({ where: { id: String(req.params.lessonId) } });
    if (!lesson) {
      res.status(404).json({ error: 'Урок не найден' });
      return;
    }
    const context = await projectWriter(req, res, lesson.projectId, { allowClosed: true });
    if (!context) return;
    await prisma.lesson.delete({ where: { id: lesson.id } });
    await recordAuditEvent({ req, actor: context.user, action: 'lesson.delete', objectType: 'Lesson', objectId: lesson.id, projectId: lesson.projectId, beforeValue: lesson });
    res.status(204).send();
  });

  /** All readable projects' lessons, newest first, by category and words in the title or text; 50 per page. */
  router.get('/lessons', async (req, res) => {
    const category = typeof req.query.category === 'string' && (LESSON_CATEGORIES as readonly string[]).includes(req.query.category) ? req.query.category : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const page = Math.max(0, Math.min(1000, Number.parseInt(String(req.query.page ?? '0'), 10) || 0));
    const where = {
      project: await readableProjectWhere(req),
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { text: { contains: q, mode: 'insensitive' as const } },
              { recommendation: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.lesson.count({ where }),
      prisma.lesson.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * PAGE,
        take: PAGE,
        include: { project: { select: { id: true, code: true, name: true, status: true } } },
      }),
    ]);
    res.json({ total, page, pageSize: PAGE, rows });
  });

  return router;
}
