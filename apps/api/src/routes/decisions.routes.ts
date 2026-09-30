import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser, isPublicDemoMode } from '../server/auth.js';
import { readableProjectWhere } from '../server/business-units.js';
import { userCanWriteProject } from '../server/project-access.js';
import { recordAuditEvent } from '../services/audit.js';

export const DECISION_STATUSES = ['PROPOSED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED'] as const;

const text = (max: number) => z.string().trim().max(max);
const links = {
  issueId: z.string().trim().min(1).nullable().optional(),
  raidItemId: z.string().trim().min(1).nullable().optional(),
  wbsItemId: z.string().trim().min(1).nullable().optional(),
  changeRequestId: z.string().trim().min(1).nullable().optional(),
};
const createSchema = z.object({
  title: text(300).min(3),
  context: text(4000).default(''),
  decision: text(4000).default(''),
  // RECORD writes down a decision already taken; PROPOSE starts a draft to discuss or send for approval.
  mode: z.enum(['PROPOSE', 'RECORD']).default('PROPOSE'),
  decidedBy: text(200).optional(),
  decidedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  supersedesId: z.string().trim().min(1).nullable().optional(),
  ...links,
});
const editSchema = z.object({ title: text(300).min(3).optional(), context: text(4000).optional(), decision: text(4000).optional(), expectedVersion: z.number().int(), ...links });
const requestSchema = z.object({ approverUserId: z.string().trim().min(1), expectedVersion: z.number().int() });
const answerSchema = z.object({ verdict: z.enum(['APPROVE', 'REJECT']), comment: text(2000).min(3), expectedVersion: z.number().int() });
const recordSchema = z.object({ decidedBy: text(200).min(2), decidedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), expectedVersion: z.number().int() });
const versionSchema = z.object({ expectedVersion: z.number().int() });

type User = NonNullable<ReturnType<typeof currentUser>>;
const isDemo = (user: User) => isPublicDemoMode() && user.id === PUBLIC_DEMO_USER_ID;
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A signed-in user who may change this open project; answers the request itself otherwise. */
async function writer(req: Request, res: Response, projectId: string) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return null;
  }
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, status: true } });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return null;
  }
  if (project.status === 'CLOSED') {
    res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
    return null;
  }
  if (!isDemo(user) && user.role !== 'ADMIN' && !(await userCanWriteProject(user.id, project.id))) {
    res.status(403).json({ error: 'Нет доступа на изменение этого проекта' });
    return null;
  }
  return { user, project };
}

async function readable(req: Request, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, ...(await readableProjectWhere(req)) }, select: { id: true } });
}

/** Links must point into the same project; a link to another project's record is refused. */
async function checkLinks(projectId: string, input: { issueId?: string | null; raidItemId?: string | null; wbsItemId?: string | null; changeRequestId?: string | null }) {
  const checks: Array<[string | null | undefined, () => Promise<unknown>]> = [
    [input.issueId, () => prisma.issue.findFirst({ where: { id: input.issueId!, projectId }, select: { id: true } })],
    [input.raidItemId, () => prisma.raidItem.findFirst({ where: { id: input.raidItemId!, projectId }, select: { id: true } })],
    [input.wbsItemId, () => prisma.wbsItem.findFirst({ where: { id: input.wbsItemId!, projectId }, select: { id: true } })],
    [input.changeRequestId, () => prisma.changeRequest.findFirst({ where: { id: input.changeRequestId!, projectId }, select: { id: true } })],
  ];
  for (const [id, find] of checks) {
    if (id && !(await find())) throw new Refusal(400, 'Связанная запись должна быть из этого проекта');
  }
}

/** Active users who can read the project may approve: a sponsor often only reads. */
async function approverCandidate(userId: string) {
  return prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true, name: true, email: true } });
}

/**
 * Moves a decision from one state to the next only if it is still in the state
 * and version the page saw, so two clicks or two people cannot both answer.
 */
async function transition(id: string, from: string[], expectedVersion: number, data: Record<string, unknown>, extraWhere: Record<string, unknown> = {}) {
  const changed = await prisma.decision.updateMany({
    where: { id, status: { in: from }, version: expectedVersion, ...extraWhere },
    data: { ...data, version: { increment: 1 } },
  });
  if (changed.count !== 1) throw new Refusal(409, 'Решение уже изменилось: обновите страницу');
  return prisma.decision.findUniqueOrThrow({ where: { id } });
}

function send(res: Response, error: unknown) {
  if (error instanceof Refusal) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  throw error;
}

/**
 * The project's decision log. Anyone who reads the project sees it; people who
 * may change the project propose, edit drafts, send them to one approver or
 * record decisions already taken; only the chosen approver answers, with a
 * comment. Every step is audited.
 */
export function createDecisionsRouter() {
  const router = Router();

  router.get('/projects/:projectId/decisions', async (req, res) => {
    const project = await readable(req, String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    res.json(await prisma.decision.findMany({ where: { projectId: project.id }, orderBy: [{ updatedAt: 'desc' }], take: 500 }));
  });

  /** Decisions waiting for the signed-in user's answer, across the projects they can read. */
  router.get('/decisions/awaiting-me', async (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.json([]);
      return;
    }
    const rows = await prisma.decision.findMany({
      where: { approverUserId: user.id, status: 'PENDING_APPROVAL', project: await readableProjectWhere(req) },
      orderBy: { requestedAt: 'asc' },
      take: 200,
      include: { project: { select: { id: true, code: true, name: true } } },
    });
    res.json(rows);
  });

  router.get('/projects/:projectId/decision-approvers', async (req, res) => {
    const context = await writer(req, res, String(req.params.projectId));
    if (!context) return;
    const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 500 });
    res.json(users);
  });

  router.post('/projects/:projectId/decisions', async (req, res) => {
    const context = await writer(req, res, String(req.params.projectId));
    if (!context) return;
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Укажите название решения (от 3 символов)' });
      return;
    }
    const input = body.data;
    if (input.mode === 'RECORD' && (!input.decidedBy || !input.decidedAt || !input.decision)) {
      res.status(400).json({ error: 'Для принятого решения укажите, что решили, кем и когда' });
      return;
    }
    try {
      await checkLinks(context.project.id, input);
      const created = await prisma.$transaction(async (tx) => {
        if (input.supersedesId) {
          // Only a decision in force can be replaced, and only once.
          const replaced = await tx.decision.updateMany({
            where: { id: input.supersedesId, projectId: context.project.id, status: 'APPROVED' },
            data: { status: 'SUPERSEDED', version: { increment: 1 } },
          });
          if (replaced.count !== 1) throw new Refusal(409, 'Заменить можно только действующее решение этого проекта');
        }
        return tx.decision.create({
          data: {
            projectId: context.project.id,
            title: input.title,
            context: input.context,
            decision: input.decision,
            status: input.mode === 'RECORD' ? 'APPROVED' : 'PROPOSED',
            decidedBy: input.mode === 'RECORD' ? input.decidedBy : null,
            decidedAt: input.mode === 'RECORD' && input.decidedAt ? day(input.decidedAt) : null,
            createdById: isDemo(context.user) ? null : context.user.id,
            createdByName: context.user.name ?? context.user.email ?? null,
            issueId: input.issueId ?? null,
            raidItemId: input.raidItemId ?? null,
            wbsItemId: input.wbsItemId ?? null,
            changeRequestId: input.changeRequestId ?? null,
            supersedesId: input.supersedesId ?? null,
          },
        });
      });
      await recordAuditEvent({
        req,
        actor: context.user,
        action: input.mode === 'RECORD' ? 'decision.record' : 'decision.create',
        objectType: 'Decision',
        objectId: created.id,
        projectId: context.project.id,
        afterValue: created,
        metadata: input.supersedesId ? { supersedes: input.supersedesId } : undefined,
      });
      if (input.supersedesId) {
        // The replaced decision's own history shows the step to Replaced.
        await recordAuditEvent({
          req,
          actor: context.user,
          action: 'decision.supersede',
          objectType: 'Decision',
          objectId: input.supersedesId,
          projectId: context.project.id,
          metadata: { supersededBy: created.id },
        });
      }
      res.status(201).json(created);
    } catch (error) {
      send(res, error);
    }
  });

  /** Loads a decision and the writer context of its project. */
  const decisionFor = async (req: Request, res: Response) => {
    const decision = await prisma.decision.findUnique({ where: { id: String(req.params.decisionId) } });
    if (!decision) {
      res.status(404).json({ error: 'Решение не найдено' });
      return null;
    }
    return decision;
  };

  router.patch('/decisions/:decisionId', async (req, res) => {
    const decision = await decisionFor(req, res);
    if (!decision) return;
    const context = await writer(req, res, decision.projectId);
    if (!context) return;
    const body = editSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Некорректные поля решения' });
      return;
    }
    try {
      await checkLinks(decision.projectId, body.data);
      const { expectedVersion, ...fields } = body.data;
      const updated = await transition(decision.id, ['PROPOSED'], expectedVersion, fields);
      await recordAuditEvent({ req, actor: context.user, action: 'decision.update', objectType: 'Decision', objectId: decision.id, projectId: decision.projectId, beforeValue: decision, afterValue: updated });
      res.json(updated);
    } catch (error) {
      send(res, error);
    }
  });

  router.post('/decisions/:decisionId/request-approval', async (req, res) => {
    const decision = await decisionFor(req, res);
    if (!decision) return;
    const context = await writer(req, res, decision.projectId);
    if (!context) return;
    const body = requestSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Выберите согласующего' });
      return;
    }
    const approver = await approverCandidate(body.data.approverUserId);
    if (!approver) {
      res.status(400).json({ error: 'Согласующий должен быть активным пользователем' });
      return;
    }
    try {
      const updated = await transition(decision.id, ['PROPOSED'], body.data.expectedVersion, {
        status: 'PENDING_APPROVAL',
        approverUserId: approver.id,
        approverName: approver.name || approver.email,
        requestedAt: new Date(),
        approvalComment: null,
        answeredAt: null,
      });
      await recordAuditEvent({ req, actor: context.user, action: 'decision.request', objectType: 'Decision', objectId: decision.id, projectId: decision.projectId, metadata: { approverUserId: approver.id } });
      res.json(updated);
    } catch (error) {
      send(res, error);
    }
  });

  router.post('/decisions/:decisionId/withdraw', async (req, res) => {
    const decision = await decisionFor(req, res);
    if (!decision) return;
    const context = await writer(req, res, decision.projectId);
    if (!context) return;
    const body = versionSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Некорректный запрос' });
      return;
    }
    try {
      const updated = await transition(decision.id, ['PENDING_APPROVAL'], body.data.expectedVersion, { status: 'PROPOSED', approverUserId: null, approverName: null, requestedAt: null });
      await recordAuditEvent({ req, actor: context.user, action: 'decision.withdraw', objectType: 'Decision', objectId: decision.id, projectId: decision.projectId });
      res.json(updated);
    } catch (error) {
      send(res, error);
    }
  });

  router.post('/decisions/:decisionId/record', async (req, res) => {
    const decision = await decisionFor(req, res);
    if (!decision) return;
    const context = await writer(req, res, decision.projectId);
    if (!context) return;
    const body = recordSchema.safeParse(req.body ?? {});
    if (!body.success || !decision.decision.trim()) {
      res.status(400).json({ error: 'Для принятого решения укажите, что решили, кем и когда' });
      return;
    }
    try {
      const updated = await transition(decision.id, ['PROPOSED'], body.data.expectedVersion, { status: 'APPROVED', decidedBy: body.data.decidedBy, decidedAt: day(body.data.decidedAt) });
      await recordAuditEvent({ req, actor: context.user, action: 'decision.record', objectType: 'Decision', objectId: decision.id, projectId: decision.projectId });
      res.json(updated);
    } catch (error) {
      send(res, error);
    }
  });

  /** Only the chosen approver answers, with a comment, while the project is still open and readable to them. */
  router.post('/decisions/:decisionId/answer', async (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    const decision = await decisionFor(req, res);
    if (!decision) return;
    const body = answerSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Ответ согласующего требует комментария' });
      return;
    }
    if (decision.approverUserId !== user.id) {
      res.status(403).json({ error: 'Ответить может только выбранный согласующий' });
      return;
    }
    const project = await prisma.project.findFirst({ where: { id: decision.projectId, ...(await readableProjectWhere(req)) }, select: { id: true, status: true } });
    if (!project) {
      res.status(403).json({ error: 'Нет доступа к проекту' });
      return;
    }
    if (project.status === 'CLOSED') {
      res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
      return;
    }
    try {
      const approve = body.data.verdict === 'APPROVE';
      const updated = await transition(
        decision.id,
        ['PENDING_APPROVAL'],
        body.data.expectedVersion,
        {
          status: approve ? 'APPROVED' : 'REJECTED',
          approvalComment: body.data.comment,
          answeredAt: new Date(),
          ...(approve ? { decidedBy: decision.approverName, decidedAt: new Date() } : {}),
        },
        { approverUserId: user.id },
      );
      await recordAuditEvent({ req, actor: user, action: approve ? 'decision.approve' : 'decision.reject', objectType: 'Decision', objectId: decision.id, projectId: decision.projectId });
      res.json(updated);
    } catch (error) {
      send(res, error);
    }
  });

  router.delete('/decisions/:decisionId', async (req, res) => {
    const decision = await decisionFor(req, res);
    if (!decision) return;
    const context = await writer(req, res, decision.projectId);
    if (!context) return;
    const removed = await prisma.decision.deleteMany({ where: { id: decision.id, status: 'PROPOSED' } });
    if (removed.count !== 1) {
      res.status(409).json({ error: 'Удалить можно только черновик решения' });
      return;
    }
    await recordAuditEvent({ req, actor: context.user, action: 'decision.delete', objectType: 'Decision', objectId: decision.id, projectId: decision.projectId, beforeValue: decision });
    res.status(204).send();
  });

  return router;
}
