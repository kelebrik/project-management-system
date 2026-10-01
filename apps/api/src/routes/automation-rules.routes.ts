import {
  AUTOMATION_LIMITS,
  automationParamsSchemas,
  automationProposalApplySchema,
  automationProposalRejectSchema,
  automationRuleUpdateSchema,
  automationTemplates,
  createIssueSchema,
  PUBLIC_DEMO_USER_ID,
  type AutomationTemplate,
} from '@pms/shared';
import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser, isPublicDemoMode } from '../server/auth.js';
import { projectsReadableByUserWhere, usersWhoCanReadProject } from '../server/business-units.js';
import { userCanWriteProject } from '../server/project-access.js';
import { buildAuditFieldChanges, recordAuditEvent } from '../services/audit.js';
import { previewRule } from '../services/automation/preview.js';
import { jiraSourceIsFresh } from '../services/jira-source-freshness.js';
import { shiftActor, trackScheduleShifts } from '../services/schedule-shifts.js';
import { getProjectWbsSnapshot, recalculateProjectWbsHierarchyStatuses } from '../services/wbs.js';
import { recordWbsCommand } from '../services/wbs-audit.js';
import { recalculateProjectWbsSchedule } from '../services/wbs-schedule.js';
import { emitWebhookEvent } from '../services/webhooks.js';
import { projectModulesConfig } from './admin/project-modules.js';
import { projectWriter, readableProject } from './project-writer.js';
import { closedAtForWbsStatus } from './wbs/helpers.js';
import { runWithWbsWriteQueue } from './wbs/write-queue.js';

const isTemplate = (value: string): value is AutomationTemplate => (automationTemplates as readonly string[]).includes(value);
const setStatusPayload = z.object({
  status: z.literal('DONE'),
  expectedUpdatedAt: z.string().datetime(),
  expectedJira: z.object({ key: z.string().min(1), updatedAt: z.string().datetime() }),
});
const issuePayload = z.object({ title: z.string(), impact: z.string().default(''), owner: z.string().default(''), severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('HIGH') });

class ProposalConflict extends Error {
  constructor(readonly status: 409 | 404, message: string, readonly stale = false) {
    super(message);
  }
}

async function canWrite(req: Request, project: { id: string; status: string }) {
  const user = currentUser(req);
  if (!user || project.status === 'CLOSED') return false;
  if (user.role === 'ADMIN' || (isPublicDemoMode() && user.id === PUBLIC_DEMO_USER_ID)) return true;
  return userCanWriteProject(user.id, project.id);
}

/**
 * Rules a project switches on (five templates), what they would have said,
 * what they did, and the changes they prepared. A rule never changes the plan
 * by itself: prepared issues and statuses are applied here by a person who may
 * change the project, after the same checks as a manual change.
 */
export function createAutomationRulesRouter() {
  const router = Router();

  router.get('/projects/:projectId/automation-rules', async (req, res) => {
    const project = await readableProject(req, String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const [rules, users, pending] = await Promise.all([
      prisma.automationRule.findMany({ where: { projectId: project.id } }),
      prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 500 }),
      prisma.automationProposal.count({ where: { projectId: project.id, status: 'PENDING' } }),
    ]);
    const byTemplate = new Map(rules.map((rule) => [rule.template, rule]));
    res.json({
      canWrite: await canWrite(req, project),
      pendingProposals: pending,
      users,
      rules: automationTemplates.map((template) => {
        const rule = byTemplate.get(template);
        return {
          template,
          rule: rule ? { id: rule.id, enabled: rule.enabled, params: rule.params, recipientIds: rule.recipientIds, version: rule.version, updatedAt: rule.updatedAt } : null,
        };
      }),
    });
  });

  router.put('/projects/:projectId/automation-rules/:template', async (req, res) => {
    const writer = await projectWriter(req, res, String(req.params.projectId));
    if (!writer) return;
    const template = String(req.params.template);
    const body = automationRuleUpdateSchema.safeParse(req.body ?? {});
    if (!isTemplate(template) || !body.success) {
      res.status(400).json({ error: 'Некорректное правило' });
      return;
    }
    const params = automationParamsSchemas[template].safeParse(body.data.params);
    if (!params.success) {
      res.status(400).json({ error: 'Некорректные параметры правила' });
      return;
    }
    const recipientIds = [...new Set(body.data.recipientIds)];
    if ((await usersWhoCanReadProject(recipientIds, writer.project.id)).length !== recipientIds.length) {
      res.status(400).json({ error: 'Получатели должны быть активными пользователями, которые видят проект' });
      return;
    }
    const { project, user, demo } = writer;
    const existing = await prisma.automationRule.findUnique({ where: { projectId_template: { projectId: project.id, template } } });
    // Switching a rule on starts it from now: nothing that happened while it was off fires.
    const restart = body.data.enabled && (!existing || !existing.enabled);
    const data = {
      enabled: body.data.enabled,
      params: params.data as Prisma.InputJsonValue,
      recipientIds,
      ...(restart ? { state: { since: new Date().toISOString() } } : {}),
    };
    let saved;
    if (!existing) {
      saved = await prisma.automationRule
        .create({ data: { projectId: project.id, template, createdById: demo ? null : user.id, ...data } })
        .catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
          throw error;
        });
    } else if (body.data.version === existing.version) {
      const updated = await prisma.automationRule.updateMany({ where: { id: existing.id, version: existing.version }, data: { ...data, version: { increment: 1 } } });
      saved = updated.count === 1 ? await prisma.automationRule.findUnique({ where: { id: existing.id } }) : null;
    }
    if (!saved) {
      res.status(409).json({ error: 'Правило изменилось. Обновите страницу.' });
      return;
    }
    await recordAuditEvent({
      req,
      actor: user,
      action: 'automation_rule.save',
      objectType: 'AutomationRule',
      objectId: saved.id,
      projectId: project.id,
      beforeValue: existing ? { enabled: existing.enabled, params: existing.params, recipientIds: existing.recipientIds } : undefined,
      afterValue: { template, enabled: saved.enabled, params: saved.params, recipientIds: saved.recipientIds },
    });
    res.json({ id: saved.id, enabled: saved.enabled, params: saved.params, recipientIds: saved.recipientIds, version: saved.version, updatedAt: saved.updatedAt });
  });

  router.get('/projects/:projectId/automation-rules/:template/preview', async (req, res) => {
    const project = await prisma.project.findFirst({ where: { id: String(req.params.projectId) }, select: { id: true, code: true } });
    const readable = project && (await readableProject(req, project.id));
    const template = String(req.params.template);
    if (!project || !readable) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    if (!isTemplate(template)) {
      res.status(400).json({ error: 'Некорректное правило' });
      return;
    }
    const minDays = Number(req.query.minDays);
    const params = template === 'MILESTONE_SHIFT' && Number.isInteger(minDays) && minDays >= 1 && minDays <= AUTOMATION_LIMITS.minDaysMax ? { minDays } : {};
    res.json(await previewRule(project, template, params));
  });

  router.get('/projects/:projectId/automation/firings', async (req, res) => {
    const project = await readableProject(req, String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const firings = await prisma.automationFiring.findMany({
      where: { projectId: project.id },
      orderBy: { firedAt: 'desc' },
      take: 100,
      select: { id: true, template: true, summary: true, firedAt: true, _count: { select: { notifications: true, proposals: true } } },
    });
    res.json(firings.map(({ _count, ...firing }) => ({ ...firing, notifications: _count.notifications, proposals: _count.proposals })));
  });

  router.get('/projects/:projectId/automation/proposals', async (req, res) => {
    const project = await readableProject(req, String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const status = typeof req.query.status === 'string' && ['PENDING', 'APPLIED', 'REJECTED', 'STALE'].includes(req.query.status) ? req.query.status : 'PENDING';
    res.json(
      await prisma.automationProposal.findMany({
        where: { projectId: project.id, status },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, kind: true, wbsItemId: true, payload: true, status: true, version: true, createdAt: true, decidedAt: true, resultIssueId: true, rule: { select: { template: true } } },
      }),
    );
  });

  router.post('/projects/:projectId/automation/proposals/:proposalId/reject', async (req, res) => {
    const writer = await projectWriter(req, res, String(req.params.projectId));
    if (!writer) return;
    const body = automationProposalRejectSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Некорректный запрос' });
      return;
    }
    const decided = await prisma.automationProposal.updateMany({
      where: { id: String(req.params.proposalId), projectId: writer.project.id, status: 'PENDING', version: body.data.version },
      data: { status: 'REJECTED', decidedById: writer.demo ? null : writer.user.id, decidedAt: new Date(), version: { increment: 1 } },
    });
    if (decided.count !== 1) {
      res.status(409).json({ error: 'Предложение уже рассмотрено или изменилось' });
      return;
    }
    await recordAuditEvent({ req, actor: writer.user, action: 'automation_proposal.reject', objectType: 'AutomationProposal', objectId: String(req.params.proposalId), projectId: writer.project.id });
    res.json({ status: 'REJECTED' });
  });

  router.post('/projects/:projectId/automation/proposals/:proposalId/apply', async (req, res) => {
    const writer = await projectWriter(req, res, String(req.params.projectId));
    if (!writer) return;
    const body = automationProposalApplySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Некорректный запрос' });
      return;
    }
    const { project, user, demo } = writer;
    const proposal = await prisma.automationProposal.findFirst({ where: { id: String(req.params.proposalId), projectId: project.id } });
    if (!proposal) {
      res.status(404).json({ error: 'Предложение не найдено' });
      return;
    }
    if (proposal.status !== 'PENDING' || proposal.version !== body.data.version) {
      res.status(409).json({ error: 'Предложение уже рассмотрено или изменилось' });
      return;
    }
    const decidedById = demo ? null : user.id;
    const claim = (tx: Prisma.TransactionClient, data: Prisma.AutomationProposalUpdateManyMutationInput) =>
      tx.automationProposal.updateMany({ where: { id: proposal.id, status: 'PENDING', version: proposal.version }, data: { ...data, decidedById, decidedAt: new Date(), version: { increment: 1 } } });

    try {
      if (proposal.kind === 'CREATE_ISSUE') {
        const modules = await projectModulesConfig();
        if (!modules.some((module) => module.key === 'issues' && module.enabled)) throw new ProposalConflict(409, 'Реестр вопросов отключен');
        const prepared = issuePayload.parse(proposal.payload);
        // The same rules as an issue typed by hand.
        const input = createIssueSchema.parse({
          title: body.data.title ?? prepared.title,
          owner: body.data.owner ?? prepared.owner,
          severity: body.data.severity ?? prepared.severity,
          impact: prepared.impact,
          readiness: 'RED',
        });
        const issue = await prisma.$transaction(async (tx) => {
          const created = await tx.issue.create({
            data: {
              projectId: project.id,
              source: 'INTERNAL',
              category: input.category,
              title: input.title,
              referenceLabel: input.referenceLabel,
              severity: input.severity,
              readiness: input.readiness,
              status: 'Open',
              owner: input.owner,
              impact: input.impact,
              decisionRequired: false,
            },
          });
          if ((await claim(tx, { status: 'APPLIED', resultIssueId: created.id })).count !== 1) throw new ProposalConflict(409, 'Предложение уже рассмотрено или изменилось');
          return created;
        });
        await recordAuditEvent({ req, actor: user, action: 'issue.create', objectType: 'Issue', objectId: issue.id, projectId: project.id, afterValue: issue, metadata: { automationProposalId: proposal.id } });
        await recordAuditEvent({ req, actor: user, action: 'automation_proposal.apply', objectType: 'AutomationProposal', objectId: proposal.id, projectId: project.id, metadata: { issueId: issue.id } });
        await emitWebhookEvent({ eventType: 'issue.created', projectId: project.id, payload: { issue } }).catch(() => undefined);
        res.json({ status: 'APPLIED', issueId: issue.id });
        return;
      }

      if (proposal.kind === 'SET_WBS_STATUS' && proposal.wbsItemId) {
        const prepared = setStatusPayload.parse(proposal.payload);
        const itemId = proposal.wbsItemId;
        const { before, after, snapshot } = await runWithWbsWriteQueue(project.id, () =>
          trackScheduleShifts(project.id, { trigger: 'AUTOMATION', sourceItemId: itemId, actor: shiftActor(demo ? null : user) }, async () => {
            const changed = await prisma.$transaction(
              async (tx) => {
                const item = await tx.wbsItem.findFirst({ where: { id: itemId, projectId: project.id } });
                if (!item) throw new ProposalConflict(404, 'Строка Структуры не найдена', true);
                // The proposal rests on one version of the row and of the ticket; anything newer makes it stale.
                if (item.updatedAt.toISOString() !== prepared.expectedUpdatedAt || !(await jiraSourceIsFresh(tx, project.id, item, prepared.expectedJira))) {
                  throw new ProposalConflict(409, 'Строка или задача Jira изменились после подготовки предложения', true);
                }
                const updated = await tx.wbsItem.update({
                  where: { id: item.id, updatedAt: item.updatedAt },
                  data: { status: prepared.status, closedAt: closedAtForWbsStatus(prepared.status, item) },
                });
                if ((await claim(tx, { status: 'APPLIED' })).count !== 1) throw new ProposalConflict(409, 'Предложение уже рассмотрено или изменилось');
                return { before: item, after: updated };
              },
              { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
            );
            await recordWbsCommand({ projectId: project.id, userId: user.id, type: 'UPDATE', payload: { itemId, patch: { status: prepared.status }, automationProposalId: proposal.id }, beforeSnapshot: changed.before, afterSnapshot: changed.after });
            await recalculateProjectWbsSchedule(project.id, { changedItems: [{ itemId, changedFields: ['status'] }] });
            await recalculateProjectWbsHierarchyStatuses(project.id);
            return { ...changed, snapshot: await getProjectWbsSnapshot(project.id) };
          }),
        );
        await recordAuditEvent({
          req,
          actor: user,
          action: 'wbs_item.update',
          objectType: 'WbsItem',
          objectId: itemId,
          projectId: project.id,
          beforeValue: before,
          afterValue: after,
          changes: buildAuditFieldChanges(before, after, ['status', 'closedAt']),
          metadata: { automationProposalId: proposal.id },
        });
        await recordAuditEvent({ req, actor: user, action: 'automation_proposal.apply', objectType: 'AutomationProposal', objectId: proposal.id, projectId: project.id, metadata: { wbsItemId: itemId } });
        await emitWebhookEvent({ eventType: 'wbs.items.updated', projectId: project.id, payload: { itemIds: [itemId], snapshot } }).catch(() => undefined);
        res.json({ status: 'APPLIED', ...snapshot });
        return;
      }
      throw new ProposalConflict(409, 'Неизвестное предложение');
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2034'].includes(error.code)) {
        error = new ProposalConflict(409, 'Данные изменились во время применения. Повторите.');
      }
      if (!(error instanceof ProposalConflict)) throw error;
      // A proposal whose source moved on is closed as stale, so it does not linger as a button that always fails.
      if (error.stale) {
        await prisma.automationProposal.updateMany({ where: { id: proposal.id, status: 'PENDING', version: proposal.version }, data: { status: 'STALE', decidedById, decidedAt: new Date(), version: { increment: 1 } } });
      }
      res.status(error.status).json({ error: error.message, stale: error.stale });
    }
  });

  return router;
}

/** The signed-in user's bell: the newest entries and how many are unread. */
export function createNotificationsRouter() {
  const router = Router();
  const readSchema = z.union([z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100) }).strict(), z.object({ all: z.literal(true) }).strict()]);

  router.get('/notifications', async (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: user.id, project: projectsReadableByUserWhere() }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, kind: true, params: true, href: true, createdAt: true, readAt: true } }),
      prisma.notification.count({ where: { userId: user.id, readAt: null, project: projectsReadableByUserWhere() } }),
    ]);
    res.json({ items, unread });
  });

  router.post('/notifications/read', async (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    const body = readSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Некорректный запрос' });
      return;
    }
    const marked = await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null, ...('ids' in body.data ? { id: { in: body.data.ids } } : {}) },
      data: { readAt: new Date() },
    });
    res.json({ marked: marked.count });
  });

  return router;
}
