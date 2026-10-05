import { Router, type Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { fetchJiraIssuesWithMeta, isJiraConfigured, jiraLoginFromEmail } from '../jira.js';
import { currentUser } from '../server/auth.js';
import { readableProjectWhere } from '../server/business-units.js';
import { recordAuditEvent } from '../services/audit.js';
import { MY_JIRA_TASKS_LIMIT, cachedSearch, forgetCachedSearches, groupTasksByProject, jiraLoginPattern, labelledProjects, myJiraTasksJql } from '../services/my-jira-tasks.js';

const loginSchema = z.object({ login: z.string().trim().max(100).nullable() });

/**
 * "My tasks in Jira" on the My work page. Jira is only read: one search per
 * Jira for the open issues assigned to the user with the label of a readable
 * open project. The login is the part of the e-mail before @ unless the user
 * set another one.
 */
/** Each person asks Jira at most this often; changing the login does not get around it. */
export const MY_JIRA_RATE_LIMIT_PER_MINUTE = 10;

export function createMyJiraRouter() {
  const router = Router();
  // Built per router so separate apps (tests) keep separate counters.
  const perUser = rateLimit({
    windowMs: 60_000,
    limit: MY_JIRA_RATE_LIMIT_PER_MINUTE,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req: Request) => currentUser(req)?.id ?? ipKeyGenerator(req.ip ?? ''),
    message: { error: 'Слишком много запросов задач Jira. Повторите через минуту.' },
  });

  router.get('/my-work/jira', perUser, async (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    const stored = await prisma.user.findUnique({ where: { id: user.id }, select: { jiraLogin: true, email: true } });
    const defaultLogin = jiraLoginFromEmail(stored?.email ?? user.email ?? '');
    const login = stored?.jiraLogin || defaultLogin;
    const base = { login, defaultLogin, customLogin: Boolean(stored?.jiraLogin) };
    // The public demo and builds without Jira never call it.
    if (!isJiraConfigured()) {
      res.json({ ...base, status: 'NOT_CONFIGURED', groups: [] });
      return;
    }
    if (!jiraLoginPattern.test(login)) {
      res.json({ ...base, status: 'NO_LOGIN', groups: [] });
      return;
    }
    const projects = await prisma.project.findMany({
      where: { status: { not: 'CLOSED' }, ...(await readableProjectWhere(req)), jiraAnalyticsSettings: { jiraScopeType: 'LABEL' } },
      select: { id: true, code: true, name: true, jiraAnalyticsSettings: { select: { jiraScopeType: true, jiraScopeValue: true } }, jiraIntegration: { select: { baseUrl: true } } },
      orderBy: { code: 'asc' },
    });
    // Projects pointing at another Jira are searched there; most share the default one.
    const byJira = new Map<string, typeof projects>();
    for (const project of projects) {
      const baseUrl = project.jiraIntegration?.baseUrl.trim() ?? '';
      byJira.set(baseUrl, [...(byJira.get(baseUrl) ?? []), project]);
    }
    try {
      const groups = [];
      let truncated = false;
      let cached = true;
      for (const [baseUrl, inJira] of byJira) {
        const labelled = labelledProjects(inJira.map((project) => ({ id: project.id, code: project.code, name: project.name, scopeType: project.jiraAnalyticsSettings!.jiraScopeType, scopeValue: project.jiraAnalyticsSettings!.jiraScopeValue })));
        const labels = labelled.flatMap((project) => project.labels);
        if (labels.length === 0) continue;
        const jql = myJiraTasksJql(labels, login);
        const answer = await cachedSearch(`${baseUrl}|${login}|${jql}`, Date.now(), () =>
          fetchJiraIssuesWithMeta(jql, { baseUrl: baseUrl || undefined, pageSize: MY_JIRA_TASKS_LIMIT, includeChangelog: false, includeRemoteDevelopment: false }),
        );
        truncated ||= answer.truncated;
        cached &&= answer.cached;
        groups.push(...groupTasksByProject(labelled, answer.issues));
      }
      res.json({ ...base, status: 'OK', groups, truncated, cached });
    } catch (error) {
      console.warn('My Jira tasks search failed', error instanceof Error ? error.message : error);
      res.json({ ...base, status: 'FAILED', groups: [] });
    }
  });

  /** One's own Jira login; empty goes back to the part of the e-mail before @. */
  router.put('/my-work/jira-login', perUser, async (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    const body = loginSchema.safeParse(req.body ?? {});
    const login = body.success && body.data.login ? body.data.login : null;
    if (!body.success || (login && !jiraLoginPattern.test(login))) {
      res.status(400).json({ error: 'Логин Jira — латинские буквы, цифры и . _ - + @, до 100 символов' });
      return;
    }
    const before = await prisma.user.findUnique({ where: { id: user.id }, select: { jiraLogin: true } });
    if (!before) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { jiraLogin: login } });
    if (before.jiraLogin) forgetCachedSearches(before.jiraLogin);
    await recordAuditEvent({ req, actor: user, action: 'user.jira_login', objectType: 'User', objectId: user.id, beforeValue: { jiraLogin: before.jiraLogin }, afterValue: { jiraLogin: login } });
    res.json({ login });
  });

  return router;
}
