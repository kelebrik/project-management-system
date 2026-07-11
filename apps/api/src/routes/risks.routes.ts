import { raidItemSchema, raidItemStatusUpdateSchema } from '@pms/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { buildAuditFieldChanges, recordAuditEvent } from '../services/audit.js';
import { emitWebhookEvent } from '../services/webhooks.js';

export function createRisksRouter() {
  const router = Router();

function calculatedRiskScore(probability: number, impact: number) {
  return probability * impact;
}

function raidPayload(data: z.infer<typeof raidItemSchema>) {
  return {
    ...data,
    owner: data.owner || 'Не назначен',
    riskScore: calculatedRiskScore(data.probability, data.impact),
    mitigationPlan: data.mitigationPlan || null,
    contingencyPlan: data.contingencyPlan || null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    validationDate: data.validationDate ? new Date(data.validationDate) : null,
    linkedRiskId: data.linkedRiskId || null,
    dependencyType: data.dependencyType || null,
    predecessor: data.predecessor || null,
    successor: data.successor || null,
    supplier: data.supplier || null,
    jiraTicketKey: data.jiraTicketKey || null,
    jiraTicketUrl: data.jiraTicketUrl || null,
    budgetImpact: data.budgetImpact,
  };
}

const raidAuditFields = [
  'type',
  'title',
  'description',
  'owner',
  'status',
  'probability',
  'impact',
  'riskScore',
  'mitigationPlan',
  'contingencyPlan',
  'dueDate',
  'residualRisk',
  'validationDate',
  'linkedRiskId',
  'dependencyType',
  'predecessor',
  'successor',
  'supplier',
  'jiraTicketKey',
  'jiraTicketUrl',
  'decisionRequired',
  'escalationLevel',
  'scheduleImpactDays',
  'budgetImpact',
];

const changeRequestAuditFields = [
  'type',
  'title',
  'description',
  'owner',
  'status',
  'impactAnalysis',
  'affectedBaseline',
  'implementationPlan',
  'scheduleImpactDays',
  'budgetImpact',
  'scopeImpact',
  'approvalRoute',
  'decisionRequired',
  'dueDate',
  'approvedAt',
];

async function validateRaidItem(projectId: string, data: z.infer<typeof raidItemSchema>, itemId?: string) {
  const score = calculatedRiskScore(data.probability, data.impact);
  const activeStatus = data.status !== 'CLOSED' && data.status !== 'VALIDATED';
  if (activeStatus && data.type === 'RISK' && score >= 15 && !data.owner.trim()) {
    return 'У высокого риска должен быть ответственный';
  }
  if (activeStatus && data.type === 'RISK' && score >= 15 && !data.mitigationPlan?.trim()) {
    return 'У высокого риска должен быть план снижения';
  }
  if (data.linkedRiskId) {
    const linked = await prisma.raidItem.findUnique({ where: { id: data.linkedRiskId } });
    if (!linked || linked.projectId !== projectId || linked.type !== 'RISK' || linked.id === itemId) {
      return 'Связанный риск должен быть риском из того же проекта';
    }
  }
  return null;
}

router.post('/projects/:projectId/raid-items', async (req, res) => {
  const parsed = raidItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const validationError = await validateRaidItem(project.id, parsed.data);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const raidItem = await prisma.raidItem.create({
    data: {
      projectId: project.id,
      ...raidPayload(parsed.data),
      statusUpdates: parsed.data.description.trim()
        ? {
            create: {
              statusAt: new Date(),
              text: parsed.data.description.trim(),
            },
          }
        : undefined,
    },
    include: {
      statusUpdates: { orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }] },
    },
  });

  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'raid_item.create',
    objectType: 'RaidItem',
    objectId: raidItem.id,
    projectId: project.id,
    afterValue: raidItem,
    changes: buildAuditFieldChanges({}, raidItem, raidAuditFields),
  });
  await emitWebhookEvent({
    eventType: 'risk.created',
    projectId: project.id,
    payload: { item: raidItem },
  }).catch(() => undefined);
  res.status(201).json(raidItem);
});

router.patch('/raid-items/:itemId', async (req, res) => {
  const parsed = raidItemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.raidItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) {
    res.status(404).json({ error: 'Запись о риске не найдена' });
    return;
  }

  const merged = {
    type: parsed.data.type ?? existing.type,
    title: parsed.data.title ?? existing.title,
    description: parsed.data.description ?? existing.description,
    owner: parsed.data.owner ?? existing.owner,
    status: parsed.data.status ?? existing.status,
    probability: parsed.data.probability ?? existing.probability,
    impact: parsed.data.impact ?? existing.impact,
    mitigationPlan: parsed.data.mitigationPlan === undefined ? existing.mitigationPlan : parsed.data.mitigationPlan,
    contingencyPlan:
      parsed.data.contingencyPlan === undefined ? existing.contingencyPlan : parsed.data.contingencyPlan,
    dueDate: parsed.data.dueDate === undefined ? existing.dueDate?.toISOString().slice(0, 10) : parsed.data.dueDate,
    residualRisk: parsed.data.residualRisk ?? existing.residualRisk,
    validationDate:
      parsed.data.validationDate === undefined
        ? existing.validationDate?.toISOString().slice(0, 10)
        : parsed.data.validationDate,
    linkedRiskId: parsed.data.linkedRiskId === undefined ? existing.linkedRiskId : parsed.data.linkedRiskId,
    dependencyType: parsed.data.dependencyType === undefined ? existing.dependencyType : parsed.data.dependencyType,
    predecessor: parsed.data.predecessor === undefined ? existing.predecessor : parsed.data.predecessor,
    successor: parsed.data.successor === undefined ? existing.successor : parsed.data.successor,
    supplier: parsed.data.supplier === undefined ? existing.supplier : parsed.data.supplier,
    jiraTicketKey: parsed.data.jiraTicketKey === undefined ? existing.jiraTicketKey : parsed.data.jiraTicketKey,
    jiraTicketUrl: parsed.data.jiraTicketUrl === undefined ? existing.jiraTicketUrl : parsed.data.jiraTicketUrl,
    decisionRequired: parsed.data.decisionRequired ?? existing.decisionRequired,
    escalationLevel: parsed.data.escalationLevel ?? existing.escalationLevel,
    scheduleImpactDays: parsed.data.scheduleImpactDays ?? existing.scheduleImpactDays,
    budgetImpact: parsed.data.budgetImpact ?? Number(existing.budgetImpact),
  };

  const validationError = await validateRaidItem(existing.projectId, merged, existing.id);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const updated = await prisma.raidItem.update({
    where: { id: existing.id },
    data: raidPayload(merged),
    include: {
      statusUpdates: { orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }] },
    },
  });

  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'raid_item.update',
    objectType: 'RaidItem',
    objectId: existing.id,
    projectId: existing.projectId,
    beforeValue: existing,
    afterValue: updated,
    metadata: { changedFields: Object.keys(parsed.data) },
    changes: buildAuditFieldChanges(existing, updated, raidAuditFields),
  });
  await emitWebhookEvent({
    eventType: 'risk.updated',
    projectId: existing.projectId,
    payload: { before: existing, after: updated },
  }).catch(() => undefined);
  res.json(updated);
});

router.post('/raid-items/:itemId/status-updates', async (req, res) => {
  const parsed = raidItemStatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.raidItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) {
    res.status(404).json({ error: 'Запись о риске не найдена' });
    return;
  }

  const statusAt = new Date(parsed.data.statusAt);
  if (Number.isNaN(statusAt.getTime())) {
    res.status(400).json({ error: 'Некорректная дата статуса' });
    return;
  }

  const update = await prisma.raidItemStatusUpdate.create({
    data: {
      raidItemId: existing.id,
      statusAt,
      text: parsed.data.text,
    },
  });

  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'raid_item.status_update.create',
    objectType: 'RaidItemStatusUpdate',
    objectId: update.id,
    projectId: existing.projectId,
    afterValue: update,
    metadata: { raidItemId: existing.id },
    changes: buildAuditFieldChanges({}, update, ['statusAt', 'text']),
  });
  await emitWebhookEvent({
    eventType: 'risk.status_updated',
    projectId: existing.projectId,
    payload: { itemId: existing.id, statusUpdate: update },
  }).catch(() => undefined);
  res.status(201).json(update);
});

router.delete('/raid-items/:itemId', async (req, res) => {
  const existing = await prisma.raidItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) {
    res.status(404).json({ error: 'Запись о риске не найдена' });
    return;
  }

  await prisma.raidItem.delete({ where: { id: existing.id } });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'raid_item.delete',
    objectType: 'RaidItem',
    objectId: existing.id,
    projectId: existing.projectId,
    beforeValue: existing,
  });
  await emitWebhookEvent({
    eventType: 'risk.deleted',
    projectId: existing.projectId,
    payload: { before: existing },
  }).catch(() => undefined);
  res.status(204).send();
});

const changeRequestSchema = z.object({
  type: z.enum(['SCOPE', 'BUDGET', 'SCHEDULE', 'RESOURCE']),
  title: z.string().trim().min(3),
  description: z.string().trim().min(3),
  owner: z.string().trim().min(1),
  status: z.enum(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED']).default('DRAFT'),
  impactAnalysis: z.string().trim().min(3),
  affectedBaseline: z.string().trim().min(1),
  implementationPlan: z.string().trim().optional().nullable(),
  scheduleImpactDays: z.coerce.number().int().default(0),
  budgetImpact: z.coerce.number().default(0),
  scopeImpact: z.string().trim().optional().nullable(),
  approvalRoute: z.string().trim().min(1).default('Проектный офис -> Спонсор'),
  decisionRequired: z.boolean().default(false),
  dueDate: z.string().trim().optional().nullable(),
});

function changeRequestPayload(data: z.infer<typeof changeRequestSchema>) {
  return {
    ...data,
    implementationPlan: data.implementationPlan || null,
    scopeImpact: data.scopeImpact || null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    budgetImpact: data.budgetImpact,
    approvedAt: data.status === 'APPROVED' ? new Date() : undefined,
  };
}

router.post('/projects/:projectId/change-requests', async (req, res) => {
  const parsed = changeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const changeRequest = await prisma.changeRequest.create({
    data: {
      projectId: project.id,
      ...changeRequestPayload(parsed.data),
    },
  });

  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'change_request.create',
    objectType: 'ChangeRequest',
    objectId: changeRequest.id,
    projectId: project.id,
    afterValue: changeRequest,
    changes: buildAuditFieldChanges({}, changeRequest, changeRequestAuditFields),
  });
  await emitWebhookEvent({
    eventType: 'change_request.created',
    projectId: project.id,
    payload: { changeRequest },
  }).catch(() => undefined);
  res.status(201).json(changeRequest);
});

router.patch('/change-requests/:requestId', async (req, res) => {
  const parsed = changeRequestSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.changeRequest.findUnique({ where: { id: req.params.requestId } });
  if (!existing) {
    res.status(404).json({ error: 'Запрос на изменение не найден' });
    return;
  }

  const nextStatus = parsed.data.status ?? existing.status;
  const updated = await prisma.changeRequest.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      implementationPlan:
        parsed.data.implementationPlan === undefined ? undefined : parsed.data.implementationPlan || null,
      scopeImpact: parsed.data.scopeImpact === undefined ? undefined : parsed.data.scopeImpact || null,
      dueDate: parsed.data.dueDate === undefined ? undefined : parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      budgetImpact: parsed.data.budgetImpact,
      approvedAt:
        nextStatus === 'APPROVED' && existing.status !== 'APPROVED'
          ? new Date()
          : parsed.data.status && nextStatus !== 'APPROVED'
            ? null
            : undefined,
    },
  });

  if (nextStatus === 'APPROVED' && existing.status !== 'APPROVED') {
    await prisma.project.update({
      where: { id: existing.projectId },
      data: {
        scheduleVariance: { increment: updated.scheduleImpactDays },
        budgetForecast: { increment: updated.budgetImpact },
      },
    });
  }

  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'change_request.update',
    objectType: 'ChangeRequest',
    objectId: existing.id,
    projectId: existing.projectId,
    beforeValue: existing,
    afterValue: updated,
    metadata: { changedFields: Object.keys(parsed.data) },
    changes: buildAuditFieldChanges(existing, updated, changeRequestAuditFields),
  });
  await emitWebhookEvent({
    eventType: 'change_request.updated',
    projectId: existing.projectId,
    payload: { before: existing, after: updated },
  }).catch(() => undefined);
  res.json(updated);
});

router.delete('/change-requests/:requestId', async (req, res) => {
  const existing = await prisma.changeRequest.findUnique({ where: { id: req.params.requestId } });
  if (!existing) {
    res.status(404).json({ error: 'Запрос на изменение не найден' });
    return;
  }

  await prisma.changeRequest.delete({ where: { id: existing.id } });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'change_request.delete',
    objectType: 'ChangeRequest',
    objectId: existing.id,
    projectId: existing.projectId,
    beforeValue: existing,
  });
  await emitWebhookEvent({
    eventType: 'change_request.deleted',
    projectId: existing.projectId,
    payload: { before: existing },
  }).catch(() => undefined);
  res.status(204).send();
});

  return router;
}
