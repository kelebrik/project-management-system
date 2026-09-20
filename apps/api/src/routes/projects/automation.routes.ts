import type { Request, Router } from 'express';
import { z } from 'zod';
import { PUBLIC_DEMO_USER_ID, type WeeklyBrief, type WeeklyBriefWarning } from '@pms/shared';
import { prisma } from '../../db.js';
import { currentUser, isPublicDemoMode } from '../../server/auth.js';
import { readableProjectWhere } from '../../server/business-units.js';
import { userProjectAccessLevelMap } from '../../server/project-access.js';
import { projectModulesConfig } from '../admin/project-modules.js';
import { projectInsights, scheduleScenario } from '../../services/project-automation.js';
import { briefFields, commandChanges, journalChange } from '../../services/weekly-brief.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
export const scenarioPatchesSchema = z.array(z.object({
  id: z.string().min(1).max(100), startDate: day.optional(), dueDate: day.optional(), workDays: z.number().int().min(1).max(3650).optional(),
}).strict().refine((item) => item.startDate || item.dueDate || item.workDays !== undefined, 'Укажите дату или длительность')
  .refine((item) => !(item.workDays !== undefined && item.dueDate), 'Меняйте длительность или окончание, не оба поля одновременно')
  .refine((item) => !item.startDate || !item.dueDate || item.startDate <= item.dueDate, 'Окончание раньше начала'))
  .max(20).refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Работы не должны повторяться');

export async function automationProjects(req: Request, projectId?: string, publicDemoMode = isPublicDemoMode()) {
  const user = currentUser(req);
  if (!user) return [];
  const projects = await prisma.project.findMany({ where: { ...(await readableProjectWhere(req)), ...(projectId ? { id: projectId } : {}) }, select: { id: true, code: true, name: true } });
  if (user.role === 'ADMIN' || (publicDemoMode && user.id === PUBLIC_DEMO_USER_ID)) return projects;
  // Business reports expose historical data: deliberately stricter than legacy project reads.
  const access = await userProjectAccessLevelMap(user.id, projects.map((project) => project.id));
  return projects.filter((project) => access.has(project.id));
}

export function registerProjectAutomationRoutes(router: Router) {
  router.get('/projects/:projectId/automation/insights', async (req, res) => {
    const [project] = await automationProjects(req, req.params.projectId);
    if (!project) { res.status(404).json({ error: 'Проект недоступен' }); return; }
    const modules = await projectModulesConfig();
    const enabled = (key: string) => modules.some((module) => module.key === key && module.enabled);
    const [items, dependencies, issues, risks, milestones, snapshots] = await Promise.all([
      prisma.wbsItem.findMany({ where: { projectId: project.id }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      prisma.wbsDependency.findMany({ where: { projectId: project.id } }),
      enabled('issues') ? prisma.issue.findMany({ where: { projectId: project.id } }) : [],
      enabled('raid') ? prisma.raidItem.findMany({ where: { projectId: project.id } }) : [],
      prisma.milestone.findMany({ where: { projectId: project.id } }),
      enabled('jiraWork') ? prisma.jiraIssueSnapshot.findMany({ where: { projectId: project.id, retiredAt: null } }) : [],
    ]);
    const result = projectInsights({ code: project.code, items, dependencies, issues, risks, milestones, snapshots });
    if (!enabled('overview') || !enabled('structure')) result.readiness = [];
    if (!enabled('jiraWork') || !enabled('structure')) result.reconciliation = [];
    if (!enabled('issues') || !enabled('raid')) result.readiness.forEach((row) => {
      row.warnings.push('Проверка не включает отключенные реестры вопросов или рисков');
      if (row.state === 'ready') row.state = 'unknown';
    });
    res.json(result);
  });

  router.get('/projects/:projectId/automation/scenario', async (req, res) => {
    const [project] = await automationProjects(req, req.params.projectId);
    if (!project) { res.status(404).json({ error: 'Проект недоступен' }); return; }
    if (!(await projectModulesConfig()).some((module) => module.key === 'gantt' && module.enabled)) { res.status(404).json({ error: 'Модуль отключен' }); return; }
    const raw = req.query.patches ?? '[]';
    if (typeof raw !== 'string' || raw.length > 4000) { res.status(400).json({ error: 'Слишком большой сценарий: максимум 20 работ' }); return; }
    let value: unknown;
    try { value = JSON.parse(raw); } catch { res.status(400).json({ error: 'Некорректный сценарий' }); return; }
    const parsed = scenarioPatchesSchema.safeParse(value);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const [items, dependencies, calendars] = await Promise.all([
      prisma.wbsItem.findMany({ where: { projectId: project.id }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      prisma.wbsDependency.findMany({ where: { projectId: project.id } }),
      prisma.projectCalendarOverride.findMany({ where: { projectId: project.id } }),
    ]);
    try { res.json(scheduleScenario(project.code, items, dependencies, calendars, parsed.data)); }
    catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : 'Не удалось рассчитать сценарий' }); }
  });

  router.get('/reports/weekly-brief', async (req, res) => {
    const parsed = z.object({ days: z.coerce.number().int().min(1).max(90).default(7), projectId: z.string().max(100).optional() }).safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Период должен быть от 1 до 90 дней' }); return; }
    const projects = await automationProjects(req, parsed.data.projectId);
    const byId = new Map(projects.map((project) => [project.id, project]));
    const ids = projects.map((project) => project.id);
    const to = new Date(); const from = new Date(to.getTime() - parsed.data.days * 86400000);
    const modules = await projectModulesConfig();
    const enabled = (key: string) => modules.some((module) => module.key === key && module.enabled);
    const journalTypes = Object.entries(briefFields).filter(([type]) => type === 'Issue' ? enabled('issues') : type === 'RaidItem' ? enabled('raid') : type === 'Project' && enabled('overview'));
    const deletedObjectTitle = (objectType: string) =>
      objectType === 'Issue' ? { token: 'deletedIssue' as const } : { token: 'deletedRisk' as const };
    const limit = 2000;
    const [journal, commands] = await Promise.all([
      prisma.auditEventChange.findMany({ where: { projectId: { in: ids }, createdAt: { gte: from, lte: to }, OR: journalTypes.map(([objectType, fields]) => ({ objectType, field: { in: [...fields] } })) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        select: { id: true, projectId: true, objectType: true, objectId: true, field: true, oldText: true, newText: true, createdAt: true, actor: { select: { name: true } } } }),
      prisma.wbsCommand.findMany({ where: { projectId: { in: enabled('structure') ? ids : [] }, createdAt: { gte: from, lte: to } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        select: { id: true, projectId: true, createdAt: true, type: true, beforeSnapshot: true, afterSnapshot: true, payload: true, user: { select: { name: true } } } }),
    ]);
    const [issueTitles, riskTitles] = await Promise.all([
      prisma.issue.findMany({ where: { projectId: { in: ids }, id: { in: journal.filter((row) => row.objectType === 'Issue').map((row) => row.objectId).filter((id): id is string => Boolean(id)) } }, select: { id: true, title: true } }),
      prisma.raidItem.findMany({ where: { projectId: { in: ids }, id: { in: journal.filter((row) => row.objectType === 'RaidItem').map((row) => row.objectId).filter((id): id is string => Boolean(id)) } }, select: { id: true, title: true } }),
    ]);
    const titles = new Map([...issueTitles, ...riskTitles].map((row) => [row.id, row.title]));
    const changes = [
      ...journal.slice(0, limit).flatMap((row) => {
        const project = byId.get(row.projectId!);
        if (!project) return [];
        const knownTitle = row.objectType === 'Project' ? project.name : titles.get(row.objectId ?? '');
        const change = journalChange(
          row,
          project.code,
          row.actor?.name ? { name: row.actor.name } : { token: 'unknown' },
          knownTitle ? { text: knownTitle } : deletedObjectTitle(row.objectType),
        );
        return change ? [change] : [];
      }),
      ...commands.slice(0, limit).flatMap((command) => commandChanges(command, byId.get(command.projectId)!.code,
        command.user?.name ? { name: command.user.name } : { token: 'unknownOrAutomatic' })),
    ];
    const warnings: WeeklyBriefWarning[] = ['recordedHistoryOnly'];
    if (!projects.length) warnings.push('noAccessibleProjects');
    if (journal.length > limit || commands.length > limit || changes.length > 5000) warnings.push('tooManyChanges');
    res.json({ from: from.toISOString(), to: to.toISOString(), projectCount: projects.length, changes: changes.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5000), warnings } satisfies WeeklyBrief);
  });
}
