import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { JIRA_EXTRA_FIELDS_MAX, isJiraFieldId, jiraKnownFieldIds } from '../jira-attributes.js';
import { currentUser } from '../server/auth.js';
import { recordAuditEvent } from '../services/audit.js';
import { jiraFieldCatalogList } from '../services/jira-field-catalog.js';

const extraFieldsSchema = z.object({ fieldIds: z.array(z.string().trim().min(1).max(100)).max(JIRA_EXTRA_FIELDS_MAX) });

/**
 * The extra Jira fields kept with each issue of a project, picked by a system
 * administrator from the fields Jira's search answers have named. A change
 * applies from the next sync; nothing is asked of Jira here.
 */
export function registerJiraFieldRoutes(router: Router) {
  router.get('/projects/:projectId/jira/extra-fields', async (req, res) => {
    if (currentUser(req)?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Поля Jira выбирает системный администратор' });
      return;
    }
    const settings = await prisma.jiraAnalyticsSettings.findUnique({ where: { projectId: String(req.params.projectId) }, select: { fieldCatalog: true, extraFieldIds: true } });
    const catalog = jiraFieldCatalogList(settings?.fieldCatalog);
    res.json({
      catalog,
      selected: settings?.extraFieldIds ?? [],
      known: jiraKnownFieldIds(Object.fromEntries(catalog.map((field) => [field.id, field.name]))),
      max: JIRA_EXTRA_FIELDS_MAX,
    });
  });

  router.put('/projects/:projectId/jira/extra-fields', async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Поля Jira выбирает системный администратор' });
      return;
    }
    const parsed = extraFieldsSchema.safeParse(req.body ?? {});
    const fieldIds = parsed.success ? [...new Set(parsed.data.fieldIds)] : [];
    if (!parsed.success || fieldIds.some((id) => !isJiraFieldId(id))) {
      res.status(400).json({ error: `Выберите не больше ${JIRA_EXTRA_FIELDS_MAX} полей Jira` });
      return;
    }
    const project = await prisma.project.findUnique({ where: { id: String(req.params.projectId) }, select: { id: true, status: true, jiraAnalyticsSettings: { select: { extraFieldIds: true } } } });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    if (project.status === 'CLOSED') {
      res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
      return;
    }
    if (!project.jiraAnalyticsSettings) {
      res.status(409).json({ error: 'Сначала подключите Jira к проекту' });
      return;
    }
    await prisma.jiraAnalyticsSettings.update({ where: { projectId: project.id }, data: { extraFieldIds: fieldIds } });
    await recordAuditEvent({ req, actor: user, action: 'jira.extra_fields.update', objectType: 'JiraAnalyticsSettings', objectId: project.id, projectId: project.id, beforeValue: { extraFieldIds: project.jiraAnalyticsSettings.extraFieldIds }, afterValue: { extraFieldIds: fieldIds } });
    res.json({ selected: fieldIds });
  });
}
